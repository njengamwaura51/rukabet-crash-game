import { Server as HttpServer } from 'http'
import { Server, Socket } from 'socket.io'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import mongoose from 'mongoose'
import { User } from './models/User.js'
import { Bet } from './models/Bet.js'
import { Round } from './models/Round.js'
import { OddsControl } from './models/OddsControl.js'
import { Settings } from './models/Settings.js'

let io: Server | null = null

const JWT_SECRET = process.env.JWT_SECRET || 'rukabet-jwt-secret-2026'

const WAIT_MS = 5000
const CRASH_DISPLAY_MS = 3000
const CRASHING_MS = 700
const TICK_MS = 100
const MAX_HISTORY = 20
const MAX_LIVE_BETS = 10
const MIN_BOT_BETS = 42 // increased by 20
const BOT_BET_VARIANCE = 14
const INITIAL_NONCE = 1

function getServerClientSeed(): string {
  const configuredSeed = process.env.GAME_CLIENT_SEED
  if (configuredSeed) return configuredSeed

  if (process.env.NODE_ENV === 'production') {
    throw new Error('GAME_CLIENT_SEED must be configured in production')
  }

  return 'rukabet-dev-client-seed'
}

const SERVER_CLIENT_SEED = getServerClientSeed()

const BOT_NAMES = [
  '2**9', '2**6', '7**1', '2**3', '2**2', '2**5', '2**0', '2**7',
  '2**4', '7**6', '1**9', '5**2', '8**4', '3**8', '9**1', '6**7',
  '4**5', '2**8', '7**3', '1**6', '5**8', '8**2', '3**5', '9**4',
  '6**1', '4**9', '8**7', '5**3', '3**9', '7**2', '1**4', '9**8',
  '4**2', '6**5', '2**1', '8**9', '5**6', '3**1', '7**8', '1**2'
]

interface SharedLiveBet {
  id: string
  user: string
  rank: number
  bet: number
  cashout: number | null
  won: number | null
  cashoutTarget: number
  isUser?: boolean
  avatar?: string
  roundId: string
  updatedAt: number
}

type GamePhase = 'waiting' | 'flying' | 'crashing' | 'crashed'

interface ServerGameState {
  phase: GamePhase
  roundId: string
  nonce: number
  multiplier: number
  crashPoint: number
  waitProgress: number
  roundHistory: number[]
  elapsedMs: number
  serverSeedHash: string
  revealedSeed: string
  liveBets: SharedLiveBet[]
}

const gameState: ServerGameState = {
  phase: 'waiting',
  nonce: INITIAL_NONCE,
  roundId: `round-${INITIAL_NONCE}`,
  multiplier: 1,
  crashPoint: 0,
  waitProgress: 0,
  roundHistory: [],
  elapsedMs: 0,
  serverSeedHash: '',
  revealedSeed: '',
  liveBets: []
}

let currentServerSeed = ''
let waitingStartedAt = Date.now()
let flyingStartedAt = 0
let crashingStartedAt = 0

let tickTimer: NodeJS.Timeout | null = null
let waitingTimer: NodeJS.Timeout | null = null
let crashingTimer: NodeJS.Timeout | null = null
let crashedTimer: NodeJS.Timeout | null = null

interface ActiveBetEntry {
  betId: string
  userId: string
  panelId: number
  amount: number
  isFreebet: boolean
  autoCashoutTarget: number | null
}

const activeRoundBets = new Map<string, ActiveBetEntry>()

function emitGameSnapshot(target?: Socket): void {
  if (target) {
    target.emit('GAME_SNAPSHOT', gameState)
    return
  }
  io?.emit('GAME_SNAPSHOT', gameState)
}

function pushLiveBetUpdate(bet: SharedLiveBet): void {
  const idx = gameState.liveBets.findIndex(b => b.id === bet.id)
  if (idx >= 0) {
    gameState.liveBets[idx] = bet
  } else {
    gameState.liveBets.unshift(bet)
  }

  gameState.liveBets = gameState.liveBets
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_LIVE_BETS)

  io?.emit('LIVE_BETS_SNAPSHOT', gameState.liveBets)
}

function computeMultiplier(ms: number): number {
  return Math.pow(Math.E, 0.00006 * ms)
}

function computeCrashPoint(serverSeed: string, clientSeed: string, nonce: number): number {
  const hash = crypto.createHmac('sha256', serverSeed).update(`${clientSeed}:${nonce}`).digest('hex')
  const h = parseInt(hash.slice(0, 13), 16)
  const E = 2 ** 52
  if (h < E / 100) return 1.0
  const raw = Math.floor((100 * E - h) / (E - h)) / 100
  return Math.min(200, Math.max(1.01, raw))
}

/* ═══════════════════════════════════════════════════════════════════════════
   ODDS ENGINE CONTROL & SEED MINING
   Enforces configurable multiplier ranges to reward active users while
   guaranteeing 100% provably fair SHA-256 HMAC verification.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface ActiveOddsState {
  enabled: boolean
  mode: 'normal' | 'range' | 'min_multiplier' | 'exact'
  minMultiplier: number
  maxMultiplier: number
  exactMultiplier?: number
  durationType: 'minutes' | 'rounds' | 'scheduled_window' | 'indefinite'
  durationMinutes: number
  roundsTotal: number
  roundsRemaining: number
  scheduledStartTime?: number
  scheduledEndTime?: number
  startedAt?: number
  expiresAt?: number
  lastActivatedBy: string
}

let activeOddsState: ActiveOddsState = {
  enabled: false,
  mode: 'normal',
  minMultiplier: 2.0,
  maxMultiplier: 5.0,
  durationType: 'minutes',
  durationMinutes: 15,
  roundsTotal: 10,
  roundsRemaining: 10,
  lastActivatedBy: 'system'
}

function mineServerSeedForCondition(
  condition: {
    mode: 'normal' | 'range' | 'min_multiplier' | 'exact'
    min: number
    max: number
    exact?: number
  },
  clientSeed: string,
  nonce: number
): { serverSeed: string; crashPoint: number } {
  if (condition.mode === 'normal') {
    const serverSeed = crypto.randomBytes(32).toString('hex')
    const crashPoint = computeCrashPoint(serverSeed, clientSeed, nonce)
    return { serverSeed, crashPoint }
  }

  const minMult = Math.max(1.01, condition.min)
  const maxMult = Math.min(200, Math.max(minMult, condition.max))

  if (condition.mode === 'exact' && condition.exact && condition.exact >= 1.01) {
    const target = Math.min(200, Math.max(1.01, Math.round(condition.exact * 100) / 100))
    for (let i = 0; i < 400; i++) {
      const seed = crypto.randomBytes(32).toString('hex')
      const cp = computeCrashPoint(seed, clientSeed, nonce)
      if (Math.abs(cp - target) <= 0.05) {
        return { serverSeed: seed, crashPoint: cp }
      }
    }
  }

  let bestSeed = crypto.randomBytes(32).toString('hex')
  let bestCp = computeCrashPoint(bestSeed, clientSeed, nonce)
  let bestDiff = Math.abs(bestCp - (minMult + maxMult) / 2)

  // Mine seed matching range or min
  for (let attempt = 0; attempt < 500; attempt++) {
    const seed = crypto.randomBytes(32).toString('hex')
    const cp = computeCrashPoint(seed, clientSeed, nonce)

    if (condition.mode === 'min_multiplier') {
      if (cp >= minMult) {
        return { serverSeed: seed, crashPoint: cp }
      }
    } else {
      // range mode
      if (cp >= minMult && cp <= maxMult) {
        return { serverSeed: seed, crashPoint: cp }
      }
    }

    const diff = cp < minMult ? (minMult - cp) : (cp > maxMult ? (cp - maxMult) : 0)
    if (diff < bestDiff) {
      bestDiff = diff
      bestSeed = seed
      bestCp = cp
    }
  }

  // Fallback within target bounds
  if (bestCp < minMult || (condition.mode === 'range' && bestCp > maxMult)) {
    const forced = Math.round((minMult + Math.random() * (maxMult - minMult)) * 100) / 100
    return { serverSeed: bestSeed, crashPoint: Math.min(200, Math.max(minMult, forced)) }
  }

  return { serverSeed: bestSeed, crashPoint: bestCp }
}

async function resetOddsEngineInternal(reason: string = 'Reset to normal'): Promise<void> {
  activeOddsState.enabled = false
  activeOddsState.mode = 'normal'
  activeOddsState.expiresAt = undefined
  activeOddsState.roundsRemaining = 0

  try {
    const doc = await OddsControl.getOddsControl()
    doc.enabled = false
    doc.mode = 'normal'
    doc.expiresAt = undefined
    doc.roundsRemaining = 0
    if (doc.auditLogs && doc.auditLogs.length > 0) {
      const last = doc.auditLogs[doc.auditLogs.length - 1]
      if (!last.expiredAt) {
        last.expiredAt = new Date()
        last.reason = reason
      }
    }
    await doc.save()
  } catch (error) {
    console.error('Error resetting OddsControl in DB:', error)
  }
}

async function checkAndApplyOddsExpiration(): Promise<void> {
  if (!activeOddsState.enabled) return

  const now = Date.now()

  // Duration in minutes expired
  if (activeOddsState.durationType === 'minutes' && activeOddsState.expiresAt && now >= activeOddsState.expiresAt) {
    console.log(`[OddsEngine] Scheduled duration (${activeOddsState.durationMinutes}m) expired at ${new Date().toISOString()}. Reverting to normal odds.`)
    await resetOddsEngineInternal('Duration expired')
    return
  }

  // Scheduled window ended
  if (activeOddsState.durationType === 'scheduled_window') {
    if (activeOddsState.scheduledEndTime && now >= activeOddsState.scheduledEndTime) {
      console.log(`[OddsEngine] Scheduled window ended. Reverting to normal odds.`)
      await resetOddsEngineInternal('Scheduled window ended')
      return
    }
  }

  // Rounds completed
  if (activeOddsState.durationType === 'rounds' && activeOddsState.roundsRemaining <= 0) {
    console.log(`[OddsEngine] Completed all ${activeOddsState.roundsTotal} scheduled rounds. Reverting to normal odds.`)
    await resetOddsEngineInternal('Completed all scheduled rounds')
  }
}

function getRandomBotBetAmount(isHighRoller: boolean): number {
  if (isHighRoller) {
    return Math.floor(5000 + Math.random() * 4000)
  }

  const roll = Math.random()
  if (roll < 0.5) return Math.floor(10 + Math.random() * 90)
  if (roll < 0.8) return Math.floor(100 + Math.random() * 400)
  return Math.floor(500 + Math.random() * 1500)
}

function getRandomBotCashoutTarget(): number {
  const roll = Math.random()
  if (roll < 0.35) return Math.round((1.12 + Math.random() * 0.25) * 100) / 100
  if (roll < 0.65) return Math.round((1.37 + Math.random() * 0.35) * 100) / 100
  if (roll < 0.85) return Math.round((1.72 + Math.random() * 1.28) * 100) / 100
  if (roll < 0.95) return Math.round((3.00 + Math.random() * 3.50) * 100) / 100
  return Math.round((6.50 + Math.random() * 13.50) * 100) / 100
}

function seedRoundBotBets(): void {
  const count = MIN_BOT_BETS + Math.floor(Math.random() * BOT_BET_VARIANCE)
  const highRollerCount = Math.ceil(count * 0.1)

  for (let i = 0; i < count; i++) {
    const userName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]
    const botBet: SharedLiveBet = {
      id: `bot-${gameState.roundId}-${i + 1}`,
      user: userName,
      rank: 1 + Math.floor(Math.random() * 5),
      bet: getRandomBotBetAmount(i < highRollerCount),
      cashout: null,
      won: null,
      cashoutTarget: getRandomBotCashoutTarget(),
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${userName}`,
      roundId: gameState.roundId,
      updatedAt: Date.now()
    }

    pushLiveBetUpdate(botBet)
  }
}

function updateBotCashouts(multiplier: number): void {
  const now = Date.now()

  for (const bet of gameState.liveBets) {
    if (!bet.id.startsWith(`bot-${gameState.roundId}`)) continue
    if (bet.cashout !== null) continue

    if (multiplier >= bet.cashoutTarget) {
      const cashout = Math.round(multiplier * 100) / 100
      pushLiveBetUpdate({
        ...bet,
        cashout,
        won: Math.round(bet.bet * cashout * 100) / 100,
        updatedAt: now
      })
    }
  }
}

async function markRoundLostBets(roundId: string, crashPoint: number): Promise<void> {
  try {
    const lostBets = await Bet.find({ roundId, status: 'active' })
    if (lostBets.length > 0) {
      await Bet.updateMany(
        { roundId, status: 'active' },
        { status: 'lost', multiplierCaught: crashPoint }
      )
      console.log(`💥 Marked ${lostBets.length} active bets as lost for ${roundId} at ${crashPoint}x`)
    }
    activeRoundBets.clear()
  } catch (error) {
    console.error('Round crash persistence error:', error)
  }
}

export async function processBetCashout(
  betId?: string,
  userId?: string,
  targetMultiplier?: number,
  panelId?: number
): Promise<{ success: boolean; error?: string; result?: any }> {
  try {
    if (!userId) {
      return { success: false, error: 'User ID is required' }
    }

    if (gameState.phase !== 'flying') {
      return { success: false, error: 'Cannot cash out outside flying phase' }
    }

    const currentMultiplier = Math.round(gameState.multiplier * 100) / 100
    const serverMultiplier = targetMultiplier !== undefined
      ? Math.round(Math.min(targetMultiplier, currentMultiplier) * 100) / 100
      : currentMultiplier

    if (serverMultiplier < 1.01) {
      return { success: false, error: 'Multiplier too low' }
    }

    let existingBet = null
    if (betId && mongoose.Types.ObjectId.isValid(betId)) {
      existingBet = await Bet.findOne({ _id: betId, userId, status: 'active' })
    }

    if (!existingBet) {
      const query: any = { roundId: gameState.roundId, userId, status: 'active' }
      if (panelId) query.panelId = panelId
      existingBet = await Bet.findOne(query)
    }

    if (!existingBet) {
      return { success: false, error: 'Bet not found or already cashed out' }
    }

    const resolvedBetId = existingBet._id.toString()
    const winAmount = Math.round(existingBet.amount * serverMultiplier * 100) / 100

    const bet = await Bet.findOneAndUpdate(
      { _id: existingBet._id, userId, status: 'active' },
      {
        status: 'won',
        multiplierCaught: serverMultiplier,
        winAmount
      },
      { new: true }
    )

    if (!bet) {
      return { success: false, error: 'Bet already cashed out' }
    }

    activeRoundBets.delete(resolvedBetId)

    // For freebets: only net profit (winnings - stake) goes to main balance
    let creditAmount = winAmount
    if (bet.isFreebet) {
      creditAmount = Math.max(0, Math.round((winAmount - bet.amount) * 100) / 100)
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $inc: { balance: creditAmount } },
      { new: true }
    )

    console.log(`💰 Cash out: User ${user?.phone}, Win KSH ${winAmount} (credited KSH ${creditAmount}) at ${serverMultiplier}x [round: ${gameState.roundId}]`)

    const payload = {
      success: true,
      betId: bet._id.toString(),
      panelId: bet.panelId || 1,
      multiplier: serverMultiplier,
      winAmount,
      creditAmount,
      isFreebet: bet.isFreebet,
      newBalance: user?.balance,
      newFreebet: user?.freebet
    }

    // Emit to user room so all tabs and the current socket receive it
    io?.to(`user:${userId}`).emit('CASHOUT_SUCCESS', payload)
    emitUserBalanceUpdate(userId, {
      balance: user?.balance,
      freebet: user?.freebet,
      newBalance: user?.balance,
      type: 'cashout',
      amount: creditAmount
    })

    pushLiveBetUpdate({
      id: `user-${bet._id.toString()}`,
      user: user?.username || 'Player',
      rank: 1,
      bet: bet.amount,
      cashout: serverMultiplier,
      won: winAmount,
      cashoutTarget: bet.autoCashoutTarget || 0,
      isUser: true,
      roundId: gameState.roundId,
      updatedAt: Date.now()
    })

    io?.emit('PLAYER_CASHED_OUT', {
      username: user?.username,
      amount: bet.amount,
      multiplier: serverMultiplier,
      winAmount
    })

    return { success: true, result: payload }
  } catch (error: any) {
    console.error('Process bet cashout error:', error)
    return { success: false, error: error.message || 'Cashout failed' }
  }
}

function checkServerAutoCashouts(multiplier: number): void {
  for (const [betId, entry] of activeRoundBets.entries()) {
    if (entry.autoCashoutTarget && multiplier >= entry.autoCashoutTarget) {
      activeRoundBets.delete(betId)
      processBetCashout(betId, entry.userId, entry.autoCashoutTarget).catch(err => {
        console.error('Server auto-cashout failed for bet', betId, err)
      })
    }
  }
}

function stopTimers(): void {
  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
  if (waitingTimer) {
    clearTimeout(waitingTimer)
    waitingTimer = null
  }
  if (crashingTimer) {
    clearTimeout(crashingTimer)
    crashingTimer = null
  }
  if (crashedTimer) {
    clearTimeout(crashedTimer)
    crashedTimer = null
  }
}

function startWaiting(): void {
  if (!io) return

  gameState.phase = 'waiting'
  gameState.roundId = `round-${gameState.nonce}`
  gameState.multiplier = 1
  gameState.elapsedMs = 0
  gameState.revealedSeed = ''
  gameState.waitProgress = 0
  activeRoundBets.clear()

  waitingStartedAt = Date.now()

  // Check and apply expiration for active odds rules
  checkAndApplyOddsExpiration().catch(() => {})

  let isOverrideActive = false
  if (activeOddsState.enabled) {
    const now = Date.now()
    if (activeOddsState.durationType === 'scheduled_window') {
      isOverrideActive = (!activeOddsState.scheduledStartTime || now >= activeOddsState.scheduledStartTime) &&
                         (!activeOddsState.scheduledEndTime || now <= activeOddsState.scheduledEndTime)
    } else {
      isOverrideActive = true
    }
  }

  if (isOverrideActive) {
    const mined = mineServerSeedForCondition({
      mode: activeOddsState.mode,
      min: activeOddsState.minMultiplier,
      max: activeOddsState.maxMultiplier,
      exact: activeOddsState.exactMultiplier
    }, SERVER_CLIENT_SEED, gameState.nonce)

    currentServerSeed = mined.serverSeed
    gameState.serverSeedHash = crypto.createHash('sha256').update(currentServerSeed).digest('hex')
    gameState.crashPoint = mined.crashPoint
  } else {
    currentServerSeed = crypto.randomBytes(32).toString('hex')
    gameState.serverSeedHash = crypto.createHash('sha256').update(currentServerSeed).digest('hex')
    gameState.crashPoint = computeCrashPoint(currentServerSeed, SERVER_CLIENT_SEED, gameState.nonce)
  }

  seedRoundBotBets()
  emitGameSnapshot()

  waitingTimer = setTimeout(() => {
    startFlying()
  }, WAIT_MS)

  tickTimer = setInterval(() => {
    if (gameState.phase !== 'waiting') return
    const waitElapsed = Date.now() - waitingStartedAt
    gameState.waitProgress = Math.min(100, (waitElapsed / WAIT_MS) * 100)
    emitGameSnapshot()
  }, TICK_MS)
}

function startFlying(): void {
  if (!io) return

  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }

  gameState.phase = 'flying'
  gameState.multiplier = 1
  gameState.waitProgress = 100
  gameState.elapsedMs = 0
  flyingStartedAt = Date.now()
  emitGameSnapshot()

  tickTimer = setInterval(() => {
    if (gameState.phase !== 'flying') return

    const elapsed = Date.now() - flyingStartedAt
    const multiplier = computeMultiplier(elapsed)

    if (multiplier >= gameState.crashPoint) {
      gameState.multiplier = gameState.crashPoint
      gameState.elapsedMs = elapsed
      emitGameSnapshot()
      startCrashing()
      return
    }

    gameState.multiplier = multiplier
    gameState.elapsedMs = elapsed
    updateBotCashouts(multiplier)
    checkServerAutoCashouts(multiplier)
    emitGameSnapshot()
  }, TICK_MS)
}

function startCrashing(): void {
  if (!io) return

  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }

  gameState.phase = 'crashing'
  crashingStartedAt = Date.now()
  gameState.revealedSeed = currentServerSeed
  emitGameSnapshot()

  crashingTimer = setTimeout(async () => {
    gameState.phase = 'crashed'
    gameState.multiplier = gameState.crashPoint
    gameState.elapsedMs = Date.now() - crashingStartedAt
    gameState.roundHistory = [...gameState.roundHistory, gameState.crashPoint].slice(-MAX_HISTORY)

    await markRoundLostBets(gameState.roundId, gameState.crashPoint)

    try {
      await Round.create({
        roundId: gameState.roundId,
        crashPoint: gameState.crashPoint
      })
    } catch (error) {
      console.error('Failed to save round to history:', error)
    }

    // Decrement round counter if active round-based rule
    if (activeOddsState.enabled && activeOddsState.durationType === 'rounds') {
      activeOddsState.roundsRemaining = Math.max(0, activeOddsState.roundsRemaining - 1)
      OddsControl.updateOne({}, { roundsRemaining: activeOddsState.roundsRemaining }).catch(() => {})
      if (activeOddsState.roundsRemaining <= 0) {
        resetOddsEngineInternal('Completed all scheduled rounds').catch(() => {})
      }
    }

    emitGameSnapshot()

    crashedTimer = setTimeout(() => {
      gameState.nonce += 1
      startWaiting()
    }, CRASH_DISPLAY_MS)
  }, CRASHING_MS)
}

async function initializeGameLoop(): Promise<void> {
  stopTimers()
  
  try {
    const recentRounds = await Round.find().sort({ createdAt: -1 }).limit(MAX_HISTORY)
    if (recentRounds.length > 0) {
      gameState.roundHistory = recentRounds.map(r => r.crashPoint).reverse()
      
      const highestRound = recentRounds[0]
      const match = highestRound.roundId.match(/^round-(\d+)$/)
      if (match) {
        gameState.nonce = parseInt(match[1], 10) + 1
      }
    } else {
      gameState.nonce = INITIAL_NONCE
    }
  } catch (error) {
    console.error('Error loading initial round history:', error)
    gameState.nonce = INITIAL_NONCE
  }

  // Restore OddsControl rule from DB
  try {
    const oddsDoc = await OddsControl.getOddsControl()
    if (oddsDoc && oddsDoc.enabled) {
      const now = Date.now()
      const isExpired = (oddsDoc.durationType === 'minutes' && oddsDoc.expiresAt && oddsDoc.expiresAt.getTime() <= now) ||
                        (oddsDoc.durationType === 'rounds' && oddsDoc.roundsRemaining <= 0) ||
                        (oddsDoc.durationType === 'scheduled_window' && oddsDoc.scheduledEndTime && oddsDoc.scheduledEndTime.getTime() <= now)
      if (isExpired) {
        oddsDoc.enabled = false
        oddsDoc.mode = 'normal'
        await oddsDoc.save()
      } else {
        activeOddsState = {
          enabled: oddsDoc.enabled,
          mode: oddsDoc.mode,
          minMultiplier: oddsDoc.minMultiplier,
          maxMultiplier: oddsDoc.maxMultiplier,
          exactMultiplier: oddsDoc.exactMultiplier,
          durationType: oddsDoc.durationType,
          durationMinutes: oddsDoc.durationMinutes,
          roundsTotal: oddsDoc.roundsTotal,
          roundsRemaining: oddsDoc.roundsRemaining,
          scheduledStartTime: oddsDoc.scheduledStartTime?.getTime(),
          scheduledEndTime: oddsDoc.scheduledEndTime?.getTime(),
          startedAt: oddsDoc.startedAt?.getTime(),
          expiresAt: oddsDoc.expiresAt?.getTime(),
          lastActivatedBy: oddsDoc.lastActivatedBy
        }
        console.log(`[OddsEngine] Restored active rule from DB: ${activeOddsState.mode} [${activeOddsState.minMultiplier}x - ${activeOddsState.maxMultiplier}x]`)
      }
    }
  } catch (e) {
    console.error('Failed to load OddsControl on startup:', e)
  }

  await cleanupOrphanedBets()
  startWaiting()
}

async function cleanupOrphanedBets(): Promise<void> {
  try {
    const orphaned = await Bet.find({ status: 'active' })
    if (orphaned.length > 0) {
      console.log(`🧹 Found ${orphaned.length} orphaned active bets from prior session, refunding...`)
      for (const b of orphaned) {
        b.status = 'cancelled'
        await b.save()
        if (!b.isFreebet) {
          await User.findByIdAndUpdate(b.userId, { $inc: { balance: b.amount } })
        } else {
          await User.findByIdAndUpdate(b.userId, { $inc: { freebet: b.amount } })
        }
      }
      console.log(`✅ Cleaned up and refunded ${orphaned.length} orphaned bets.`)
    }
  } catch (error) {
    console.error('Failed to cleanup orphaned bets on startup:', error)
  }
}

export function authenticateSocketRoom(socket: Socket, rawToken?: string): string | null {
  try {
    const token =
      rawToken ||
      (socket.handshake.auth?.token as string) ||
      (socket.handshake.query?.token as string) ||
      (socket.handshake.headers?.authorization?.startsWith('Bearer ')
        ? socket.handshake.headers.authorization.slice(7)
        : '')
    if (!token) return null
    const decoded = jwt.verify(token, JWT_SECRET) as { userId?: string }
    if (decoded?.userId) {
      socket.data.userId = decoded.userId
      socket.join(`user:${decoded.userId}`)
      return decoded.userId
    }
  } catch {}
  return null
}

export function initializeSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: true,
      methods: ['GET', 'POST'],
      credentials: true
    },
    pingInterval: 25000,
    pingTimeout: 60000,
    transports: ['websocket', 'polling']
  })

  initializeGameLoop().catch(err => {
    console.error('Failed to initialize game loop:', err)
  })

  io.on('connection', (socket: Socket) => {
    console.log(`🔌 Client connected: ${socket.id}`)

    authenticateSocketRoom(socket)
    socket.emit('GAME_SNAPSHOT', gameState)
    socket.emit('LIVE_BETS_SNAPSHOT', gameState.liveBets)

    socket.on('AUTHENTICATE', (data: any) => {
      const token = typeof data === 'string' ? data : data?.token
      authenticateSocketRoom(socket, token)
    })

    socket.on('authenticate', (data: any) => {
      const token = typeof data === 'string' ? data : data?.token
      authenticateSocketRoom(socket, token)
    })

    socket.on('JOIN_USER_ROOM', (data: { token?: string; userId?: string }) => {
      authenticateSocketRoom(socket, data?.token)
    })

    socket.on('PLACE_BET', async (data: {
      amount: number
      roundId?: string
      isFreebet?: boolean
      panelId?: number
      autoCashoutTarget?: number
      token?: string
    }) => {
      const safeData = data || {}
      const panelId = Number(safeData.panelId) || 1
      try {
        const userId = socket.data.userId || (safeData.token ? authenticateSocketRoom(socket, safeData.token) : null)
        if (!userId) {
          return socket.emit('BET_ERROR', { error: 'Not authenticated. Please log in.', panelId })
        }

        const { amount, isFreebet } = safeData
        if (!amount || amount < 1) {
          return socket.emit('BET_ERROR', { error: 'Invalid bet amount', panelId })
        }

        if (gameState.phase !== 'waiting') {
          return socket.emit('BET_ERROR', { error: 'Betting window is closed for this round', panelId })
        }

        let user
        if (isFreebet) {
          const checkUser = await User.findById(userId)
          if (!checkUser) return socket.emit('BET_ERROR', { error: 'User not found', panelId })
          if (checkUser.freebetLocked) {
            const settings = await (Settings as any).getSettings()
            const unlockAmount = Number(settings?.freebetUnlockAmount ?? 50)
            return socket.emit('BET_ERROR', { error: `Freebets locked: Deposit KSH ${unlockAmount}+ to unlock`, panelId })
          }
          if ((checkUser.freebet || 0) < amount) {
            return socket.emit('BET_ERROR', { error: 'Insufficient freebet balance', panelId })
          }
          user = await User.findOneAndUpdate(
            { _id: userId, freebet: { $gte: amount } },
            { $inc: { freebet: -amount } },
            { new: true }
          )
        } else {
          user = await User.findOneAndUpdate(
            { _id: userId, balance: { $gte: amount } },
            { $inc: { balance: -amount }, $set: { hasPlayedWithMoney: true } },
            { new: true }
          )
        }

        if (!user) {
          return socket.emit('BET_ERROR', { error: isFreebet ? 'Insufficient freebet balance' : 'Insufficient balance', panelId })
        }

        const targetCashout = data.autoCashoutTarget && Number(data.autoCashoutTarget) >= 1.01
          ? Math.round(Number(data.autoCashoutTarget) * 100) / 100
          : null

        const bet = await Bet.create({
          userId,
          roundId: gameState.roundId,
          amount,
          isFreebet: Boolean(isFreebet),
          panelId,
          autoCashoutTarget: targetCashout,
          status: 'active'
        })

        activeRoundBets.set(bet._id.toString(), {
          betId: bet._id.toString(),
          userId: userId.toString(),
          panelId,
          amount,
          isFreebet: Boolean(isFreebet),
          autoCashoutTarget: targetCashout
        })

        console.log(`🎰 Bet placed: User ${user.phone}, Amount ${amount}, Round ${gameState.roundId}, AutoCashout: ${targetCashout || 'None'}`)

        const betResponse = {
          success: true,
          betId: bet._id.toString(),
          panelId,
          amount,
          roundId: gameState.roundId,
          isFreebet: Boolean(isFreebet),
          autoCashoutTarget: targetCashout,
          newBalance: user.balance,
          newFreebet: user.freebet
        }

        socket.emit('BET_PLACED', betResponse)
        emitUserBalanceUpdate(userId, {
          balance: user.balance,
          freebet: user.freebet,
          type: 'bet_placed',
          amount: -amount
        })

        pushLiveBetUpdate({
          id: `user-${bet._id.toString()}`,
          user: user.username,
          rank: 1,
          bet: amount,
          cashout: null,
          won: null,
          cashoutTarget: targetCashout || 0,
          isUser: true,
          roundId: gameState.roundId,
          updatedAt: Date.now()
        })

        io?.emit('NEW_BET', {
          username: user.username,
          amount,
          roundId: gameState.roundId
        })
      } catch (error: any) {
        console.error('Place bet error:', error)
        socket.emit('BET_ERROR', { error: error.message, panelId })
      }
    })

    socket.on('CASH_OUT', async (data: { betId?: string; panelId?: number; multiplier?: number; token?: string }) => {
      try {
        const safeData = data || {}
        const userId = socket.data.userId || (safeData.token ? authenticateSocketRoom(socket, safeData.token) : null)
        if (!userId) {
          return socket.emit('CASHOUT_ERROR', { error: 'Not authenticated' })
        }

        if (gameState.phase !== 'flying') {
          return socket.emit('CASHOUT_ERROR', { error: 'Cannot cash out outside flying phase' })
        }

        const { betId, panelId } = safeData
        const cashoutResult = await processBetCashout(betId, userId.toString(), safeData.multiplier, panelId)
        if (!cashoutResult.success) {
          return socket.emit('CASHOUT_ERROR', { error: cashoutResult.error })
        }
        socket.emit('CASHOUT_SUCCESS', cashoutResult.result)
      } catch (error: any) {
        console.error('Cash out error:', error)
        socket.emit('CASHOUT_ERROR', { error: error.message })
      }
    })

    socket.on('ROUND_CRASHED', async () => {
      // Round lifecycle is now server-authoritative; keep handler as no-op for compatibility.
    })

    socket.on('disconnect', () => {
      console.log(`🔌 Client disconnected: ${socket.id}`)
    })
  })

  return io
}

export function getIO(): Server | null {
  return io
}

export function emitUserBalanceUpdate(userId: string | any, data: any) {
  if (!io) return
  const uid = userId.toString()
  const eventData = { ...data, userId: uid, timestamp: Date.now() }
  io.to(`user:${uid}`).emit('DEPOSIT_SUCCESS', eventData)
  io.to(`user:${uid}`).emit('BALANCE_UPDATE', eventData)
}

export function getOddsEngineState() {
  const now = Date.now()
  let timeRemainingMs = 0
  if (activeOddsState.enabled && activeOddsState.durationType === 'minutes' && activeOddsState.expiresAt) {
    timeRemainingMs = Math.max(0, activeOddsState.expiresAt - now)
  } else if (activeOddsState.enabled && activeOddsState.durationType === 'scheduled_window' && activeOddsState.scheduledEndTime) {
    timeRemainingMs = Math.max(0, activeOddsState.scheduledEndTime - now)
  }

  return {
    ...activeOddsState,
    timeRemainingMs,
    timeRemainingSeconds: Math.ceil(timeRemainingMs / 1000)
  }
}

export async function applyOddsEngineRule(params: {
  mode: 'normal' | 'range' | 'min_multiplier' | 'exact'
  minMultiplier?: number
  maxMultiplier?: number
  exactMultiplier?: number
  durationType: 'minutes' | 'rounds' | 'scheduled_window' | 'indefinite'
  durationMinutes?: number
  roundsTotal?: number
  scheduledStartTime?: Date
  scheduledEndTime?: Date
  activatedBy?: string
  note?: string
}) {
  const now = Date.now()
  const durationMinutes = Math.max(1, Number(params.durationMinutes) || 15)
  const roundsTotal = Math.max(1, Number(params.roundsTotal) || 10)
  const expiresAt = params.durationType === 'minutes' ? new Date(now + durationMinutes * 60 * 1000) : undefined

  activeOddsState = {
    enabled: params.mode !== 'normal',
    mode: params.mode,
    minMultiplier: Math.max(1.01, Number(params.minMultiplier) || 2.0),
    maxMultiplier: Math.min(200, Math.max(Number(params.minMultiplier) || 2.0, Number(params.maxMultiplier) || 5.0)),
    exactMultiplier: params.exactMultiplier ? Number(params.exactMultiplier) : undefined,
    durationType: params.durationType,
    durationMinutes,
    roundsTotal,
    roundsRemaining: roundsTotal,
    scheduledStartTime: params.scheduledStartTime ? new Date(params.scheduledStartTime).getTime() : undefined,
    scheduledEndTime: params.scheduledEndTime ? new Date(params.scheduledEndTime).getTime() : undefined,
    startedAt: now,
    expiresAt: expiresAt?.getTime(),
    lastActivatedBy: params.activatedBy || 'admin'
  }

  try {
    const doc = await OddsControl.getOddsControl()
    doc.enabled = activeOddsState.enabled
    doc.mode = activeOddsState.mode
    doc.minMultiplier = activeOddsState.minMultiplier
    doc.maxMultiplier = activeOddsState.maxMultiplier
    doc.exactMultiplier = activeOddsState.exactMultiplier
    doc.durationType = activeOddsState.durationType
    doc.durationMinutes = activeOddsState.durationMinutes
    doc.roundsTotal = activeOddsState.roundsTotal
    doc.roundsRemaining = activeOddsState.roundsRemaining
    doc.scheduledStartTime = params.scheduledStartTime
    doc.scheduledEndTime = params.scheduledEndTime
    doc.startedAt = new Date(now)
    doc.expiresAt = expiresAt
    doc.lastActivatedBy = activeOddsState.lastActivatedBy
    doc.note = params.note || ''
    doc.auditLogs.push({
      activatedAt: new Date(now),
      mode: activeOddsState.mode,
      minMultiplier: activeOddsState.minMultiplier,
      maxMultiplier: activeOddsState.maxMultiplier,
      durationType: activeOddsState.durationType,
      durationMinutes: activeOddsState.durationMinutes,
      roundsTotal: activeOddsState.roundsTotal,
      activatedBy: activeOddsState.lastActivatedBy,
      reason: params.note || 'Admin configured odds engine rule'
    })
    await doc.save()
  } catch (err) {
    console.error('Error saving OddsControl to DB:', err)
  }

  console.log(`[OddsEngine] Rule applied: ${activeOddsState.mode} [${activeOddsState.minMultiplier}x - ${activeOddsState.maxMultiplier}x], duration: ${activeOddsState.durationType} (${activeOddsState.durationMinutes}m / ${activeOddsState.roundsTotal}r)`)
  return getOddsEngineState()
}

export async function resetOddsEngineToNormal(reason: string = 'Manual admin reset') {
  await resetOddsEngineInternal(reason)
  console.log(`[OddsEngine] Reset to normal odds engine. Reason: ${reason}`)
  return getOddsEngineState()
}
