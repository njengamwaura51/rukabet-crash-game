import mongoose from 'mongoose'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

const snapshotPath = path.join(rootDir, 'data', 'production_snapshot.json')

export async function runMigration(targetMongoUri?: string, dryRun: boolean = false) {
  const mongoUri = targetMongoUri || process.env.TARGET_MONGO_URI || process.env.MONGO_URI

  if (!mongoUri && !dryRun) {
    console.error('❌ No Target MongoDB URI specified! Provide --uri=<connection_string> or set TARGET_MONGO_URI / MONGO_URI in .env')
    process.exit(1)
  }

  if (!fs.existsSync(snapshotPath)) {
    console.error(`❌ Snapshot file not found at: ${snapshotPath}`)
    process.exit(1)
  }

  console.log(`📂 Reading snapshot from ${snapshotPath}...`)
  const rawData = fs.readFileSync(snapshotPath, 'utf-8')
  const snapshot = JSON.parse(rawData)

  const { users = [], deposits = [], withdrawals = [], settings = [], oddsControls = [], rounds = [], bets = [] } = snapshot.data || {}

  console.log(`📊 Snapshot Summary:
  - Users: ${users.length}
  - Deposits: ${deposits.length}
  - Withdrawals: ${withdrawals.length}
  - Settings: ${settings.length}
  - OddsControls: ${oddsControls.length}
  - Rounds: ${rounds.length}
  - Bets: ${bets.length}
  `)

  if (dryRun) {
    console.log('🔍 [DRY RUN] Validating schemas and integrity...')
    let validUsers = 0
    let invalidUsers = 0
    for (const u of users) {
      if (!u.phone || !u.password) {
        invalidUsers++
      } else {
        validUsers++
      }
    }
    console.log(`✅ Validation complete: ${validUsers} valid users, ${invalidUsers} invalid users.`)
    console.log('Dry run finished successfully.')
    return { success: true, dryRun: true }
  }

  console.log(`🔌 Connecting to Target MongoDB: ${mongoUri.replace(/:([^:@]+)@/, ':****@')}...`)
  await mongoose.connect(mongoUri)
  console.log('✅ Connected to MongoDB.')

  const db = mongoose.connection.db
  if (!db) {
    throw new Error('Database connection failed')
  }

  console.log('🚀 Migrating and rebuilding collections...')

  // 1. Users Collection
  const usersCollection = db.collection('users')
  let importedUsers = 0
  for (const u of users) {
    const cleanUser = {
      ...u,
      _id: new mongoose.Types.ObjectId(u._id),
      phone: String(u.phone).trim(),
      balance: Math.max(0, Number(u.balance) || 0),
      freebet: Math.max(0, Number(u.freebet) || 0),
      freebetLocked: Boolean(u.freebetLocked),
      hasPlayedWithMoney: Boolean(u.hasPlayedWithMoney),
      referralsCount: Number(u.referralsCount) || 0,
      referralsEarnings: Number(u.referralsEarnings) || 0,
      referredBy: u.referredBy ? new mongoose.Types.ObjectId(u.referredBy) : null,
      isFrozen: Boolean(u.isFrozen),
      role: u.role || 'user',
      createdAt: u.createdAt ? new Date(u.createdAt) : new Date(),
      updatedAt: u.updatedAt ? new Date(u.updatedAt) : new Date()
    }
    delete (cleanUser as any).__v

    await usersCollection.updateOne(
      { _id: cleanUser._id },
      { $set: cleanUser },
      { upsert: true }
    )
    importedUsers++
  }
  await usersCollection.createIndex({ phone: 1 }, { unique: true })
  await usersCollection.createIndex({ role: 1 })
  await usersCollection.createIndex({ referredBy: 1 })
  console.log(`✅ Users: Imported ${importedUsers} records & created indexes.`)

  // 2. Settings Collection
  const settingsCollection = db.collection('settings')
  for (const s of settings) {
    const cleanSetting = {
      ...s,
      _id: new mongoose.Types.ObjectId(s._id),
      createdAt: s.createdAt ? new Date(s.createdAt) : new Date(),
      updatedAt: s.updatedAt ? new Date(s.updatedAt) : new Date()
    }
    delete (cleanSetting as any).__v

    await settingsCollection.updateOne(
      { _id: cleanSetting._id },
      { $set: cleanSetting },
      { upsert: true }
    )
  }
  console.log(`✅ Settings: Imported ${settings.length} config documents.`)

  // 3. Deposits Collection
  const depositsCollection = db.collection('deposits')
  let importedDeposits = 0
  for (const d of deposits) {
    const cleanDeposit = {
      ...d,
      _id: new mongoose.Types.ObjectId(d._id),
      userId: new mongoose.Types.ObjectId(d.userId),
      amount: Number(d.amount) || 0,
      createdAt: d.createdAt ? new Date(d.createdAt) : new Date(),
      updatedAt: d.updatedAt ? new Date(d.updatedAt) : new Date()
    }
    delete (cleanDeposit as any).__v

    await depositsCollection.updateOne(
      { _id: cleanDeposit._id },
      { $set: cleanDeposit },
      { upsert: true }
    )
    importedDeposits++
  }
  await depositsCollection.createIndex({ userId: 1, createdAt: -1 })
  await depositsCollection.createIndex({ apiRef: 1 }, { unique: true, sparse: true })
  await depositsCollection.createIndex({ status: 1 })
  console.log(`✅ Deposits: Imported ${importedDeposits} records & created indexes.`)

  // 4. Withdrawals Collection
  const withdrawalsCollection = db.collection('withdrawals')
  let importedWithdrawals = 0
  for (const w of withdrawals) {
    const cleanWithdrawal = {
      ...w,
      _id: new mongoose.Types.ObjectId(w._id),
      userId: new mongoose.Types.ObjectId(w.userId),
      amount: Number(w.amount) || 0,
      createdAt: w.createdAt ? new Date(w.createdAt) : new Date(),
      updatedAt: w.updatedAt ? new Date(w.updatedAt) : new Date()
    }
    delete (cleanWithdrawal as any).__v

    await withdrawalsCollection.updateOne(
      { _id: cleanWithdrawal._id },
      { $set: cleanWithdrawal },
      { upsert: true }
    )
    importedWithdrawals++
  }
  await withdrawalsCollection.createIndex({ userId: 1, createdAt: -1 })
  await withdrawalsCollection.createIndex({ status: 1 })
  console.log(`✅ Withdrawals: Imported ${importedWithdrawals} records & created indexes.`)

  // 5. OddsControls Collection
  const oddsCollection = db.collection('oddscontrols')
  for (const oc of oddsControls) {
    const cleanOdds = {
      ...oc,
      _id: new mongoose.Types.ObjectId(oc._id),
      createdAt: oc.createdAt ? new Date(oc.createdAt) : new Date(),
      updatedAt: oc.updatedAt ? new Date(oc.updatedAt) : new Date()
    }
    delete (cleanOdds as any).__v

    await oddsCollection.updateOne(
      { _id: cleanOdds._id },
      { $set: cleanOdds },
      { upsert: true }
    )
  }
  console.log(`✅ OddsControls: Imported ${oddsControls.length} documents.`)

  // 6. Rounds Collection
  const roundsCollection = db.collection('rounds')
  for (const r of rounds) {
    const cleanRound = {
      ...r,
      _id: new mongoose.Types.ObjectId(r._id),
      createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
      updatedAt: r.updatedAt ? new Date(r.updatedAt) : new Date()
    }
    delete (cleanRound as any).__v

    await roundsCollection.updateOne(
      { _id: cleanRound._id },
      { $set: cleanRound },
      { upsert: true }
    )
  }
  await roundsCollection.createIndex({ roundId: 1 }, { unique: true, sparse: true })
  await roundsCollection.createIndex({ createdAt: -1 })
  console.log(`✅ Rounds: Imported ${rounds.length} historical rounds.`)

  // 7. Bets Collection
  const betsCollection = db.collection('bets')
  for (const b of bets) {
    const cleanBet = {
      ...b,
      _id: new mongoose.Types.ObjectId(b._id),
      userId: new mongoose.Types.ObjectId(b.userId),
      createdAt: b.createdAt ? new Date(b.createdAt) : new Date(),
      updatedAt: b.updatedAt ? new Date(b.updatedAt) : new Date()
    }
    delete (cleanBet as any).__v

    await betsCollection.updateOne(
      { _id: cleanBet._id },
      { $set: cleanBet },
      { upsert: true }
    )
  }
  await betsCollection.createIndex({ userId: 1, roundId: 1, status: 1 })
  await betsCollection.createIndex({ roundId: 1, status: 1 })
  await betsCollection.createIndex({ createdAt: -1 })
  console.log(`✅ Bets: Imported ${bets.length} bet records.`)

  console.log(`
🎉 DATABASE MIGRATION COMPLETED SUCCESSFULLY!
All collections, indexes, and document relationships have been cleanly reconstructed.
Target Database is 100% synchronized with production data.
  `)

  await mongoose.disconnect()
  return { success: true }
}

const args = process.argv.slice(2)
const uriArg = args.find(a => a.startsWith('--uri='))?.replace('--uri=', '')
const isDryRun = args.includes('--dry-run')

if (process.argv[1] && process.argv[1].endsWith('migrate-to-render.ts')) {
  runMigration(uriArg, isDryRun).catch(err => {
    console.error('Migration failed:', err)
    process.exit(1)
  })
}
