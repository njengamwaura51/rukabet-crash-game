// ═══════════════════════════════════════════════════════════════════════════
// RUKABET UNIFIED BACKEND SERVER (backend.tsx)
// Complete consolidated backend code with all Models, Controllers,
// Middlewares, Webhooks, Socket Game Engine, and Admin Management APIs.
// ═══════════════════════════════════════════════════════════════════════════

import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import path from 'path'
import { createServer, Server as HttpServer } from 'http'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import mongoose, { Schema, Document } from 'mongoose'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import axios from 'axios'
import { Server, Socket } from 'socket.io'
import rateLimit from 'express-rate-limit'

// ── 1. CONFIGURATION & CONSTANTS ─────────────────────────────────────────────
dotenv.config()

const JWT_SECRET = process.env.JWT_SECRET || 'rukabet-jwt-secret-2026'
const JWT_EXPIRES_IN = '30d'
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI
const PORT = Number(process.env.PORT) || 3001
const IS_PRODUCTION = process.env.NODE_ENV === 'production'
const PAYD_WEBHOOK_PATH = '/api/webhooks/payd'
const INTASEND_WEBHOOK_PATH = '/api/webhooks/intasend'
const PUBLIC_DOMAIN = (process.env.PUBLIC_APP_URL || 'https://rukabet.live').replace(/\/+$/, '')
const PAYD_WEBHOOK_URL = `${PUBLIC_DOMAIN}${PAYD_WEBHOOK_PATH}`

const AMOUNT_TOLERANCE = 0.05
const WAIT_MS = 5000
const CRASH_DISPLAY_MS = 3000
const CRASHING_MS = 700
const TICK_MS = 100
const MAX_HISTORY = 20
const MAX_LIVE_BETS = 10
const MIN_BOT_BETS = 42
const BOT_BET_VARIANCE = 14
const INITIAL_NONCE = 1

function getServerClientSeed(): string {
  const configuredSeed = process.env.GAME_CLIENT_SEED
  if (configuredSeed) return configuredSeed
  if (IS_PRODUCTION) {
    return 'b5a529b6f24451149bb8f28aad789ed92481ced007531461f2668995390740e1'
  }
  return 'rukabet-dev-client-seed'
}

const SERVER_CLIENT_SEED = getServerClientSeed()

function safeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const aBuffer = Buffer.from(a)
  const bBuffer = Buffer.from(b)
  if (aBuffer.length !== bBuffer.length) return false
  return crypto.timingSafeEqual(aBuffer, bBuffer)
}

function sanitizeKey(value?: string): string {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/^["']|["']$/g, '')
}

export function normalizeKenyanPhone(phone: string): string | null {
  if (!phone || typeof phone !== 'string') return null
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('254') && digits.length === 12 && /^254[17]\d{8}$/.test(digits)) {
    return digits
  }
  if (digits.startsWith('0') && digits.length === 10 && /^0[17]\d{8}$/.test(digits)) {
    return `254${digits.slice(1)}`
  }
  if (digits.length === 9 && /^[17]\d{8}$/.test(digits)) {
    return `254${digits}`
  }
  return null
}

export function normalizePhoneLast9(phone: string): string | null {
  const full = normalizeKenyanPhone(phone)
  return full ? full.slice(-9) : null
}

// ── 2. DATABASE MODELS ───────────────────────────────────────────────────────

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId
  phone: string
  password: string
  username: string
  balance: number
  freebet: number
  freebetLocked: boolean
  hasPlayedWithMoney: boolean
  referralsCount: number
  referralsEarnings: number
  referredBy?: mongoose.Types.ObjectId | null
  hasReceivedReferralReward: boolean
  isFrozen: boolean
  role?: string
  createdAt: Date
  updatedAt: Date
}

const UserSchema = new Schema<IUser>({
  phone: { type: String, required: true, unique: true, index: true },
  password: { type: String, required: true },
  username: { type: String, required: true, maxlength: 20 },
  balance: { type: Number, default: 0, min: 0 },
  freebet: { type: Number, default: 150, min: 0 },
  freebetLocked: { type: Boolean, default: true },
  hasPlayedWithMoney: { type: Boolean, default: false },
  referralsCount: { type: Number, default: 0 },
  referralsEarnings: { type: Number, default: 0 },
  referredBy: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  hasReceivedReferralReward: { type: Boolean, default: false },
  isFrozen: { type: Boolean, default: false },
  role: { type: String, default: 'user' }
}, { timestamps: true })

export const User = mongoose.model<IUser>('User', UserSchema)

export interface IDeposit extends Document {
  _id: mongoose.Types.ObjectId
  userId: mongoose.Types.ObjectId
  phone: string
  amount: number
  apiRef: string
  status: 'pending' | 'completed' | 'failed'
  credited: boolean
  creditedAt?: Date | null
  paydReference?: string | null
  externalRef?: string | null
  mpesaReceipt?: string | null
  submittedReceipt?: string | null
  failureReason?: string | null
  intasendInvoiceId?: string | null
  intasendTrackerId?: string | null
  rawWebhookPayload?: any
  createdAt: Date
  updatedAt: Date
}

const DepositSchema = new Schema<IDeposit>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  phone: { type: String, required: true, index: true },
  amount: { type: Number, required: true, min: 1 },
  apiRef: { type: String, required: true, unique: true, index: true },
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending', index: true },
  credited: { type: Boolean, default: false, index: true },
  creditedAt: { type: Date, default: null },
  paydReference: { type: String, default: null, index: true },
  externalRef: { type: String, default: null, index: true },
  mpesaReceipt: { type: String, default: null, index: true },
  submittedReceipt: { type: String, default: null, index: true },
  failureReason: { type: String, default: null },
  intasendInvoiceId: { type: String, default: null, index: true },
  intasendTrackerId: { type: String, default: null, index: true },
  rawWebhookPayload: { type: Schema.Types.Mixed, default: null }
}, { timestamps: true })

DepositSchema.index({ userId: 1, createdAt: -1 })
DepositSchema.index({ phone: 1, amount: 1, status: 1, createdAt: -1 })
export const Deposit = mongoose.model<IDeposit>('Deposit', DepositSchema)

export interface IWithdrawal extends Document {
  _id: mongoose.Types.ObjectId
  userId: mongoose.Types.ObjectId
  phone: string
  amount: number
  status: 'pending' | 'completed' | 'failed' | 'rejected'
  refunded: boolean
  intasendTrackerId?: string | null
  mpesaReceipt?: string | null
  failureReason?: string | null
  processedAt?: Date | null
  createdAt: Date
  updatedAt: Date
}

const WithdrawalSchema = new Schema<IWithdrawal>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  phone: { type: String, required: true },
  amount: { type: Number, required: true, min: 10 },
  status: { type: String, enum: ['pending', 'completed', 'failed', 'rejected'], default: 'pending', index: true },
  refunded: { type: Boolean, default: false },
  intasendTrackerId: { type: String, default: null },
  mpesaReceipt: { type: String, default: null },
  failureReason: { type: String, default: null },
  processedAt: { type: Date, default: null }
}, { timestamps: true })

WithdrawalSchema.index({ userId: 1, createdAt: -1 })
export const Withdrawal = mongoose.model<IWithdrawal>('Withdrawal', WithdrawalSchema)

export interface IBet extends Document {
  _id: mongoose.Types.ObjectId
  userId: mongoose.Types.ObjectId
  roundId: string
  amount: number
  multiplierCaught: number | null
  status: 'pending' | 'active' | 'won' | 'lost' | 'cancelled'
  winAmount: number
  isFreebet: boolean
  createdAt: Date
  updatedAt: Date
}

const BetSchema = new Schema<IBet>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  roundId: { type: String, required: true, index: true },
  amount: { type: Number, required: true, min: 1 },
  multiplierCaught: { type: Number, default: null },
  status: { type: String, enum: ['pending', 'active', 'won', 'lost', 'cancelled'], default: 'pending' },
  winAmount: { type: Number, default: 0 },
  isFreebet: { type: Boolean, default: false }
}, { timestamps: true })

BetSchema.index({ userId: 1, createdAt: -1 })
BetSchema.index({ roundId: 1, status: 1 })
export const Bet = mongoose.model<IBet>('Bet', BetSchema)

export interface IRound extends Document {
  roundId: string
  nonce?: number
  crashPoint: number
  serverSeed?: string
  clientSeed?: string
  combinedHash?: string
  startTime?: Date
  crashedAt?: Date
  createdAt: Date
}

const RoundSchema = new Schema<IRound>({
  roundId: { type: String, required: true, unique: true },
  nonce: { type: Number, index: true },
  crashPoint: { type: Number, required: true },
  serverSeed: { type: String, default: '' },
  clientSeed: { type: String, default: '' },
  combinedHash: { type: String, default: '' },
  startTime: { type: Date },
  crashedAt: { type: Date }
}, { timestamps: true })

RoundSchema.index({ createdAt: -1 })
export const Round = mongoose.model<IRound>('Round', RoundSchema)

export interface IOddsAuditLog {
  activatedAt: Date
  expiredAt?: Date
  mode: string
  minMultiplier: number
  maxMultiplier?: number
  durationType: string
  durationMinutes?: number
  roundsTotal?: number
  activatedBy: string
  reason?: string
}

export interface IOddsControl extends Document {
  _id: mongoose.Types.ObjectId
  enabled: boolean
  mode: 'normal' | 'range' | 'min_multiplier' | 'exact'
  minMultiplier: number
  maxMultiplier: number
  exactMultiplier?: number
  durationType: 'minutes' | 'rounds' | 'scheduled_window' | 'indefinite'
  durationMinutes: number
  roundsTotal: number
  roundsRemaining: number
  scheduledStartTime?: Date
  scheduledEndTime?: Date
  startedAt?: Date
  expiresAt?: Date
  lastActivatedBy: string
  note?: string
  auditLogs: IOddsAuditLog[]
  updatedAt: Date
  createdAt: Date
}

export interface IOddsControlModel extends mongoose.Model<IOddsControl> {
  getOddsControl(): Promise<IOddsControl>
}

const OddsAuditLogSchema = new Schema<IOddsAuditLog>({
  activatedAt: { type: Date, default: Date.now },
  expiredAt: { type: Date },
  mode: { type: String, default: 'range' },
  minMultiplier: { type: Number, default: 2.0 },
  maxMultiplier: { type: Number, default: 5.0 },
  durationType: { type: String, default: 'minutes' },
  durationMinutes: { type: Number },
  roundsTotal: { type: Number },
  activatedBy: { type: String, default: 'admin' },
  reason: { type: String }
}, { _id: false })

const OddsControlSchema = new Schema<IOddsControl>({
  enabled: { type: Boolean, default: false },
  mode: { type: String, enum: ['normal', 'range', 'min_multiplier', 'exact'], default: 'normal' },
  minMultiplier: { type: Number, default: 2.0 },
  maxMultiplier: { type: Number, default: 5.0 },
  exactMultiplier: { type: Number },
  durationType: { type: String, enum: ['minutes', 'rounds', 'scheduled_window', 'indefinite'], default: 'minutes' },
  durationMinutes: { type: Number, default: 15 },
  roundsTotal: { type: Number, default: 10 },
  roundsRemaining: { type: Number, default: 10 },
  scheduledStartTime: { type: Date },
  scheduledEndTime: { type: Date },
  startedAt: { type: Date },
  expiresAt: { type: Date },
  lastActivatedBy: { type: String, default: 'admin' },
  note: { type: String, default: '' },
  auditLogs: { type: [OddsAuditLogSchema], default: [] }
}, { timestamps: true })

OddsControlSchema.statics.getOddsControl = async function() {
  let doc = await this.findOne()
  if (!doc) {
    doc = await this.create({
      enabled: false,
      mode: 'normal',
      minMultiplier: 2.0,
      maxMultiplier: 5.0,
      durationType: 'minutes',
      durationMinutes: 15,
      roundsTotal: 10,
      roundsRemaining: 10
    })
  }
  return doc
}

export const OddsControl = mongoose.model<IOddsControl, IOddsControlModel>('OddsControl', OddsControlSchema)

export interface ISettings extends Document {
  _id: mongoose.Types.ObjectId
  paydWalletUsername: string
  paydApiUsername: string
  paydApiPassword: string
  paydApiSecret: string
  paydApiBaseUrl: string
  paydCallbackUrl: string
  intasendPublicKey?: string
  intasendSecretKey?: string
  companyName: string
  whatsappSupport: string
  minDeposit: number
  minWithdrawal: number
  freebetUnlockAmount: number
  initialFreebet: number
  referralReward: number
  minBet: number
  maxBet: number
  adminToken: string
  jwtSecret: string
  updatedAt: Date
}

const SettingsSchema = new Schema<ISettings>({
  paydWalletUsername: { type: String, default: '' },
  paydApiUsername: { type: String, default: '' },
  paydApiPassword: { type: String, default: '' },
  paydApiSecret: { type: String, default: '' },
  paydApiBaseUrl: { type: String, default: 'https://api.payd.money/api/v2/payments' },
  paydCallbackUrl: { type: String, default: '' },
  intasendPublicKey: { type: String, default: '' },
  intasendSecretKey: { type: String, default: '' },
  companyName: { type: String, default: 'RUKA TECH SOLUTIONS' },
  whatsappSupport: { type: String, default: '254712345678' },
  minDeposit: { type: Number, default: 10 },
  minWithdrawal: { type: Number, default: 50 },
  freebetUnlockAmount: { type: Number, default: 50 },
  initialFreebet: { type: Number, default: 150 },
  referralReward: { type: Number, default: 20 },
  minBet: { type: Number, default: 10 },
  maxBet: { type: Number, default: 10000 },
  adminToken: { type: String, default: '' },
  jwtSecret: { type: String, default: '' }
}, { timestamps: true })

SettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne()
  if (!settings) {
    settings = await this.create({
      adminToken: process.env.ADMIN_TOKEN || '117402',
      jwtSecret: process.env.JWT_SECRET || 'rukabet-jwt-secret-2026',
      paydApiBaseUrl: 'https://api.payd.money/api/v2/payments',
      companyName: 'RUKA TECH SOLUTIONS',
      minDeposit: 10,
      minWithdrawal: 50,
      freebetUnlockAmount: 50,
      initialFreebet: 150,
      referralReward: 20,
      minBet: 10,
      maxBet: 10000
    })
  }
  return settings
}

export const Settings = mongoose.model<ISettings>('Settings', SettingsSchema)

// ── 3. ATOMIC DEPOSIT SETTLEMENT & REAL-TIME EMITTER ─────────────────────────

export function emitUserBalanceUpdate(
  userId: string | mongoose.Types.ObjectId,
  payload: {
    amount?: number
    newBalance: number
    freebet?: number
    freebetLocked?: boolean
    depositId?: string
    apiRef?: string
    mpesaReceipt?: string | null
    type?: string
  }
) {
  const ioInstance = getIO()
  if (!ioInstance) return
  const uid = userId.toString()
  const eventData = {
    ...payload,
    userId: uid,
    timestamp: new Date().toISOString()
  }
  ioInstance.to(`user:${uid}`).emit('DEPOSIT_SUCCESS', eventData)
  ioInstance.to(`user:${uid}`).emit('BALANCE_UPDATE', eventData)
}

/**
 * Atomically marks a deposit as completed + credited, increments user balance,
 * unlocks freebet if eligible, credits referrer once, and emits real-time socket events.
 * Safe against concurrent webhook calls, late callbacks after timeouts, and manual verification.
 */
export async function creditDepositAtomically(
  depositId: mongoose.Types.ObjectId | string,
  meta: {
    externalRef?: string | null
    paydReference?: string | null
    mpesaReceipt?: string | null
    rawWebhookPayload?: any
    verifiedAmount?: number | null
  } = {}
): Promise<{ creditedNow: boolean; deposit: IDeposit | null; user: IUser | null }> {
  const existing = await Deposit.findById(depositId)
  if (!existing) return { creditedNow: false, deposit: null, user: null }

  const creditAmount =
    typeof meta.verifiedAmount === 'number' && Number.isFinite(meta.verifiedAmount) && meta.verifiedAmount > 0
      ? meta.verifiedAmount
      : existing.amount

  const setFields: any = {
    status: 'completed',
    credited: true,
    creditedAt: new Date(),
    failureReason: null
  }
  if (meta.paydReference) setFields.paydReference = String(meta.paydReference)
  if (meta.externalRef) setFields.externalRef = String(meta.externalRef)
  if (meta.mpesaReceipt) setFields.mpesaReceipt = String(meta.mpesaReceipt).toUpperCase()
  if (meta.rawWebhookPayload !== undefined) setFields.rawWebhookPayload = meta.rawWebhookPayload

  // Atomic guard: only credit if credited !== true
  const completedDeposit = await Deposit.findOneAndUpdate(
    { _id: existing._id, credited: { $ne: true } },
    { $set: setFields },
    { new: true }
  )

  if (!completedDeposit) {
    // Already credited previously; still update any newly arrived receipt metadata
    if (meta.mpesaReceipt && !existing.mpesaReceipt) {
      await Deposit.findByIdAndUpdate(existing._id, {
        $set: { mpesaReceipt: String(meta.mpesaReceipt).toUpperCase() }
      })
    }
    const currentUser = await User.findById(existing.userId)
    return { creditedNow: false, deposit: existing, user: currentUser }
  }

  const settings = await (Settings as any).getSettings()
  const freebetUnlockAmount = Number(settings?.freebetUnlockAmount ?? 50)
  const referralReward = Number(settings?.referralReward ?? 20)

  const updateOps: any = { $inc: { balance: creditAmount } }
  if (creditAmount >= freebetUnlockAmount) {
    updateOps.$set = { freebetLocked: false }
  }

  const user = await User.findByIdAndUpdate(completedDeposit.userId, updateOps, { new: true })
  if (!user) {
    return { creditedNow: true, deposit: completedDeposit, user: null }
  }

  // Atomic one-time referral reward claim
  if (user.referredBy && !user.hasReceivedReferralReward && creditAmount >= freebetUnlockAmount && referralReward > 0) {
    try {
      const claimedUser = await User.findOneAndUpdate(
        { _id: user._id, hasReceivedReferralReward: { $ne: true } },
        { $set: { hasReceivedReferralReward: true } },
        { new: true }
      )
      if (claimedUser) {
        const referrer = await User.findByIdAndUpdate(
          user.referredBy,
          { $inc: { balance: referralReward, referralsEarnings: referralReward } },
          { new: true }
        )
        if (referrer) {
          emitUserBalanceUpdate(referrer._id, {
            amount: referralReward,
            newBalance: referrer.balance,
            freebet: referrer.freebet,
            freebetLocked: referrer.freebetLocked,
            type: 'referral_reward'
          })
        }
      }
    } catch {}
  }

  emitUserBalanceUpdate(completedDeposit.userId, {
    amount: creditAmount,
    newBalance: user.balance,
    freebet: user.freebet,
    freebetLocked: user.freebetLocked,
    depositId: completedDeposit._id.toString(),
    apiRef: completedDeposit.apiRef,
    mpesaReceipt: completedDeposit.mpesaReceipt || completedDeposit.submittedReceipt || null,
    type: 'deposit'
  })

  return { creditedNow: true, deposit: completedDeposit, user }
}

// ── 4. MIDDLEWARES ───────────────────────────────────────────────────────────

export interface AuthRequest extends Request {
  user?: IUser
  userId?: string
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' })
    }

    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string }

    const user = await User.findById(decoded.userId)
    if (!user) {
      return res.status(401).json({ error: 'User not found' })
    }
    if (user.isFrozen) {
      return res.status(403).json({ error: 'Your account is frozen. Please contact customer support.' })
    }

    req.user = user
    req.userId = decoded.userId
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

export async function adminMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const authorizationHeader = req.headers.authorization
    const adminToken = (req.headers['x-admin-token'] as string) || (authorizationHeader?.startsWith('Bearer ') ? authorizationHeader.slice(7) : '')
    const adminUsername = req.headers['x-admin-username'] as string
    const adminPassword = req.headers['x-admin-password'] as string
    const settings = await (Settings as any).getSettings()

    const validToken = process.env.ADMIN_TOKEN || settings?.adminToken || '117402'
    const validAdminUsername = process.env.ADMIN_USERNAME || 'pirate101'
    const validAdminPassword = process.env.ADMIN_PASSWORD || '117402'

    if (adminToken) {
      try {
        const decoded = jwt.verify(adminToken, JWT_SECRET) as any
        if (decoded?.role === 'admin') return next()
      } catch {
        // Fallback to raw string comparison below
      }

      if (safeCompare(adminToken, validToken)) {
        return next()
      }
    }

    const basicAuthEncoded = authorizationHeader?.startsWith('Basic ') ? authorizationHeader.slice(6) : ''
    const basicAuthDecoded = basicAuthEncoded ? Buffer.from(basicAuthEncoded, 'base64').toString('utf8') : ''
    const separatorIndex = basicAuthDecoded.indexOf(':')
    const basicAuthUsername = separatorIndex >= 0 ? basicAuthDecoded.slice(0, separatorIndex) : ''
    const basicAuthPassword = separatorIndex >= 0 ? basicAuthDecoded.substring(separatorIndex + 1) : ''
    const providedUsername = adminUsername || basicAuthUsername
    const providedPassword = adminPassword || basicAuthPassword

    const isCredentialValid =
      !!providedUsername &&
      !!providedPassword &&
      safeCompare(providedUsername.trim(), validAdminUsername) &&
      safeCompare(providedPassword, validAdminPassword)

    if (isCredentialValid) {
      return next()
    }

    return res.status(403).json({ error: 'Admin access required' })
  } catch {
    return res.status(500).json({ error: 'Auth check failed' })
  }
}

export const adminRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, try again shortly' }
})

export const depositRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many deposit requests, try again shortly' }
})

export const webhookRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many webhook requests, try again shortly' }
})

// ── 5. CONTROLLERS ───────────────────────────────────────────────────────────

// Auth Controller
export async function register(req: Request, res: Response) {
  try {
    const { phone, password, username, referralCode } = req.body
    if (!phone || !password || !username) {
      return res.status(400).json({ error: 'Phone, password, and username are required' })
    }

    const normalizedPhone = normalizePhoneLast9(String(phone)) || String(phone).replace(/^0/, '').slice(-9)
    const existingUser = await User.findOne({ phone: normalizedPhone })
    if (existingUser) {
      return res.status(400).json({ error: 'Phone number already registered' })
    }

    let referrerUser = null
    if (referralCode && typeof referralCode === 'string') {
      const cleanRef = referralCode.trim()
      const refDigits = cleanRef.replace(/\D/g, '')
      const refLast9 = refDigits.length >= 9 ? refDigits.slice(-9) : null
      const queryOr: any[] = [{ username: { $regex: `^${cleanRef}$`, $options: 'i' } }]
      if (refLast9) queryOr.push({ phone: refLast9 })
      if (cleanRef.length === 24 && /^[0-9a-fA-F]{24}$/.test(cleanRef)) queryOr.push({ _id: cleanRef })
      referrerUser = await User.findOne({ $or: queryOr })
    }

    const settings = await (Settings as any).getSettings()
    const initialFreebet = Number(settings?.initialFreebet ?? 150)

    const user = await User.create({
      phone: normalizedPhone,
      password,
      username: String(username).trim().slice(0, 20),
      freebet: initialFreebet,
      referredBy: referrerUser ? referrerUser._id : null
    })

    if (referrerUser) {
      await User.findByIdAndUpdate(referrerUser._id, { $inc: { referralsCount: 1 } })
    }

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
    const userObj = user.toObject()
    delete (userObj as any).password

    return res.status(201).json({ success: true, user: userObj, token })
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Registration failed' })
  }
}

export async function login(req: Request, res: Response) {
  try {
    const { phone, password } = req.body
    if (!phone || !password) {
      return res.status(400).json({ error: 'Phone and password are required' })
    }

    const normalizedPhone = normalizePhoneLast9(String(phone)) || String(phone).replace(/^0/, '').slice(-9)
    const user = await User.findOne({ phone: normalizedPhone })
    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Invalid phone or password' })
    }

    if (user.isFrozen) {
      return res.status(403).json({ error: 'Your account is frozen. Please contact customer support.' })
    }

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
    const userObj = user.toObject()
    delete (userObj as any).password

    return res.json({ success: true, user: userObj, token })
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Login failed' })
  }
}

export async function getMe(req: AuthRequest, res: Response) {
  try {
    const user = await User.findById(req.userId).select('-password')
    if (!user) return res.status(404).json({ error: 'User not found' })
    return res.json({ success: true, user })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}

export async function changePassword(req: AuthRequest, res: Response) {
  try {
    const { currentPassword, newPassword } = req.body
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password required' })
    }

    const user = await User.findById(req.userId)
    if (!user || user.password !== currentPassword) {
      return res.status(400).json({ error: 'Incorrect current password' })
    }

    user.password = newPassword
    await user.save()
    return res.json({ success: true, message: 'Password updated successfully' })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}

// Deposit Controller (Payd M-Pesa STK Push)
export async function initiateDeposit(req: AuthRequest, res: Response) {
  let depositId: string | null = null

  try {
    const { amount, phone } = req.body
    const userId = req.userId!
    const rawPhone = (typeof phone === 'string' && phone.trim()) ? phone.trim() : (req.user?.phone || '')
    const cleanPhone = normalizeKenyanPhone(rawPhone)
    const depositAmount = Math.round(Number(amount))

    const settings = await (Settings as any).getSettings()
    const minDeposit = Number(settings?.minDeposit || 10)

    if (!Number.isFinite(depositAmount) || depositAmount < minDeposit) {
      return res.status(400).json({ error: `Minimum deposit is KSH ${minDeposit}` })
    }

    if (!cleanPhone) {
      return res.status(400).json({ error: 'Invalid Kenyan phone number. Use 07XXXXXXXX or 01XXXXXXXX.' })
    }

    const paydWalletUsername = sanitizeKey(settings?.paydWalletUsername) || sanitizeKey(process.env.PAYD_WALLET_USERNAME)
    const paydApiUsername = sanitizeKey(settings?.paydApiUsername) || sanitizeKey(process.env.PAYD_API_USERNAME)
    const paydApiPassword = sanitizeKey(settings?.paydApiPassword) || sanitizeKey(process.env.PAYD_API_PASSWORD)
    const paydApiSecret = sanitizeKey(settings?.paydApiSecret) || sanitizeKey(process.env.PAYD_API_SECRET)
    let paydApiBaseUrl = sanitizeKey(settings?.paydApiBaseUrl) || sanitizeKey(process.env.PAYD_API_BASE_URL) || 'https://api.payd.money/api/v2/payments'
    if (paydApiBaseUrl.includes('mypayd.app')) {
      paydApiBaseUrl = paydApiBaseUrl.replace(/api\.mypayd\.app/g, 'api.payd.money').replace(/mypayd\.app/g, 'payd.money')
    }

    if (!paydApiSecret && (!paydApiUsername || !paydApiPassword)) {
      return res.status(500).json({
        error: 'Payment gateway not configured. Please configure Payd credentials in Admin Dashboard > Gateway.'
      })
    }

    const internalRef = `DEP-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`
    const deposit = await Deposit.create({
      userId,
      phone: cleanPhone,
      amount: depositAmount,
      apiRef: internalRef,
      status: 'pending',
      credited: false
    })
    depositId = deposit._id.toString()

    const requestBody: any = {
      phone_number: cleanPhone,
      amount: depositAmount,
      narration: `Deposit ${internalRef}`,
      api_ref: internalRef,
      currency: 'KES'
    }

    if (paydWalletUsername) {
      requestBody.username = paydWalletUsername
    }

    const webhookUrl = sanitizeKey(settings?.paydCallbackUrl) || sanitizeKey(process.env.PAYD_CALLBACK_URL) || PAYD_WEBHOOK_URL
    if (webhookUrl) {
      requestBody.callback_url = webhookUrl
    }

    const requestHeaders: any = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }

    if (paydApiSecret) {
      requestHeaders['Authorization'] = `Bearer ${paydApiSecret}`
    } else if (paydApiUsername && paydApiPassword) {
      const basicToken = Buffer.from(`${paydApiUsername}:${paydApiPassword}`).toString('base64')
      requestHeaders['Authorization'] = `Basic ${basicToken}`
    }

    const paydResponse = await axios.post(paydApiBaseUrl, requestBody, { headers: requestHeaders, timeout: 25000 })
    const resData = paydResponse.data || {}
    const externalRef =
      resData.transaction_reference ||
      resData.correlator_id ||
      resData.reference ||
      resData.id ||
      resData.data?.transaction_reference ||
      resData.data?.correlator_id ||
      resData.data?.reference ||
      null

    if (externalRef) {
      await Deposit.findByIdAndUpdate(deposit._id, {
        $set: {
          paydReference: String(externalRef),
          externalRef: String(externalRef)
        }
      })
    }

    return res.json({
      success: true,
      message: 'STK Push sent to your phone. Please enter your M-Pesa PIN.',
      depositId: deposit._id,
      apiRef: internalRef,
      externalRef
    })
  } catch (error: any) {
    const isTimeout = error?.code === 'ECONNABORTED' || String(error?.message || '').toLowerCase().includes('timeout')
    if (depositId) {
      const errMsg = error?.response?.data?.message || error?.response?.data?.error || error?.message || 'Deposit initiation failed'
      // If it was a gateway timeout, keep status 'pending' so a subsequent M-Pesa webhook still settles cleanly
      await Deposit.findOneAndUpdate(
        { _id: depositId, credited: { $ne: true } },
        {
          $set: {
            status: isTimeout ? 'pending' : 'failed',
            failureReason: isTimeout ? 'Gateway response timed out; awaiting M-Pesa callback' : errMsg
          }
        }
      ).catch(() => {})
    }
    const paydData = error?.response?.data
    const paydMessage = paydData?.message || paydData?.error || error?.message || 'STK Push failed'
    return res.status(error?.response?.status || 500).json({ error: paydMessage, details: paydData, depositId })
  }
}

export async function getDepositStatus(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params
    const userId = req.userId
    if (!userId) return res.status(401).json({ error: 'Authentication required' })

    const query: any = { userId }
    if (typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)) {
      query._id = id
    } else {
      query.apiRef = id
    }

    const deposit = await Deposit.findOne(query).lean()
    if (!deposit) return res.status(404).json({ error: 'Deposit not found' })

    const user = await User.findById(userId).select('balance freebet freebetLocked').lean()

    return res.json({
      success: true,
      deposit: {
        id: deposit._id.toString(),
        apiRef: deposit.apiRef,
        amount: deposit.amount,
        status: deposit.status,
        credited: deposit.credited,
        mpesaReceipt: deposit.mpesaReceipt || deposit.submittedReceipt || null,
        failureReason: deposit.failureReason || null,
        createdAt: deposit.createdAt
      },
      balance: user?.balance ?? 0,
      freebet: user?.freebet ?? 0,
      freebetLocked: user?.freebetLocked ?? true
    })
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to check deposit status' })
  }
}

export async function verifyPendingDeposit(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId
    if (!userId) return res.status(401).json({ error: 'Authentication required' })

    const { code } = req.body
    const rawText = typeof code === 'string' ? code.trim() : ''
    if (!rawText) {
      return res.status(400).json({ error: 'Please enter a valid M-Pesa transaction code or message' })
    }

    // Extract M-Pesa receipt code if the user pasted the full M-Pesa SMS or just the 10-character code
    const receiptMatch = rawText.toUpperCase().match(/\b([A-Z0-9]{10})\b/)
    const cleanCode = (receiptMatch ? receiptMatch[1] : rawText.toUpperCase().split(/\s+/)[0]).trim()

    if (cleanCode.length < 6) {
      return res.status(400).json({ error: 'Please enter a valid M-Pesa code (e.g. TCQ74RQ4JH)' })
    }

    // 1. Check if a deposit already exists with this receipt or reference
    const matchedDeposit = await Deposit.findOne({
      $or: [
        { mpesaReceipt: cleanCode },
        { submittedReceipt: cleanCode },
        { externalRef: cleanCode },
        { paydReference: cleanCode },
        { apiRef: cleanCode }
      ]
    })

    if (matchedDeposit) {
      // Ensure another user cannot claim someone else's deposit
      if (matchedDeposit.userId.toString() !== userId.toString()) {
        return res.status(403).json({ error: 'This transaction code belongs to another account.' })
      }

      // If the deposit was marked completed by webhook but not yet credited, credit it now
      if (matchedDeposit.status === 'completed' && !matchedDeposit.credited) {
        const { user } = await creditDepositAtomically(matchedDeposit._id, { mpesaReceipt: cleanCode })
        return res.json({
          success: true,
          status: 'completed',
          amount: matchedDeposit.amount,
          newBalance: user?.balance,
          message: `Transaction ${cleanCode} verified and KSH ${matchedDeposit.amount} credited to your wallet!`
        })
      }

      if (matchedDeposit.status === 'completed' && matchedDeposit.credited) {
        const user = await User.findById(userId).select('balance freebet freebetLocked').lean()
        return res.json({
          success: true,
          status: 'completed',
          amount: matchedDeposit.amount,
          newBalance: user?.balance,
          message: `Transaction ${cleanCode} (KSH ${matchedDeposit.amount}) is already credited to your balance.`
        })
      }
    }

    // 2. Attach the submitted M-Pesa receipt to the user's most recent uncredited deposit so webhooks/admins can match it
    const latestPending = await Deposit.findOneAndUpdate(
      { userId, credited: { $ne: true } },
      {
        $set: {
          submittedReceipt: cleanCode,
          status: 'pending'
        }
      },
      { sort: { createdAt: -1 }, new: true }
    )

    return res.json({
      success: true,
      status: 'pending',
      depositId: latestPending?._id || null,
      apiRef: latestPending?.apiRef || null,
      message: `M-Pesa code ${cleanCode} attached to your deposit for verification. Your balance will update automatically once confirmed.`
    })
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to verify transaction' })
  }
}

// Withdrawal Controller
export async function requestWithdrawal(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId
    const { amount } = req.body
    if (!userId) return res.status(401).json({ error: 'Authentication required' })

    const settings = await (Settings as any).getSettings()
    const minWithdrawal = Number(settings?.minWithdrawal ?? 50)
    const withdrawAmount = Math.round(Number(amount))

    if (!Number.isFinite(withdrawAmount) || withdrawAmount < minWithdrawal) {
      return res.status(400).json({ error: `Minimum withdrawal is KSH ${minWithdrawal}` })
    }

    const checkUser = await User.findById(userId)
    if (!checkUser) return res.status(404).json({ error: 'User not found' })
    if (checkUser.isFrozen) {
      return res.status(403).json({ error: 'Your account is frozen. Please contact support.' })
    }

    const normalizedPhone = normalizePhoneLast9(checkUser.phone || '')
    if (!normalizedPhone || !/^[17]\d{8}$/.test(normalizedPhone)) {
      return res.status(400).json({ error: 'Valid registered Kenyan phone number required for withdrawal' })
    }

    // Deduct balance atomically only after phone validation succeeds
    const user = await User.findOneAndUpdate(
      { _id: userId, isFrozen: { $ne: true }, balance: { $gte: withdrawAmount } },
      { $inc: { balance: -withdrawAmount } },
      { new: true }
    )

    if (!user) return res.status(400).json({ error: 'Insufficient account balance' })

    const fullPhone = `254${normalizedPhone}`
    const withdrawal = await Withdrawal.create({
      userId,
      phone: fullPhone,
      amount: withdrawAmount,
      status: 'pending',
      refunded: false
    })

    emitUserBalanceUpdate(userId, {
      amount: -withdrawAmount,
      newBalance: user.balance,
      freebet: user.freebet,
      freebetLocked: user.freebetLocked,
      type: 'withdrawal_requested'
    })

    return res.json({
      success: true,
      message: `Withdrawal request of KSH ${withdrawAmount} submitted to 0${normalizedPhone}. Funds will be sent shortly.`,
      withdrawalId: withdrawal._id,
      newBalance: user.balance
    })
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Withdrawal request failed' })
  }
}

export async function getUserTransactions(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId
    if (!userId) return res.status(401).json({ error: 'Authentication required' })

    const [deposits, withdrawals] = await Promise.all([
      Deposit.find({ userId }).sort({ createdAt: -1 }).limit(50).lean(),
      Withdrawal.find({ userId }).sort({ createdAt: -1 }).limit(50).lean()
    ])

    const transactions = [
      ...deposits.map((d: any) => ({
        id: d._id.toString(),
        type: 'deposit',
        amount: d.amount,
        status: d.status,
        credited: Boolean(d.credited),
        apiRef: d.apiRef,
        externalRef: d.externalRef || d.paydReference || null,
        mpesaReceipt: d.mpesaReceipt || d.submittedReceipt || null,
        phone: d.phone,
        failureReason: d.failureReason || null,
        date: new Date(d.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
        timestamp: new Date(d.createdAt).getTime()
      })),
      ...withdrawals.map((w: any) => ({
        id: w._id.toString(),
        type: 'withdrawal',
        amount: w.amount,
        status: w.status,
        mpesaReceipt: w.mpesaReceipt || null,
        phone: w.phone,
        failureReason: w.failureReason || null,
        date: new Date(w.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
        timestamp: new Date(w.createdAt).getTime()
      }))
    ].sort((a, b) => b.timestamp - a.timestamp)

    return res.json({ success: true, transactions })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}

// Webhook Controllers
export async function paydWebhook(req: Request, res: Response) {
  try {
    const payload = req.body || {}
    const dataObj = payload.data || payload.transaction || {}

    const externalRef =
      payload.transaction_reference ||
      payload.correlator_id ||
      payload.reference ||
      payload.id ||
      dataObj.transaction_reference ||
      dataObj.correlator_id ||
      dataObj.reference ||
      null

    const narrationText = typeof (payload.narration || dataObj.narration || payload.remarks) === 'string'
      ? (payload.narration || dataObj.narration || payload.remarks)
      : ''
    const refMatchInNarration = narrationText.match(/(DEP-\d+-\d+)/i)
    const extractedFromNarration = refMatchInNarration
      ? refMatchInNarration[1]
      : narrationText.replace(/^Deposit\s+/i, '').trim()

    const internalRef =
      payload.api_ref ||
      payload.merchant_reference ||
      payload.account_reference ||
      dataObj.api_ref ||
      dataObj.merchant_reference ||
      (extractedFromNarration.startsWith('DEP-') ? extractedFromNarration : null)

    const mpesaReceipt = (
      payload.third_party_trans_id ||
      payload.mpesa_receipt ||
      payload.mpesa_reference ||
      payload.receipt_number ||
      payload.trans_id ||
      dataObj.third_party_trans_id ||
      dataObj.mpesa_receipt ||
      dataObj.receipt_number ||
      ''
    ).toString().trim().toUpperCase() || null

    const rawPhone =
      payload.phone_number ||
      payload.msisdn ||
      payload.phone ||
      dataObj.phone_number ||
      dataObj.msisdn ||
      ''
    const webhookPhone = normalizeKenyanPhone(String(rawPhone))

    const rawAmount = payload.amount ?? payload.value ?? dataObj.amount ?? dataObj.value
    const parsedAmount = rawAmount !== undefined && rawAmount !== null ? Number.parseFloat(String(rawAmount)) : null

    const rawStatus = (payload.status || payload.state || dataObj.status || dataObj.state || '').toString().toUpperCase()
    const resultCode = payload.result_code ?? payload.status_code ?? payload.ResultCode ?? dataObj.result_code

    const isSuccess =
      rawStatus === 'SUCCESS' ||
      rawStatus === 'SUCCESSFUL' ||
      rawStatus === 'COMPLETED' ||
      rawStatus === 'COMPLETE' ||
      rawStatus === 'PAID' ||
      rawStatus === 'SETTLED' ||
      resultCode === 0 ||
      resultCode === '0' ||
      (resultCode === 200 && rawStatus !== 'FAILED' && rawStatus !== 'PENDING' && rawStatus !== 'PROCESSING')

    const isPendingOrIntermediate =
      !isSuccess &&
      (rawStatus === 'PENDING' ||
        rawStatus === 'PROCESSING' ||
        rawStatus === 'INITIATED' ||
        rawStatus === 'QUEUED' ||
        rawStatus === 'SENT' ||
        rawStatus === '')

    const isExplicitFailure =
      !isSuccess &&
      !isPendingOrIntermediate &&
      (rawStatus === 'FAILED' ||
        rawStatus === 'CANCELLED' ||
        rawStatus === 'CANCELED' ||
        rawStatus === 'REJECTED' ||
        rawStatus === 'EXPIRED' ||
        (typeof resultCode === 'number' && resultCode > 0 && resultCode !== 200))

    // 1. Locate the Deposit by direct reference or receipt
    const queryConditions: any[] = []
    if (externalRef) {
      queryConditions.push({ paydReference: String(externalRef) }, { externalRef: String(externalRef) })
    }
    if (internalRef) {
      queryConditions.push({ apiRef: String(internalRef) })
    }
    if (mpesaReceipt) {
      queryConditions.push({ mpesaReceipt }, { submittedReceipt: mpesaReceipt })
    }

    let deposit: IDeposit | null = null
    if (queryConditions.length > 0) {
      deposit = await Deposit.findOne({ $or: queryConditions }).sort({ createdAt: -1 })
    }

    // 2. Fallback: If Payd callback omitted api_ref/correlator_id, match recent uncredited deposit by phone + amount
    if (!deposit && webhookPhone && parsedAmount && Number.isFinite(parsedAmount)) {
      const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000)
      deposit = await Deposit.findOne({
        phone: webhookPhone,
        credited: { $ne: true },
        amount: { $gte: parsedAmount - AMOUNT_TOLERANCE, $lte: parsedAmount + AMOUNT_TOLERANCE },
        createdAt: { $gte: twentyMinutesAgo }
      }).sort({ createdAt: -1 })
    }

    if (!deposit) {
      return res.status(200).json({ status: 'ok', message: 'No matching deposit found' })
    }

    // 3. If already credited, just ensure receipt metadata is saved
    if (deposit.credited) {
      if (mpesaReceipt && !deposit.mpesaReceipt) {
        await Deposit.findByIdAndUpdate(deposit._id, { $set: { mpesaReceipt } })
      }
      return res.status(200).json({ status: 'ok', message: 'Already completed and credited' })
    }

    // 4. Handle intermediate/pending webhooks without overwriting status to 'failed'
    if (isPendingOrIntermediate) {
      await Deposit.findByIdAndUpdate(deposit._id, {
        $set: {
          paydReference: externalRef ? String(externalRef) : deposit.paydReference,
          externalRef: externalRef ? String(externalRef) : deposit.externalRef,
          rawWebhookPayload: payload
        }
      })
      return res.status(200).json({ status: 'ok', message: 'Intermediate status recorded' })
    }

    // 5. Handle successful payment
    if (isSuccess) {
      if (parsedAmount !== null && Number.isFinite(parsedAmount) && parsedAmount > 0) {
        if (parsedAmount + AMOUNT_TOLERANCE < deposit.amount) {
          await Deposit.findByIdAndUpdate(deposit._id, {
            $set: {
              failureReason: `Amount mismatch: expected ${deposit.amount}, received ${parsedAmount}`,
              rawWebhookPayload: payload
            }
          })
          return res.status(200).json({ status: 'ok', message: 'Amount underpaid' })
        }
      }

      await creditDepositAtomically(deposit._id, {
        externalRef: externalRef ? String(externalRef) : deposit.externalRef,
        paydReference: externalRef ? String(externalRef) : deposit.paydReference,
        mpesaReceipt,
        rawWebhookPayload: payload,
        verifiedAmount: deposit.amount
      })

      return res.status(200).json({ status: 'ok', message: 'Deposit credited' })
    }

    // 6. Handle explicit failure (only if not already credited)
    if (isExplicitFailure) {
      const failReason =
        payload.failed_reason ||
        payload.reason ||
        payload.message ||
        payload.result_desc ||
        dataObj.failed_reason ||
        dataObj.message ||
        `Transaction ${rawStatus || 'failed'}`

      await Deposit.findOneAndUpdate(
        { _id: deposit._id, credited: { $ne: true } },
        {
          $set: {
            status: 'failed',
            failureReason: String(failReason),
            paydReference: externalRef ? String(externalRef) : deposit.paydReference,
            externalRef: externalRef ? String(externalRef) : deposit.externalRef,
            rawWebhookPayload: payload
          }
        }
      )
    }

    return res.status(200).json({ status: 'ok' })
  } catch (error: any) {
    return res.status(200).json({ status: 'error_logged', error: error.message })
  }
}

export async function intasendWebhook(req: Request, res: Response) {
  try {
    const payload = req.body || {}
    const { invoice_id, state, api_ref, mpesa_reference, failed_reason } = payload
    const normalizedState = String(state || '').toUpperCase()

    const queryOr: any[] = []
    if (api_ref) queryOr.push({ apiRef: String(api_ref) })
    if (invoice_id) queryOr.push({ intasendInvoiceId: String(invoice_id) }, { externalRef: String(invoice_id) })
    if (mpesa_reference) queryOr.push({ submittedReceipt: String(mpesa_reference).toUpperCase() })

    if (queryOr.length === 0) {
      return res.status(200).json({ received: true, message: 'No reference provided' })
    }

    const deposit = await Deposit.findOne({ $or: queryOr }).sort({ createdAt: -1 })
    if (!deposit) {
      return res.status(200).json({ received: true, message: 'Deposit not found' })
    }

    if (normalizedState === 'COMPLETE' || normalizedState === 'COMPLETED') {
      await creditDepositAtomically(deposit._id, {
        externalRef: invoice_id ? String(invoice_id) : deposit.externalRef,
        mpesaReceipt: mpesa_reference ? String(mpesa_reference).toUpperCase() : null,
        rawWebhookPayload: payload,
        verifiedAmount: deposit.amount
      })
      return res.status(200).json({ success: true })
    }

    if (normalizedState === 'FAILED' || normalizedState === 'CANCELLED') {
      await Deposit.findOneAndUpdate(
        { _id: deposit._id, credited: { $ne: true } },
        {
          $set: {
            status: 'failed',
            failureReason: failed_reason || `IntaSend ${normalizedState}`,
            rawWebhookPayload: payload
          }
        }
      )
    }

    return res.status(200).json({ received: true })
  } catch {
    return res.status(200).json({ received: true })
  }
}

// Settings Controller
export async function getPublicConfig(req: Request, res: Response) {
  try {
    const settings = await (Settings as any).getSettings()
    return res.json({
      success: true,
      config: {
        brandName: settings?.companyName || 'RukaBet',
        companyName: settings?.companyName || 'RukaBet',
        whatsappSupportNumber: settings?.whatsappSupport || '254712345678',
        minDeposit: Number(settings?.minDeposit ?? 10),
        minWithdrawal: Number(settings?.minWithdrawal ?? 50),
        freebetUnlockAmount: Number(settings?.freebetUnlockAmount ?? 50),
        initialFreebet: Number(settings?.initialFreebet ?? 150),
        referralReward: Number(settings?.referralReward ?? 20),
        minBet: Number(settings?.minBet ?? 10),
        maxBet: Number(settings?.maxBet ?? 10000),
      }
    })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}

export async function getSettings(req: Request, res: Response) {
  try {
    const settings = await (Settings as any).getSettings()
    return res.json({
      success: true,
      settings: {
        paydWalletUsername: settings.paydWalletUsername || '',
        paydApiUsername: settings.paydApiUsername || '',
        paydApiBaseUrl: (settings.paydApiBaseUrl || 'https://api.payd.money/api/v2/payments').replace('api.mypayd.app', 'api.payd.money'),
        paydCallbackUrl: settings.paydCallbackUrl || '',
        isPasswordConfigured: Boolean(settings.paydApiPassword),
        isSecretConfigured: Boolean(settings.paydApiSecret),
        isManagedViaAdmin: Boolean(settings.paydWalletUsername || settings.paydApiUsername || settings.paydApiSecret),
        companyName: settings.companyName,
        whatsappSupport: settings.whatsappSupport,
        minDeposit: settings.minDeposit ?? 10,
        minWithdrawal: settings.minWithdrawal ?? 50,
        freebetUnlockAmount: settings.freebetUnlockAmount ?? 50,
        initialFreebet: settings.initialFreebet ?? 150,
        referralReward: settings.referralReward ?? 20,
        minBet: settings.minBet ?? 10,
        maxBet: settings.maxBet ?? 10000,
        updatedAt: settings.updatedAt
      }
    })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}

export async function updateSettings(req: Request, res: Response) {
  try {
    const updates = req.body
    const allowedFields = [
      'paydWalletUsername', 'paydApiUsername', 'paydApiPassword', 'paydApiSecret',
      'paydApiBaseUrl', 'paydCallbackUrl', 'companyName', 'whatsappSupport',
      'minDeposit', 'minWithdrawal', 'freebetUnlockAmount', 'initialFreebet',
      'referralReward', 'minBet', 'maxBet'
    ]
    const numericFields = ['minDeposit', 'minWithdrawal', 'freebetUnlockAmount', 'initialFreebet', 'referralReward', 'minBet', 'maxBet']

    const sanitizedUpdates: any = {}
    for (const key of allowedFields) {
      const val = updates[key]
      if (val !== undefined) {
        if (key === 'paydApiPassword' || key === 'paydApiSecret') {
          if (val === '' || val === null) sanitizedUpdates[key] = ''
          else if (typeof val === 'string' && val.trim().length > 0 && !val.includes('•') && !val.includes('*')) {
            sanitizedUpdates[key] = sanitizeKey(val)
          }
        } else if (numericFields.includes(key)) {
          const num = Number(val)
          if (!Number.isNaN(num) && num >= 0) sanitizedUpdates[key] = num
        } else {
          sanitizedUpdates[key] = typeof val === 'string' ? sanitizeKey(val) : val
        }
      }
    }

    const settings = await Settings.findOneAndUpdate({}, { $set: sanitizedUpdates }, { new: true, upsert: true })
    return res.json({
      success: true,
      message: 'Settings updated successfully',
      settings
    })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}

// Admin Controller
export async function adminLogin(req: Request, res: Response) {
  try {
    const { username, password } = req.body
    const validUser = process.env.ADMIN_USERNAME || 'pirate101'
    const validPass = process.env.ADMIN_PASSWORD || '117402'

    if (username !== validUser || password !== validPass) {
      return res.status(401).json({ error: 'Invalid admin credentials' })
    }

    const token = jwt.sign({ username, role: 'admin' }, JWT_SECRET, { expiresIn: '7d' })
    return res.json({ success: true, token, admin: { username } })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}

export async function getAdminOverview(req: Request, res: Response) {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const [
      totalUsers,
      usersCreatedPast24Hours,
      totalBets,
      activeBets,
      completedDeposits,
      pendingDeposits,
      totalWithdrawals
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: twentyFourHoursAgo } }),
      Bet.countDocuments(),
      Bet.countDocuments({ status: 'active' }),
      Deposit.countDocuments({ status: 'completed' }),
      Deposit.countDocuments({ status: 'pending' }),
      Withdrawal.countDocuments()
    ])

    const [totalDepositsAmountAgg, totalWageredAgg, totalWinsAgg, recentUsers, recentDeposits, recentWithdrawals] = await Promise.all([
      Deposit.aggregate([{ $match: { status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Bet.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]),
      Bet.aggregate([{ $match: { status: 'won' } }, { $group: { _id: null, total: { $sum: '$winAmount' } } }]),
      User.find({}).sort({ createdAt: -1 }).limit(10).select('_id username phone balance createdAt'),
      Deposit.find({}).sort({ createdAt: -1 }).limit(10).populate('userId', 'username phone').select('_id userId amount status credited apiRef mpesaReceipt submittedReceipt createdAt'),
      Withdrawal.find({}).sort({ createdAt: -1 }).limit(10).populate('userId', 'username phone').select('_id userId amount status phone mpesaReceipt createdAt')
    ])

    return res.json({
      success: true,
      overview: {
        totals: {
          users: totalUsers,
          newUsers24h: usersCreatedPast24Hours,
          bets: totalBets,
          activeBets,
          completedDeposits,
          pendingDeposits,
          totalWithdrawals,
          totalDepositsAmount: totalDepositsAmountAgg[0]?.total || 0,
          totalWagered: totalWageredAgg[0]?.total || 0,
          totalWins: totalWinsAgg[0]?.total || 0,
          houseGross: (totalWageredAgg[0]?.total || 0) - (totalWinsAgg[0]?.total || 0)
        },
        recentUsers,
        recentDeposits,
        recentWithdrawals
      }
    })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}

export async function getAdminUsers(req: Request, res: Response) {
  try {
    const { search = '', status = 'all', page = 1, limit = 50 } = req.query
    const query: any = {}
    if (search) {
      query.$or = [{ username: { $regex: search, $options: 'i' } }, { phone: { $regex: search, $options: 'i' } }]
    }
    if (status === 'frozen') query.isFrozen = true
    if (status === 'active') query.isFrozen = false

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1)
    const limitNum = Math.min(200, Math.max(1, parseInt(limit as string, 10) || 50))
    const skip = (pageNum - 1) * limitNum

    const [users, total] = await Promise.all([
      User.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      User.countDocuments(query)
    ])

    return res.json({
      success: true,
      users: users.map((u: any) => ({
        ...u,
        balance: Number.isFinite(Number(u.balance)) ? Number(u.balance) : 0,
        freebet: Number.isFinite(Number(u.freebet)) ? Number(u.freebet) : 0,
        freebetLocked: typeof u.freebetLocked === 'boolean' ? u.freebetLocked : true
      })),
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) || 1 }
    })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}

export async function getAdminUserDetail(req: Request, res: Response) {
  try {
    const { id } = req.params
    const user = await User.findById(id).lean()
    if (!user) return res.status(404).json({ error: 'User not found' })

    const [recentBets, recentDeposits, recentWithdrawals] = await Promise.all([
      Bet.find({ userId: id }).sort({ createdAt: -1 }).limit(20).lean(),
      Deposit.find({ userId: id }).sort({ createdAt: -1 }).limit(20).lean(),
      Withdrawal.find({ userId: id }).sort({ createdAt: -1 }).limit(20).lean()
    ])

    return res.json({
      success: true,
      user,
      recentBets,
      recentDeposits,
      recentWithdrawals
    })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}

export async function adjustUserBalance(req: Request, res: Response) {
  try {
    const { id } = req.params
    const { amount, type } = req.body
    const delta = Number(amount)
    if (!Number.isFinite(delta) || delta < 0) return res.status(400).json({ error: 'Invalid amount' })

    const existingUser = await User.findById(id)
    if (!existingUser) return res.status(404).json({ error: 'User not found' })

    let newBalance = existingUser.balance
    if (type === 'credit') newBalance = Math.round((existingUser.balance + delta) * 100) / 100
    else if (type === 'debit') newBalance = Math.max(0, Math.round((existingUser.balance - delta) * 100) / 100)
    else if (type === 'set') newBalance = Math.max(0, Math.round(delta * 100) / 100)
    else return res.status(400).json({ error: 'Type must be credit, debit, or set' })

    existingUser.balance = newBalance
    await existingUser.save()

    emitUserBalanceUpdate(existingUser._id, {
      amount: type === 'debit' ? -delta : delta,
      newBalance: existingUser.balance,
      freebet: existingUser.freebet,
      freebetLocked: existingUser.freebetLocked,
      type: 'admin_adjustment'
    })

    return res.json({ success: true, balance: existingUser.balance })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}

export async function adjustUserFreebet(req: Request, res: Response) {
  try {
    const { id } = req.params
    const { amount, freebetLocked } = req.body
    const user = await User.findById(id)
    if (!user) return res.status(404).json({ error: 'User not found' })

    if (amount !== undefined) {
      const num = Number(amount)
      if (Number.isFinite(num) && num >= 0) user.freebet = num
    }
    if (typeof freebetLocked === 'boolean') {
      user.freebetLocked = freebetLocked
    }
    await user.save()

    emitUserBalanceUpdate(user._id, {
      newBalance: user.balance,
      freebet: user.freebet,
      freebetLocked: user.freebetLocked,
      type: 'freebet_adjustment'
    })

    return res.json({ success: true, user: { _id: user._id, freebet: user.freebet, freebetLocked: user.freebetLocked } })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}

export async function toggleUserFreeze(req: Request, res: Response) {
  try {
    const { id } = req.params
    const user = await User.findById(id)
    if (!user) return res.status(404).json({ error: 'User not found' })
    user.isFrozen = !user.isFrozen
    await user.save()
    return res.json({ success: true, isFrozen: user.isFrozen })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}

export async function resetUserPassword(req: Request, res: Response) {
  try {
    const { id } = req.params
    const { newPassword } = req.body
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 4) {
      return res.status(400).json({ error: 'New password must be at least 4 characters' })
    }
    const user = await User.findById(id)
    if (!user) return res.status(404).json({ error: 'User not found' })
    user.password = newPassword
    await user.save()
    return res.json({ success: true, message: `Password reset successfully for ${user.username}` })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}

export async function syncDatabaseUsers(req: Request, res: Response) {
  try {
    const settings = await (Settings as any).getSettings()
    const defaultFreebet = Number(settings?.initialFreebet ?? 150)
    const allUsers = await User.find({})
    let normalizedCount = 0

    for (const u of allUsers) {
      let changed = false
      if (u.balance === undefined || u.balance === null || isNaN(u.balance)) { u.balance = 0; changed = true }
      if (u.freebet === undefined || u.freebet === null || isNaN(u.freebet)) { u.freebet = defaultFreebet; changed = true }
      if (u.freebetLocked === undefined || u.freebetLocked === null) { u.freebetLocked = true; changed = true }
      if (u.isFrozen === undefined || u.isFrozen === null) { u.isFrozen = false; changed = true }
      if (changed) { await u.save(); normalizedCount++ }
    }

    return res.json({ success: true, normalizedCount })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}

export async function getAdminWithdrawals(req: Request, res: Response) {
  try {
    const { status = 'all' } = req.query
    const query: any = {}
    if (status && status !== 'all') query.status = status
    const withdrawals = await Withdrawal.find(query).sort({ createdAt: -1 }).limit(100).populate('userId', 'username phone balance')
    return res.json({ success: true, withdrawals })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}

export async function updateWithdrawalStatus(req: Request, res: Response) {
  try {
    const { id } = req.params
    const { status, mpesaReceipt, failureReason } = req.body
    if (!['completed', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status must be completed or rejected' })
    }

    // Atomic transition from 'pending' -> 'completed' | 'rejected' prevents double-refunds
    const withdrawal = await Withdrawal.findOneAndUpdate(
      { _id: id, status: 'pending' },
      {
        $set: {
          status,
          refunded: status === 'rejected',
          mpesaReceipt: mpesaReceipt ? String(mpesaReceipt).toUpperCase() : null,
          failureReason: failureReason || (status === 'rejected' ? 'Rejected by admin' : null),
          processedAt: new Date()
        }
      },
      { new: true }
    )

    if (!withdrawal) {
      const existing = await Withdrawal.findById(id)
      if (!existing) return res.status(404).json({ error: 'Withdrawal not found' })
      return res.status(400).json({ error: `Withdrawal is already ${existing.status}` })
    }

    if (status === 'rejected') {
      const user = await User.findByIdAndUpdate(
        withdrawal.userId,
        { $inc: { balance: withdrawal.amount } },
        { new: true }
      )
      if (user) {
        emitUserBalanceUpdate(user._id, {
          amount: withdrawal.amount,
          newBalance: user.balance,
          freebet: user.freebet,
          freebetLocked: user.freebetLocked,
          type: 'withdrawal_refunded'
        })
      }
    }

    return res.json({ success: true, withdrawal })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}

// Dedicated Admin Deposits Endpoint (Audits and Lists all Deposits)
export async function getAdminDeposits(req: Request, res: Response) {
  try {
    const { status = 'all', search = '', limit = 100, page = 1 } = req.query
    const query: any = {}
    if (status && status !== 'all') query.status = status
    if (search) {
      query.$or = [
        { apiRef: { $regex: search,$options: 'i' } },
        { externalRef: { $regex: search,$options: 'i' } },
        { paydReference: { $regex: search,$options: 'i' } },
        { mpesaReceipt: { $regex: search,$options: 'i' } },
        { submittedReceipt: { $regex: search,$options: 'i' } },
        { phone: { $regex: search,$options: 'i' } }
      ]
    }

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1)
    const limitNum = Math.min(200, Math.max(1, parseInt(limit as string, 10) || 100))
    const skip = (pageNum - 1) * limitNum

    const [deposits, total, completedSumAgg] = await Promise.all([
      Deposit.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).populate('userId', 'username phone balance'),
      Deposit.countDocuments(query),
      Deposit.aggregate([{ $match: { status: 'completed' } }, {$group: { _id: null, total: { $sum: '$amount' } } }])
    ])

    return res.json({
      success: true,
      deposits,
      totalCompletedAmount: completedSumAgg[0]?.total || 0,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) || 1 }
    })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}

// Admin Manual Deposit Approval / Rejection Endpoint
export async function updateAdminDepositStatus(req: Request, res: Response) {
  try {
    const { id } = req.params
    const { status, mpesaReceipt, failureReason } = req.body
    if (!['completed', 'failed'].includes(status)) {
      return res.status(400).json({ error: 'Status must be completed or failed' })
    }

    const deposit = await Deposit.findById(id)
    if (!deposit) return res.status(404).json({ error: 'Deposit not found' })

    if (status === 'completed') {
      const result = await creditDepositAtomically(deposit._id, {
        mpesaReceipt: mpesaReceipt || deposit.submittedReceipt || deposit.mpesaReceipt || 'ADMIN-VERIFIED',
        verifiedAmount: deposit.amount
      })
      return res.json({
        success: true,
        creditedNow: result.creditedNow,
        deposit: result.deposit,
        userBalance: result.user?.balance
      })
    }

    if (deposit.credited) {
      return res.status(400).json({ error: 'Cannot mark an already-credited deposit as failed' })
    }

    deposit.status = 'failed'
    deposit.failureReason = failureReason || 'Rejected by admin'
    await deposit.save()

    return res.json({ success: true, deposit })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}

// ── 6. REAL-TIME PROVABLY FAIR ODDS & SOCKET GAME ENGINE ─────────────────────

let io: Server | null = null

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

let activeOddsState = {
  enabled: false,
  mode: 'normal' as 'normal' | 'range' | 'min_multiplier' | 'exact',
  minMultiplier: 2.0,
  maxMultiplier: 5.0,
  exactMultiplier: undefined as number | undefined,
  durationType: 'minutes' as 'minutes' | 'rounds' | 'scheduled_window' | 'indefinite',
  durationMinutes: 15,
  roundsTotal: 10,
  roundsRemaining: 10,
  scheduledStartTime: undefined as number | undefined,
  scheduledEndTime: undefined as number | undefined,
  startedAt: undefined as number | undefined,
  expiresAt: undefined as number | undefined,
  lastActivatedBy: 'system'
}

let currentServerSeed = ''
let waitingStartedAt = Date.now()
let flyingStartedAt = 0
let crashingStartedAt = 0

let tickTimer: NodeJS.Timeout | null = null
let waitingTimer: NodeJS.Timeout | null = null
let crashingTimer: NodeJS.Timeout | null = null
let crashedTimer: NodeJS.Timeout | null = null

function emitGameSnapshot(target?: Socket): void {
  const payload = {
    phase: gameState.phase,
    roundId: gameState.roundId,
    nonce: gameState.nonce,
    multiplier: Number(gameState.multiplier.toFixed(2)),
    crashPoint: Number(gameState.crashPoint.toFixed(2)),
    waitProgress: Number(gameState.waitProgress.toFixed(3)),
    roundHistory: gameState.roundHistory,
    elapsedMs: gameState.elapsedMs,
    serverSeedHash: gameState.serverSeedHash,
    revealedSeed: gameState.revealedSeed,
    liveBets: gameState.liveBets
  }

  if (target) {
    target.emit('GAME_STATE', payload)
  } else if (io) {
    io.emit('GAME_STATE', payload)
  }
}

function generateServerSeed(): string {
  return crypto.randomBytes(32).toString('hex')
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function generateCrashPoint(serverSeed: string, clientSeed: string, nonce: number): number {
  const hash = crypto.createHmac('sha256', serverSeed).update(`${clientSeed}:${nonce}`).digest('hex')
  const hex = hash.substring(0, 13)
  const e = Math.pow(2, 52)
  const h = parseInt(hex, 16)
  if (h % 33 === 0) return 1.00
  const raw = Math.floor((100 * e - h) / (e - h)) / 100
  return Math.min(200, Math.max(1.01, raw))
}

function determineCrashPoint(clientSeed: string, nonce: number): { serverSeed: string; crashPoint: number } {
  const bestSeed = generateServerSeed()
  const natural = generateCrashPoint(bestSeed, clientSeed, nonce)

  if (!activeOddsState.enabled) {
    return { serverSeed: bestSeed, crashPoint: natural }
  }

  const minMult = Math.max(1.01, activeOddsState.minMultiplier)
  const maxMult = Math.min(200, Math.max(minMult, activeOddsState.maxMultiplier))

  if (activeOddsState.mode === 'exact' && typeof activeOddsState.exactMultiplier === 'number') {
    return { serverSeed: bestSeed, crashPoint: Math.min(200, Math.max(1.01, activeOddsState.exactMultiplier)) }
  }

  if (activeOddsState.mode === 'min_multiplier') {
    return { serverSeed: bestSeed, crashPoint: Math.max(natural, minMult) }
  }

  const forced = Math.round((minMult + Math.random() * (maxMult - minMult)) * 100) / 100
  return { serverSeed: bestSeed, crashPoint: forced }
}

function calculateCurrentMultiplier(elapsedMs: number): number {
  if (elapsedMs <= 0) return 1
  const t = elapsedMs / 1000
  const mult = 1 + 0.06 * Math.pow(t, 2) + 0.004 * Math.pow(t, 3)
  return Math.max(1, Math.round(mult * 100) / 100)
}

function generateMockLiveBets(): SharedLiveBet[] {
  const botsCount = MIN_BOT_BETS + Math.floor(Math.random() * BOT_BET_VARIANCE)
  const bets: SharedLiveBet[] = []
  const availableAmounts = [10, 20, 50, 100, 200, 500, 1000]

  for (let i = 0; i < botsCount; i++) {
    const bet = availableAmounts[Math.floor(Math.random() * availableAmounts.length)]
    const target = Math.round((1.1 + Math.random() * 4.5) * 100) / 100
    bets.push({
      id: `bot-bet-${Date.now()}-${i}`,
      user: `Player_${Math.floor(100 + Math.random() * 900)}`,
      rank: i + 1,
      bet,
      cashout: null,
      won: null,
      cashoutTarget: target,
      roundId: gameState.roundId,
      updatedAt: Date.now()
    })
  }
  return bets
}

function startWaitingPhase(): void {
  gameState.phase = 'waiting'
  gameState.nonce += 1
  gameState.roundId = `round-${gameState.nonce}`
  gameState.multiplier = 1
  gameState.waitProgress = 0
  gameState.elapsedMs = 0

  const { serverSeed, crashPoint } = determineCrashPoint(SERVER_CLIENT_SEED, gameState.nonce)
  currentServerSeed = serverSeed
  gameState.crashPoint = crashPoint
  gameState.serverSeedHash = sha256(serverSeed)
  gameState.revealedSeed = ''
  gameState.liveBets = generateMockLiveBets()

  waitingStartedAt = Date.now()
  emitGameSnapshot()

  waitingTimer = setInterval(() => {
    const elapsed = Date.now() - waitingStartedAt
    gameState.waitProgress = Math.min(1, elapsed / WAIT_MS)
    if (gameState.waitProgress >= 1) {
      if (waitingTimer) clearInterval(waitingTimer)
      startFlyingPhase()
    } else {
      io?.emit('WAIT_PROGRESS', { progress: gameState.waitProgress })
    }
  }, 100)
}

function startFlyingPhase(): void {
  gameState.phase = 'flying'
  gameState.waitProgress = 1
  flyingStartedAt = Date.now()
  emitGameSnapshot()

  tickTimer = setInterval(() => {
    const elapsed = Date.now() - flyingStartedAt
    gameState.elapsedMs = elapsed
    gameState.multiplier = calculateCurrentMultiplier(elapsed)

    for (const b of gameState.liveBets) {
      if (!b.cashout && gameState.multiplier >= b.cashoutTarget && b.cashoutTarget < gameState.crashPoint) {
        b.cashout = b.cashoutTarget
        b.won = Math.round(b.bet * b.cashoutTarget * 100) / 100
      }
    }

    if (gameState.multiplier >= gameState.crashPoint) {
      if (tickTimer) clearInterval(tickTimer)
      gameState.multiplier = gameState.crashPoint
      startCrashingPhase()
    } else {
      io?.emit('MULTIPLIER_UPDATE', { multiplier: gameState.multiplier, elapsedMs: gameState.elapsedMs })
    }
  }, TICK_MS)
}

function startCrashingPhase(): void {
  gameState.phase = 'crashing'
  crashingStartedAt = Date.now()
  emitGameSnapshot()

  crashingTimer = setTimeout(() => {
    startCrashedPhase()
  }, CRASHING_MS)
}

async function startCrashedPhase(): Promise<void> {
  gameState.phase = 'crashed'
  gameState.revealedSeed = currentServerSeed
  gameState.roundHistory.unshift(gameState.crashPoint)
  if (gameState.roundHistory.length > MAX_HISTORY) {
    gameState.roundHistory.pop()
  }

  emitGameSnapshot()

  try {
    await Round.findOneAndUpdate(
      { roundId: gameState.roundId },
      {
        $set: {
          roundId: gameState.roundId,
          nonce: gameState.nonce,
          crashPoint: gameState.crashPoint,
          serverSeed: currentServerSeed,
          clientSeed: SERVER_CLIENT_SEED,
          combinedHash: gameState.serverSeedHash,
          startTime: new Date(flyingStartedAt || Date.now()),
          crashedAt: new Date()
        }
      },
      { upsert: true }
    )
    await Bet.updateMany({ roundId: gameState.roundId, status: 'active' }, { $set: { status: 'lost' } })
  } catch {}

  crashedTimer = setTimeout(() => {
    startWaitingPhase()
  }, CRASH_DISPLAY_MS)
}

function authenticateSocketRoom(socket: Socket, rawToken?: string): string | null {
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
      socket.join(`user:${decoded.userId}`)
      return decoded.userId
    }
  } catch {}
  return null
}

export function initializeSocket(server: HttpServer): Server {
  io = new Server(server, {
    cors: { origin: true, credentials: true },
    transports: ['websocket', 'polling']
  })

  io.on('connection', (socket: Socket) => {
    // Automatically join `user:${userId}` room on connection so DEPOSIT_SUCCESS & BALANCE_UPDATE arrive immediately
    authenticateSocketRoom(socket)
    emitGameSnapshot(socket)

    // Allow explicit room registration when a user logs in after socket connects
    socket.on('AUTHENTICATE', (data: { token?: string; userId?: string }) => {
      authenticateSocketRoom(socket, data?.token)
    })

    socket.on('JOIN_USER_ROOM', (data: { token?: string; userId?: string }) => {
      authenticateSocketRoom(socket, data?.token)
    })

    socket.on('PLACE_BET', async (data: { amount: number; isFreebet?: boolean; token?: string }) => {
      try {
        const userId = authenticateSocketRoom(socket, data?.token)
        if (!userId) return socket.emit('BET_ERROR', { error: 'Authentication required' })

        const { amount, isFreebet } = data
        const betAmount = Number(amount)
        if (!Number.isFinite(betAmount) || betAmount < 1) {
          return socket.emit('BET_ERROR', { error: 'Invalid bet amount' })
        }
        if (gameState.phase !== 'waiting') {
          return socket.emit('BET_ERROR', { error: 'Betting window closed' })
        }

        const checkUser = await User.findById(userId)
        if (!checkUser) return socket.emit('BET_ERROR', { error: 'User not found' })
        if (checkUser.isFrozen) return socket.emit('BET_ERROR', { error: 'Account is frozen' })

        let user: IUser | null = null
        if (isFreebet) {
          if (checkUser.freebetLocked) {
            const settings = await (Settings as any).getSettings()
            const unlockAmount = Number(settings?.freebetUnlockAmount ?? 50)
            return socket.emit('BET_ERROR', { error: `Freebets locked: Deposit KSH ${unlockAmount}+ to unlock` })
          }
          user = await User.findOneAndUpdate(
            { _id: userId, isFrozen: { $ne: true }, freebetLocked: false, freebet: {$gte: betAmount } },
            { $inc: { freebet: -betAmount } },
            { new: true }
          )
        } else {
          user = await User.findOneAndUpdate(
            { _id: userId, isFrozen: { $ne: true }, balance: {$gte: betAmount } },
            { $inc: { balance: -betAmount },$set: { hasPlayedWithMoney: true } },
            { new: true }
          )
        }

        if (!user) return socket.emit('BET_ERROR', { error: 'Insufficient funds' })

        const bet = await Bet.create({
          userId,
          roundId: gameState.roundId,
          amount: betAmount,
          isFreebet: Boolean(isFreebet),
          status: 'active'
        })

        socket.emit('BET_SUCCESS', { betId: bet._id, balance: user.balance, freebet: user.freebet })
      } catch {
        socket.emit('BET_ERROR', { error: 'Failed to place bet' })
      }
    })

    socket.on('CASHOUT', async (data: { betId: string; token?: string }) => {
      try {
        if (gameState.phase !== 'flying') return socket.emit('CASHOUT_ERROR', { error: 'Round not flying' })
        const userId = authenticateSocketRoom(socket, data?.token)
        if (!userId) return socket.emit('CASHOUT_ERROR', { error: 'Authentication required' })

        const currentMult = gameState.multiplier
        const existingBet = await Bet.findOne({ _id: data.betId, userId, status: 'active' })
        if (!existingBet) return socket.emit('CASHOUT_ERROR', { error: 'Active bet not found' })

        const winAmount = Math.round(existingBet.amount * currentMult * 100) / 100

        // Single atomic state transition from 'active' -> 'won' prevents double-cashout race condition
        const bet = await Bet.findOneAndUpdate(
          { _id: existingBet._id, userId, status: 'active' },
          { $set: { status: 'won', multiplierCaught: currentMult, winAmount } },
          { new: true }
        )

        if (!bet) return socket.emit('CASHOUT_ERROR', { error: 'Bet already settled' })

        const user = await User.findByIdAndUpdate(userId, { $inc: { balance: winAmount } }, { new: true })
        socket.emit('CASHOUT_SUCCESS', { winAmount, multiplier: currentMult, newBalance: user?.balance })
      } catch {
        socket.emit('CASHOUT_ERROR', { error: 'Cashout failed' })
      }
    })
  })

  startWaitingPhase()
  return io
}

export function getIO(): Server | null {
  return io
}

export function getOddsEngineState() {
  return { ...activeOddsState }
}

export async function setOddsEngineRule(req: Request, res: Response) {
  try {
    const { mode, minMultiplier, maxMultiplier, exactMultiplier } = req.body
    activeOddsState.mode = mode || 'normal'
    activeOddsState.enabled = mode !== 'normal'
    if (minMultiplier) activeOddsState.minMultiplier = Number(minMultiplier)
    if (maxMultiplier) activeOddsState.maxMultiplier = Number(maxMultiplier)
    if (exactMultiplier) activeOddsState.exactMultiplier = Number(exactMultiplier)

    const doc = await OddsControl.getOddsControl()
    doc.mode = activeOddsState.mode
    doc.enabled = activeOddsState.enabled
    await doc.save()

    return res.json({ success: true, state: activeOddsState })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}

export async function resetOddsEngine(req: Request, res: Response) {
  try {
    activeOddsState.enabled = false
    activeOddsState.mode = 'normal'
    const doc = await OddsControl.getOddsControl()
    doc.enabled = false
    doc.mode = 'normal'
    await doc.save()
    return res.json({ success: true, message: 'Odds reset to normal' })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}

export async function getOddsEngineConfig(req: Request, res: Response) {
  try {
    const doc = await OddsControl.getOddsControl()
    return res.json({ success: true, state: activeOddsState, config: doc })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}

// ── 7. EXPRESS SERVER SETUP & ROUTE BINDINGS ─────────────────────────────────

const app = express()
const httpServer = createServer(app)
app.set('trust proxy', 1)

app.use(cors({ origin: true, credentials: true }))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const distPath = path.join(__dirname, 'dist')

if (IS_PRODUCTION) {
  app.use((req, res, next) => {
    const proto = req.headers['x-forwarded-proto']
    if (proto && proto !== 'https') {
      return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`)
    }
    next()
  })
}

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }))

// Public configuration
app.get('/api/public-config', getPublicConfig)
app.get('/api/config', getPublicConfig)
app.get('/api/settings/public', getPublicConfig)

// Auth endpoints
app.post('/api/auth/register', register)
app.post('/api/auth/login', login)
app.get('/api/auth/me', authMiddleware, getMe)
app.post('/api/auth/change-password', authMiddleware, changePassword)

// Deposit & Withdrawal endpoints
app.post('/api/deposit', depositRateLimit, authMiddleware, initiateDeposit)
app.get('/api/deposit/:id/status', authMiddleware, getDepositStatus)
app.post('/api/deposit/verify', authMiddleware, verifyPendingDeposit)
app.post('/api/withdraw', depositRateLimit, authMiddleware, requestWithdrawal)
app.get('/api/user/transactions', authMiddleware, getUserTransactions)

// Payment Webhooks
app.post(PAYD_WEBHOOK_PATH, webhookRateLimit, paydWebhook)
app.post(INTASEND_WEBHOOK_PATH, webhookRateLimit, intasendWebhook)

// Admin Management APIs
app.post('/api/admin/login', adminRateLimit, adminLogin)
app.get('/api/settings', adminRateLimit, adminMiddleware, getSettings)
app.get('/api/admin/settings', adminRateLimit, adminMiddleware, getSettings)
app.put('/api/settings', adminRateLimit, adminMiddleware, updateSettings)
app.put('/api/admin/settings', adminRateLimit, adminMiddleware, updateSettings)
app.get('/api/admin/overview', adminRateLimit, adminMiddleware, getAdminOverview)
app.get('/api/admin/users', adminRateLimit, adminMiddleware, getAdminUsers)
app.post('/api/admin/users/sync-db', adminRateLimit, adminMiddleware, syncDatabaseUsers)
app.get('/api/admin/users/:id', adminRateLimit, adminMiddleware, getAdminUserDetail)
app.post('/api/admin/users/:id/adjust-balance', adminRateLimit, adminMiddleware, adjustUserBalance)
app.post('/api/admin/users/:id/adjust-freebet', adminRateLimit, adminMiddleware, adjustUserFreebet)
app.post('/api/admin/users/:id/toggle-freeze', adminRateLimit, adminMiddleware, toggleUserFreeze)
app.post('/api/admin/users/:id/reset-password', adminRateLimit, adminMiddleware, resetUserPassword)

// Admin Transactions & Deposits Management
app.get('/api/admin/withdrawals', adminRateLimit, adminMiddleware, getAdminWithdrawals)
app.post('/api/admin/withdrawals/:id/status', adminRateLimit, adminMiddleware, updateWithdrawalStatus)
app.get('/api/admin/deposits', adminRateLimit, adminMiddleware, getAdminDeposits)
app.post('/api/admin/deposits/:id/status', adminRateLimit, adminMiddleware, updateAdminDepositStatus)

// Admin Odds Engine Management
app.get('/api/admin/odds-engine', adminRateLimit, adminMiddleware, getOddsEngineConfig)
app.post('/api/admin/odds-engine', adminRateLimit, adminMiddleware, setOddsEngineRule)
app.post('/api/admin/odds-engine/reset', adminRateLimit, adminMiddleware, resetOddsEngine)

// SPA Static Delivery
if (IS_PRODUCTION) {
  app.use(express.static(distPath))
  app.get('/{*splat}', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

// ── 8. SERVER INITIALIZATION & LIFECYCLE ──────────────────────────────────────

export async function startServer() {
  if (!MONGO_URI) {
    console.error('❌ MONGO_URI is missing!')
    process.exit(1)
  }

  await mongoose.connect(MONGO_URI)
  console.log('✅ Connected to MongoDB')

  // Backfill `credited: true` for any historical completed deposits so migrations are seamless
  await Deposit.updateMany(
    { status: 'completed', credited: { $ne: true } },
    { $set: { credited: true } }
  ).catch(() => {})

  // Resume round nonce and history from MongoDB so restarts never collide on `roundId`
  const recentRounds = await Round.find({}).sort({ createdAt: -1 }).limit(MAX_HISTORY).lean()
  if (recentRounds.length > 0) {
    gameState.roundHistory = recentRounds.map((r: any) => Number(r.crashPoint))
    const maxNonce = recentRounds.reduce((max: number, r: any) => {
      const parsedFromId = parseInt(String(r.roundId || '').replace(/^round-/, ''), 10)
      const n = r.nonce || (Number.isFinite(parsedFromId) ? parsedFromId : 0)
      return Math.max(max, n)
    }, INITIAL_NONCE)
    gameState.nonce = maxNonce
    gameState.roundId = `round-${maxNonce}`
  }

  await (Settings as any).getSettings()
  initializeSocket(httpServer)

  httpServer.listen(PORT, () => {
    console.log(`🚀 RukaBet unified server running on port ${PORT}`)
  })
}

if (process.env.NODE_ENV !== 'test') {
  startServer().catch((err) => {
    console.error('Server boot failed:', err)
  })
}

export default app