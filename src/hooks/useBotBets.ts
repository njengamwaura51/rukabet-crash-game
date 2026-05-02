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
}

// Kenyan-flavored names mixed with generic gamertags
const BOT_FIRST_NAMES = [
  'Brian', 'Kevin', 'Dennis', 'Peter', 'James', 'John', 'Eric', 'Martin',
  'David', 'Chris', 'Paul', 'Felix', 'Moses', 'Alex', 'Mike', 'Dan',
  'Grace', 'Faith', 'Joy', 'Mercy', 'Ann', 'Lucy', 'Mary', 'Rose',
  'Victor', 'Oscar', 'Tony', 'Mark', 'Steve', 'Ken', 'Sam', 'Ray',
  'Otieno', 'Kamau', 'Njoroge', 'Wanjiku', 'Akinyi', 'Kipchoge', 'Mwangi', 'Odhiambo',
]

const BOT_SUFFIXES = [
  '_254', '_ke', '001', '99', '_pro', 'X', '_vip', '23', '_bet', '77',
  '_fn', '100', '_ace', '45', '_gg', '21', '', '_kr', '88', '_og',
]

function seededRandom(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x80000000
  }
}

function generateBotName(rng: () => number): string {
  const first = BOT_FIRST_NAMES[Math.floor(rng() * BOT_FIRST_NAMES.length)]
  const suffix = BOT_SUFFIXES[Math.floor(rng() * BOT_SUFFIXES.length)]
  return `${first}${suffix}`
}

// Common Kenyan bet amounts in KSH
const BET_AMOUNTS = [10, 15, 20, 25, 30, 50, 75, 100, 150, 200, 250, 300, 500, 1000]

function pickBetAmount(rng: () => number): number {
  // Weight toward smaller bets (more realistic)
  const r = rng()
  if (r < 0.35) return BET_AMOUNTS[Math.floor(rng() * 4)]        // 10-25
  if (r < 0.65) return BET_AMOUNTS[4 + Math.floor(rng() * 3)]    // 30-75
  if (r < 0.85) return BET_AMOUNTS[7 + Math.floor(rng() * 3)]    // 100-250
  return BET_AMOUNTS[10 + Math.floor(rng() * 4)]                  // 300-1000
}

function pickCashoutTarget(rng: () => number): number {
  const r = rng()
  if (r < 0.15) return 1.1 + rng() * 0.2                         // 1.10-1.30 (early cashout)
  if (r < 0.40) return 1.3 + rng() * 0.5                         // 1.30-1.80
  if (r < 0.65) return 1.8 + rng() * 1.2                         // 1.80-3.00
  if (r < 0.85) return 3.0 + rng() * 4.0                         // 3.00-7.00
  return 7.0 + rng() * 13.0                                      // 7.00-20.00 (diamond hands)
}

const MIN_BOTS = 5
const MAX_BOTS = 12

export function useBotBets(phase: Phase, multiplier: number): BotBet[] {
  const [bots, setBots] = useState<BotBet[]>([])
  const roundIdRef = useRef<string>(`bot_${Date.now()}`)
  const prevPhaseRef = useRef<Phase>(phase)
  const botsInitializedRef = useRef(false)

  // Generate fresh bots when entering the waiting phase
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
        name = generateBotName(rng)
      } while (usedNames.has(name))
      usedNames.add(name)

      const bet = pickBetAmount(rng)
      const cashoutTarget = pickCashoutTarget(rng)

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
      })
    }

    // Sort by bet amount descending
    newBots.sort((a, b) => b.bet - a.bet)
    setBots(newBots)
    botsInitializedRef.current = true
  }, [])

  // Initialize bots on mount (for the first waiting phase)
  useEffect(() => {
    if (!botsInitializedRef.current) {
      generateBots()
    }
  }, [generateBots])

  // Handle all phase transitions and cashout processing in a single effect
  useEffect(() => {
    const prevPhase = prevPhaseRef.current

    // Generate new bots when transitioning to waiting
    if (phase === 'waiting' && prevPhase !== 'waiting') {
      generateBots()
    }

    // Process cashouts during flying phase
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

    // Mark remaining bots as lost on crash
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

    // Update prevPhaseRef last so all checks above see the previous phase
    prevPhaseRef.current = phase
  }, [phase, multiplier, generateBots])

  return bots
}
