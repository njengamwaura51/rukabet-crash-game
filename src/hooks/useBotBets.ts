import { useState, useEffect, useRef, useCallback } from 'react'
import type { Phase } from './useGameState'

export interface BotBet {
  id: string
  user: string
  rank: number
  bet: number
  cashout: number | null
  won: number | null
  cashoutTarget: number
  isUser: false
  roundId: string
  updatedAt: number
  avatar: string
}

// Masked phone-style usernames like k2****76, m7****23, etc.
const USERNAME_PREFIXES = [
  'k', 'm', 'j', 'b', 'd', 'p', 's', 'a', 'r', 'f',
  'c', 'n', 'e', 'v', 'g', 'w', 'h', 't', 'l', 'o',
]

function seededRandom(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x80000000
  }
}

function generateMaskedUsername(rng: () => number): string {
  const prefix = USERNAME_PREFIXES[Math.floor(rng() * USERNAME_PREFIXES.length)]
  const firstDigit = Math.floor(rng() * 9) + 1
  const lastTwo = String(Math.floor(rng() * 100)).padStart(2, '0')
  return `${prefix}${firstDigit}**${lastTwo}`
}

// Bet amounts ranging from 10 to 10,000 KSH
const BET_AMOUNTS = [
  10, 15, 20, 25, 30, 50, 75, 100, 150, 200,
  250, 300, 500, 750, 1000, 1500, 2000, 2500,
  3000, 5000, 7500, 10000,
]

function pickBetAmount(rng: () => number): number {
  const r = rng()
  if (r < 0.25) return BET_AMOUNTS[Math.floor(rng() * 5)]          // 10-30 (common small bets)
  if (r < 0.45) return BET_AMOUNTS[5 + Math.floor(rng() * 4)]      // 50-200
  if (r < 0.65) return BET_AMOUNTS[9 + Math.floor(rng() * 4)]      // 200-500
  if (r < 0.80) return BET_AMOUNTS[13 + Math.floor(rng() * 4)]     // 750-2500
  if (r < 0.92) return BET_AMOUNTS[17 + Math.floor(rng() * 3)]     // 2500-5000
  return BET_AMOUNTS[20 + Math.floor(rng() * 2)]                    // 7500-10000 (high rollers)
}

function pickCashoutTarget(rng: () => number): number {
  const r = rng()
  if (r < 0.15) return 1.1 + rng() * 0.2                           // 1.10-1.30 (early cashout)
  if (r < 0.40) return 1.3 + rng() * 0.5                           // 1.30-1.80
  if (r < 0.65) return 1.8 + rng() * 1.2                           // 1.80-3.00
  if (r < 0.85) return 3.0 + rng() * 4.0                           // 3.00-7.00
  return 7.0 + rng() * 13.0                                        // 7.00-20.00 (diamond hands)
}

const MIN_BOTS = 15
const MAX_BOTS = 25

export function useBotBets(phase: Phase, multiplier: number): BotBet[] {
  const [bots, setBots] = useState<BotBet[]>([])
  const roundIdRef = useRef<string>(`bot_${Date.now()}`)
  const prevPhaseRef = useRef<Phase>(phase)
  const botsInitializedRef = useRef(false)

  const generateBots = useCallback(() => {
    const seed = Date.now()
    const rng = seededRandom(seed)
    const count = MIN_BOTS + Math.floor(rng() * (MAX_BOTS - MIN_BOTS + 1))
    const usedNames = new Set<string>()
    const newBots: BotBet[] = []
    const roundId = `bot_${seed}`
    roundIdRef.current = roundId

    for (let i = 0; i < count; i++) {
      let name: string
      do {
        name = generateMaskedUsername(rng)
      } while (usedNames.has(name))
      usedNames.add(name)

      const bet = pickBetAmount(rng)
      const cashoutTarget = pickCashoutTarget(rng)
      const avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`

      newBots.push({
        id: `bot_${seed}_${i}`,
        user: name,
        rank: 0,
        bet,
        cashout: null,
        won: null,
        cashoutTarget: parseFloat(cashoutTarget.toFixed(2)),
        isUser: false,
        roundId,
        updatedAt: Date.now(),
        avatar,
      })
    }

    newBots.sort((a, b) => b.bet - a.bet)
    setBots(newBots)
    botsInitializedRef.current = true
  }, [])

  // Initialize bots on mount
  useEffect(() => {
    if (!botsInitializedRef.current) {
      generateBots()
    }
  }, [generateBots])

  // Handle all phase transitions and cashout processing in a single effect
  useEffect(() => {
    const prevPhase = prevPhaseRef.current

    if (phase === 'waiting' && prevPhase !== 'waiting') {
      generateBots()
    }

    if (phase === 'flying') {
      setBots(prev => {
        let changed = false
        const updated = prev.map(bot => {
          if (bot.cashout !== null) return bot
          if (multiplier >= bot.cashoutTarget) {
            changed = true
            return {
              ...bot,
              cashout: bot.cashoutTarget,
              won: parseFloat((bot.bet * bot.cashoutTarget).toFixed(2)),
              updatedAt: Date.now(),
            }
          }
          return bot
        })
        return changed ? updated : prev
      })
    }

    if (phase === 'crashed' && prevPhase !== 'crashed') {
      setBots(prev => {
        const hasUncashedOut = prev.some(b => b.cashout === null)
        if (!hasUncashedOut) return prev
        return prev.map(bot =>
          bot.cashout === null
            ? { ...bot, won: 0, updatedAt: Date.now() }
            : bot
        )
      })
    }

    prevPhaseRef.current = phase
  }, [phase, multiplier, generateBots])

  return bots
}
