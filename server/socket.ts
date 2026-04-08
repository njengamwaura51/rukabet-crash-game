import { Server as HttpServer } from 'http'
import { Server, Socket } from 'socket.io'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { User } from './models/User.js'
import { Bet } from './models/Bet.js'

let io: Server | null = null

const JWT_SECRET = process.env.JWT_SECRET || 'rukabet-jwt-secret-2026'

const WAIT_MS = 5000
const CRASH_DISPLAY_MS = 3000
const CRASHING_MS = 700
const TICK_MS = 100
const MAX_HISTORY = 20
const MAX_LIVE_BETS = 10
const SERVER_CLIENT_SEED = process.env.GAME_CLIENT_SEED || crypto.randomBytes(16).toString('hex')

const BOT_NAMES = [
  'dk**29', 'km**93', 'mp**17', 'ja**41', 'ar**84', 'pt**66', 'su**52', 'ra**78',
  'bo**35', 'ct**10', 'fx**63', 'gu**97', 'hy**42', 'lm**89', 'nk**34', 'tw**16',
  'ud**51', 'vn**75', 'ws**88', 'xp**23', 'yo**90', 'zr**67', 'el**22', 'if**94',
  'qz**46', 'om**79', 'wr**82', 'ni**55', 'yx**48', 'ko**31', 'mu**74', 'pk**27',
  'jd**60', 're**13', 'st**96', 'az**49', 'bx**72', 'cw**25', 'dm**58', 'eq**81'
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
  roundId: 'round-1',
  nonce: 1,
  multiplier: 1,
  crashPoint: 0,
  waitProgress: 0,
  roundHistory: [1.89, 25.04, 1.33, 1.27, 4.4, 2.36, 15.64],
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
  if (roll < 0.4) return 1.1 + Math.random() * 0.5
  if (roll < 0.7) return 1.5 + Math.random() * 1.5
  return 2.5 + Math.random() * 5
}

function seedRoundBotBets(): void {
  const count = 22 + Math.floor(Math.random() * 14)
  const highRollerCount = Math.ceil(count * 0.1)

  for (let i = 0; i < count; i++) {
    const botBet: SharedLiveBet = {
      id: `bot-${gameState.roundId}-${i + 1}`,
      user: BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)],
      rank: 1 + Math.floor(Math.random() * 5),
      bet: getRandomBotBetAmount(i < highRollerCount),
      cashout: null,
      won: null,
      cashoutTarget: getRandomBotCashoutTarget(),
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
    await Bet.updateMany(
      { roundId, status: 'active' },
      { status: 'lost', multiplierCaught: crashPoint }
    )
  } catch (error) {
    console.error('Round crash persistence error:', error)
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

  waitingStartedAt = Date.now()
  currentServerSeed = crypto.randomBytes(32).toString('hex')
  gameState.serverSeedHash = crypto.createHash('sha256').update(currentServerSeed).digest('hex')
  gameState.crashPoint = computeCrashPoint(currentServerSeed, SERVER_CLIENT_SEED, gameState.nonce)

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
    const crashPoint = Math.round(gameState.crashPoint * 100) / 100
    gameState.phase = 'crashed'
    gameState.multiplier = crashPoint
    gameState.elapsedMs = Date.now() - crashingStartedAt
    gameState.roundHistory = [...gameState.roundHistory, crashPoint].slice(-MAX_HISTORY)

    await markRoundLostBets(gameState.roundId, crashPoint)
    emitGameSnapshot()

    crashedTimer = setTimeout(() => {
      gameState.nonce += 1
      startWaiting()
    }, CRASH_DISPLAY_MS)
  }, CRASHING_MS)
}

function initializeGameLoop(): void {
  stopTimers()
  gameState.nonce = 1
  startWaiting()
}

export function initializeSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === 'production'
        ? process.env.FRONTEND_URL
        : ['http://localhost:5175', 'http://localhost:3000'],
      methods: ['GET', 'POST'],
      credentials: true
    },
    pingInterval: 25000,
    pingTimeout: 60000,
    transports: ['websocket', 'polling']
  })

  initializeGameLoop()

  io.on('connection', (socket: Socket) => {
    console.log(`🔌 Client connected: ${socket.id}`)

    socket.emit('GAME_SNAPSHOT', gameState)
    socket.emit('LIVE_BETS_SNAPSHOT', gameState.liveBets)

    socket.on('authenticate', async (token: string) => {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string }
        const user = await User.findById(decoded.userId)

        if (user) {
          socket.data.userId = decoded.userId
          socket.join(`user:${decoded.userId}`)
          console.log(`✅ User ${user.phone} authenticated on socket ${socket.id}`)

          socket.emit('authenticated', {
            success: true,
            balance: user.balance,
            freebet: user.freebet
          })
        }
      } catch (error) {
        console.error('Socket auth error:', error)
        socket.emit('authenticated', { success: false, error: 'Invalid token' })
      }
    })

    socket.on('PLACE_BET', async (data: { amount: number; roundId?: string }) => {
      try {
        const userId = socket.data.userId
        if (!userId) {
          return socket.emit('BET_ERROR', { error: 'Not authenticated' })
        }

        const { amount } = data
        if (!amount || amount < 1) {
          return socket.emit('BET_ERROR', { error: 'Invalid bet amount' })
        }

        if (gameState.phase !== 'waiting') {
          return socket.emit('BET_ERROR', { error: 'Betting window is closed for this round' })
        }

        const user = await User.findOneAndUpdate(
          { _id: userId, balance: { $gte: amount } },
          { $inc: { balance: -amount } },
          { new: true }
        )

        if (!user) {
          return socket.emit('BET_ERROR', { error: 'Insufficient balance' })
        }

        const bet = await Bet.create({
          userId,
          roundId: gameState.roundId,
          amount,
          status: 'active'
        })

        console.log(`🎰 Bet placed: User ${user.phone}, Amount ${amount}, Round ${gameState.roundId}`)

        socket.emit('BET_PLACED', {
          success: true,
          betId: bet._id.toString(),
          amount,
          roundId: gameState.roundId,
          newBalance: user.balance
        })

        pushLiveBetUpdate({
          id: `user-${bet._id.toString()}`,
          user: user.username,
          rank: 1,
          bet: amount,
          cashout: null,
          won: null,
          cashoutTarget: 0,
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
        socket.emit('BET_ERROR', { error: error.message })
      }
    })

    socket.on('CASH_OUT', async (data: { betId: string; multiplier?: number }) => {
      try {
        const userId = socket.data.userId
        if (!userId) {
          return socket.emit('CASHOUT_ERROR', { error: 'Not authenticated' })
        }

        if (gameState.phase !== 'flying') {
          return socket.emit('CASHOUT_ERROR', { error: 'Cannot cash out outside flying phase' })
        }

        const { betId } = data
        const serverMultiplier = Math.round(gameState.multiplier * 100) / 100

        const existingBet = await Bet.findById(betId)
        if (!existingBet) {
          return socket.emit('CASHOUT_ERROR', { error: 'Bet not found' })
        }

        const winAmount = Math.round(existingBet.amount * serverMultiplier * 100) / 100

        const bet = await Bet.findOneAndUpdate(
          { _id: betId, userId, status: 'active' },
          {
            status: 'won',
            multiplierCaught: serverMultiplier,
            winAmount
          },
          { new: true }
        )

        if (!bet) {
          return socket.emit('CASHOUT_ERROR', { error: 'Bet not found or already cashed out' })
        }

        const user = await User.findByIdAndUpdate(
          userId,
          { $inc: { balance: winAmount } },
          { new: true }
        )

        console.log(`💰 Cash out: User ${user?.phone}, Win ${winAmount} at ${serverMultiplier}x`)

        socket.emit('CASHOUT_SUCCESS', {
          success: true,
          betId: bet._id.toString(),
          multiplier: serverMultiplier,
          winAmount,
          newBalance: user?.balance
        })

        pushLiveBetUpdate({
          id: `user-${bet._id.toString()}`,
          user: user?.username || 'Player',
          rank: 1,
          bet: bet.amount,
          cashout: serverMultiplier,
          won: winAmount,
          cashoutTarget: 0,
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
