import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react'
import { Phase } from '@/hooks/useGameState'
import { getSocket, getStoredAuthToken } from '@/lib/socketClient'

// ───────────────────────────────────────────────────────────────────────────
// CENTRALIZED BETTING STATE MANAGEMENT WITH SERVER-SYNCHRONIZED LEDGER
// ───────────────────────────────────────────────────────────────────────────

export interface PlayerBet {
  betId?: string
  panelId: number
  amount: number
  status: 'ACTIVE' | 'QUEUED' | 'CASHED_OUT'
  isFreebet: boolean
  cashoutMultiplier?: number
  wonAmount?: number
  autoCashoutTarget?: number
}

export interface BetHistory {
  id: string
  panelId: number
  roundId: number
  amount: number
  cashoutMultiplier: number | null
  won: number | null
  isFreebet: boolean
  timestamp: number
}

interface BettingContextValue {
  // Current bets
  bets: PlayerBet[]
  betHistory: BetHistory[]
  
  // Actions - with balance validation and socket synchronization
  placeBet: (panelId: number, amount: number, isFreebet: boolean, currentBalance?: number, freebetLocked?: boolean, autoCashoutTarget?: number) => boolean
  queueBet: (panelId: number, amount: number, isFreebet: boolean, currentBalance?: number, freebetLocked?: boolean, autoCashoutTarget?: number) => boolean
  cancelQueuedBet: (panelId: number) => boolean
  cashOut: (panelId: number, multiplier: number) => { success: boolean; wonAmount?: number }
  
  // Query helpers
  getActiveBet: (panelId: number) => PlayerBet | null
  getQueuedBet: (panelId: number) => PlayerBet | null
  hasBet: (panelId: number) => boolean
  
  // Callbacks for balance updates
  onBalanceChange?: (delta: number, isFreebet: boolean) => void
  onCashoutSuccess?: (wonAmount: number, multiplier: number) => void
}

const BettingContext = createContext<BettingContextValue | null>(null)
const BET_HISTORY_STORAGE_KEY = 'aspirebet_bet_history'

export function useBetting() {
  const ctx = useContext(BettingContext)
  if (!ctx) throw new Error('useBetting must be used within BettingProvider')
  return ctx
}

interface BettingProviderProps {
  children: ReactNode
  gamePhase: Phase
  currentMultiplier: number
  onBalanceChange?: (delta: number, isFreebet: boolean) => void
  onCashoutSuccess?: (wonAmount: number, multiplier: number) => void
}

export function BettingProvider({ 
  children, 
  gamePhase, 
  currentMultiplier,
  onBalanceChange,
  onCashoutSuccess 
}: BettingProviderProps) {
  const [bets, setBets] = useState<PlayerBet[]>([])
  const [betHistory, setBetHistory] = useState<BetHistory[]>(() => {
    try {
      const raw = localStorage.getItem(BET_HISTORY_STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })
  const roundIdRef = useRef(0)
  const prevPhaseRef = useRef<Phase>(gamePhase)
  const betsRef = useRef(bets)
  betsRef.current = bets

  useEffect(() => {
    localStorage.setItem(BET_HISTORY_STORAGE_KEY, JSON.stringify(betHistory.slice(0, 50)))
  }, [betHistory])

  // ─────────────────────────────────────────────────────────────────────────
  // SOCKET LISTENERS: SERVER BET CONFIRMATION & CASHOUT NOTIFICATIONS
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const socket = getSocket()

    const onBetPlaced = (data: {
      success: boolean
      betId: string
      panelId: number
      amount: number
      isFreebet: boolean
      roundId?: string
      autoCashoutTarget?: number | null
      newBalance?: number
      newFreebet?: number
    }) => {
      setBets(prev =>
        prev.map(b => (b.panelId === data.panelId && b.status === 'ACTIVE' ? { ...b, betId: data.betId } : b))
      )
    }

    const onBetError = (data: { error: string; panelId?: number }) => {
      console.warn('[BettingContext] Server bet error:', data.error)
      // Rollback unconfirmed active bets and refund optimistic deductions
      setBets(prev => {
        const failed = data.panelId
          ? prev.filter(b => b.panelId === data.panelId && !b.betId)
          : prev.filter(b => !b.betId && b.status === 'ACTIVE')
        failed.forEach(b => {
          onBalanceChange?.(b.amount, b.isFreebet)
        })
        return prev.filter(b => !failed.includes(b))
      })
    }

    const onCashoutSuccessEvent = (data: {
      success: boolean
      betId: string
      panelId: number
      multiplier: number
      winAmount: number
      creditAmount?: number
      isFreebet?: boolean
      newBalance?: number
    }) => {
      setBets(prev =>
        prev.map(b => {
          if (b.panelId === data.panelId && (b.status === 'ACTIVE' || b.betId === data.betId)) {
            return {
              ...b,
              status: 'CASHED_OUT' as const,
              betId: data.betId,
              cashoutMultiplier: data.multiplier,
              wonAmount: data.winAmount
            }
          }
          return b
        })
      )

      const activeBet = betsRef.current.find(b => b.panelId === data.panelId || b.betId === data.betId)
      const betAmount = activeBet?.amount || 0
      const isFreebet = activeBet?.isFreebet || Boolean(data.isFreebet)

      const historyEntry: BetHistory = {
        id: data.betId || `bet_${Date.now()}_${data.panelId}`,
        panelId: data.panelId,
        roundId: roundIdRef.current,
        amount: betAmount,
        cashoutMultiplier: data.multiplier,
        won: data.winAmount,
        isFreebet,
        timestamp: Date.now()
      }
      setBetHistory(prev => [historyEntry, ...prev.filter(h => h.id !== historyEntry.id)].slice(0, 50))
      onCashoutSuccess?.(data.winAmount, data.multiplier)
    }

    const onGameSnapshot = (snapshot: any) => {
      if (snapshot?.roundId) {
        const match = snapshot.roundId.match(/^round-(\d+)$/)
        if (match) {
          roundIdRef.current = parseInt(match[1], 10)
        }
      }
    }

    socket.on('BET_PLACED', onBetPlaced)
    socket.on('BET_ERROR', onBetError)
    socket.on('CASHOUT_SUCCESS', onCashoutSuccessEvent)
    socket.on('GAME_SNAPSHOT', onGameSnapshot)

    return () => {
      socket.off('BET_PLACED', onBetPlaced)
      socket.off('BET_ERROR', onBetError)
      socket.off('CASHOUT_SUCCESS', onCashoutSuccessEvent)
      socket.off('GAME_SNAPSHOT', onGameSnapshot)
    }
  }, [onCashoutSuccess])

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 2: STRICT ACTION HANDLERS WITH SOCKET EMISSION
  // ─────────────────────────────────────────────────────────────────────────

  const placeBet = useCallback((
    panelId: number,
    amount: number,
    isFreebet: boolean,
    currentBalance?: number,
    freebetLocked?: boolean,
    autoCashoutTarget?: number
  ): boolean => {
    // Can only place active bets during WAITING phase
    if (gamePhase !== 'waiting') return false
    
    // Check if panel already has a bet
    if (bets.some(b => b.panelId === panelId)) return false
    
    // FREEBET LOCK VALIDATION
    if (isFreebet && freebetLocked) {
      console.warn('Freebet locked: Deposit at least 50 to unlock')
      return false
    }
    
    // BALANCE VALIDATION - prevent negative balances
    if (currentBalance !== undefined && amount > currentBalance) {
      console.warn('Insufficient funds: bet amount exceeds balance')
      return false
    }
    
    // Deduct balance via callback optimistically
    onBalanceChange?.(-amount, isFreebet)
    
    // Create active bet locally
    setBets(prev => [...prev, {
      panelId,
      amount,
      status: 'ACTIVE',
      isFreebet,
      autoCashoutTarget
    }])

    // Transmit to authoritative server
    const socket = getSocket()
    const token = getStoredAuthToken()
    socket.emit('PLACE_BET', {
      amount,
      isFreebet,
      panelId,
      autoCashoutTarget,
      token
    })
    
    return true
  }, [gamePhase, bets, onBalanceChange])

  const queueBet = useCallback((
    panelId: number,
    amount: number,
    isFreebet: boolean,
    currentBalance?: number,
    freebetLocked?: boolean,
    autoCashoutTarget?: number
  ): boolean => {
    // Can only queue bets during FLYING or CRASHED phase
    if (gamePhase !== 'flying' && gamePhase !== 'crashed' && gamePhase !== 'crashing') return false
    
    // Check if panel already has a queued bet
    if (bets.some(b => b.panelId === panelId && b.status === 'QUEUED')) return false
    
    // FREEBET LOCK VALIDATION
    if (isFreebet && freebetLocked) {
      console.warn('Freebet locked: Deposit at least 50 to unlock')
      return false
    }

    // BALANCE VALIDATION
    if (currentBalance !== undefined && amount > currentBalance) {
      console.warn('Insufficient funds: bet amount exceeds balance')
      return false
    }
    
    // Deduct balance immediately
    onBalanceChange?.(-amount, isFreebet)
    
    // Create queued bet
    setBets(prev => [...prev, {
      panelId,
      amount,
      status: 'QUEUED',
      isFreebet,
      autoCashoutTarget
    }])
    
    return true
  }, [gamePhase, bets, onBalanceChange])

  const cancelQueuedBet = useCallback((panelId: number): boolean => {
    const queuedBet = bets.find(b => b.panelId === panelId && b.status === 'QUEUED')
    if (!queuedBet) return false
    
    // Refund balance
    onBalanceChange?.(queuedBet.amount, queuedBet.isFreebet)
    
    // Remove queued bet
    setBets(prev => prev.filter(b => !(b.panelId === panelId && b.status === 'QUEUED')))
    
    return true
  }, [bets, onBalanceChange])

  const cashOut = useCallback((panelId: number, multiplier: number): { success: boolean; wonAmount?: number } => {
    // Can only cash out during FLYING phase
    if (gamePhase !== 'flying') return { success: false }
    
    const activeBet = bets.find(b => b.panelId === panelId && b.status === 'ACTIVE')
    if (!activeBet) return { success: false }
    
    const wonAmount = Math.round(activeBet.amount * multiplier * 100) / 100
    const cashoutMultiplier = Math.round(multiplier * 100) / 100

    // Send authoritative CASH_OUT event to server
    const socket = getSocket()
    const token = getStoredAuthToken()
    socket.emit('CASH_OUT', {
      betId: activeBet.betId,
      panelId,
      multiplier: cashoutMultiplier,
      token
    })
    
    // For freebet: only profit goes to real balance
    if (activeBet.isFreebet) {
      const profit = wonAmount - activeBet.amount
      if (profit > 0) {
        onBalanceChange?.(profit, false) // Profit goes to main balance
      }
    } else {
      onBalanceChange?.(wonAmount, false)
    }
    
    // Update bet status locally
    setBets(prev => prev.map(b => 
      b.panelId === panelId && b.status === 'ACTIVE'
        ? { ...b, status: 'CASHED_OUT' as const, cashoutMultiplier, wonAmount }
        : b
    ))
    
    // Add to history
    const historyEntry: BetHistory = {
      id: activeBet.betId || `bet_${Date.now()}_${panelId}`,
      panelId,
      roundId: roundIdRef.current,
      amount: activeBet.amount,
      cashoutMultiplier,
      won: wonAmount,
      isFreebet: activeBet.isFreebet,
      timestamp: Date.now(),
    }
    setBetHistory(prev => [historyEntry, ...prev.filter(h => h.id !== historyEntry.id)].slice(0, 50))
    
    // Notify success
    onCashoutSuccess?.(wonAmount, cashoutMultiplier)
    
    return { success: true, wonAmount }
  }, [gamePhase, bets, onBalanceChange, onCashoutSuccess])

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 3: ROUND HANDOFF LOGIC (CRITICAL STATE TRANSITIONS)
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const prevPhase = prevPhaseRef.current
    prevPhaseRef.current = gamePhase

    // CRASHED → Record lost bets and clear active bets
    if ((gamePhase === 'crashed' || gamePhase === 'crashing') && (prevPhase === 'flying' || prevPhase === 'waiting')) {
      // Record any uncashed active bets as losses
      bets.forEach(bet => {
        if (bet.status === 'ACTIVE') {
          const historyEntry: BetHistory = {
            id: bet.betId || `bet_${Date.now()}_${bet.panelId}`,
            panelId: bet.panelId,
            roundId: roundIdRef.current,
            amount: bet.amount,
            cashoutMultiplier: null,
            won: null,
            isFreebet: bet.isFreebet,
            timestamp: Date.now(),
          }
          setBetHistory(prev => [historyEntry, ...prev.filter(h => h.id !== historyEntry.id)].slice(0, 50))
        }
      })
      
      // Clear all active and cashed out bets (keep queued)
      setBets(prev => prev.filter(b => b.status === 'QUEUED'))
    }
    
    // WAITING → Activate queued bets & increment round
    if (gamePhase === 'waiting' && prevPhase !== 'waiting') {
      roundIdRef.current++
      
      const queued = bets.filter(b => b.status === 'QUEUED')
      if (queued.length > 0) {
        const socket = getSocket()
        const token = getStoredAuthToken()
        queued.forEach(qb => {
          socket.emit('PLACE_BET', {
            amount: qb.amount,
            isFreebet: qb.isFreebet,
            panelId: qb.panelId,
            autoCashoutTarget: qb.autoCashoutTarget,
            token
          })
        })
      }

      // Convert all QUEUED bets to ACTIVE
      setBets(prev => prev.map(b => 
        b.status === 'QUEUED'
          ? { ...b, status: 'ACTIVE' as const }
          : b
      ))
    }
  }, [gamePhase, bets])

  // ─────────────────────────────────────────────────────────────────────────
  // QUERY HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  const getActiveBet = useCallback((panelId: number): PlayerBet | null => {
    return bets.find(b => b.panelId === panelId && b.status === 'ACTIVE') ?? null
  }, [bets])

  const getQueuedBet = useCallback((panelId: number): PlayerBet | null => {
    return bets.find(b => b.panelId === panelId && b.status === 'QUEUED') ?? null
  }, [bets])

  const hasBet = useCallback((panelId: number): boolean => {
    return bets.some(b => b.panelId === panelId)
  }, [bets])

  const value: BettingContextValue = {
    bets,
    betHistory,
    placeBet,
    queueBet,
    cancelQueuedBet,
    cashOut,
    getActiveBet,
    getQueuedBet,
    hasBet,
    onBalanceChange,
    onCashoutSuccess,
  }

  return <BettingContext.Provider value={value}>{children}</BettingContext.Provider>
}
