import { useState, useEffect, useCallback, useRef } from 'react'
import { useBetting } from '@/contexts/BettingContext'
import { Phase } from '@/hooks/useGameState'
import { Link } from 'wouter'

interface HybridBotPanelProps {
  panelId: number
  gamePhase: Phase
  currentMultiplier: number
  roundHistory: number[]
  isLoggedIn: boolean
  isFreebet: boolean
  freebetLocked?: boolean
  maxBalance: number
  currency?: string
}

const LOW_CRASH_THRESHOLD = 1.85
const VERY_LOW_CRASH_THRESHOLD = 1.5
const HISTORY_WINDOW_SIZE = 15
const MIN_SAMPLE_SIZE_FOR_AVERAGE_GATE = 3
const MIN_LOW_CRASHES_FOR_SIGNAL = 5
const MIN_VERY_LOW_CRASHES_FOR_SIGNAL = 2
const FORCED_ENTRY_SKIP_LIMIT = 2
const WARMUP_MIN_SAMPLE_SIZE = 5
const WARMUP_SKIP_BEFORE_ENTRY = 1

type StrategyPreset = 'conservative' | 'moderate' | 'aggressive'

const STRATEGY_PRESETS: Record<StrategyPreset, {
  baseTarget: number
  recoveryFactor: number
  maxRecoverySteps: number
  averageMultiplierThreshold: number
  takeProfit: number
}> = {
  conservative: {
    baseTarget: 1.2,
    recoveryFactor: 1.5,
    maxRecoverySteps: 4,
    averageMultiplierThreshold: 1.6,
    takeProfit: 120
  },
  moderate: {
    baseTarget: 1.5,
    recoveryFactor: 1.85,
    maxRecoverySteps: 5,
    averageMultiplierThreshold: 2.0,
    takeProfit: 250
  },
  aggressive: {
    baseTarget: 2.0,
    recoveryFactor: 2.5,
    maxRecoverySteps: 6,
    averageMultiplierThreshold: 3.0,
    takeProfit: 400
  }
}
const DEFAULT_STRATEGY_PRESET: StrategyPreset = 'moderate'
const DEFAULT_AVERAGE_MULTIPLIER_THRESHOLD = STRATEGY_PRESETS[DEFAULT_STRATEGY_PRESET].averageMultiplierThreshold
const DEFAULT_TAKE_PROFIT = STRATEGY_PRESETS[DEFAULT_STRATEGY_PRESET].takeProfit

export default function HybridBotPanel({
  panelId,
  gamePhase,
  currentMultiplier,
  roundHistory,
  isLoggedIn,
  isFreebet,
  freebetLocked = false,
  maxBalance,
  currency = 'KSH'
}: HybridBotPanelProps) {
  const betting = useBetting()
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1: HIGH-SPEED STATE MANAGEMENT (useRef for speed-critical values)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Core bot state (useState for UI reactivity)
  const [isActive, setIsActive] = useState(false)
  const [baseBet, setBaseBet] = useState(10)
  const [currentBet, setCurrentBet] = useState(10)
  const [maxBetLimit, setMaxBetLimit] = useState(1000)
  const [dynamicTarget, setDynamicTarget] = useState(1.65)
  const [accumulatedLoss, setAccumulatedLoss] = useState(0)
  const [sessionProfit, setSessionProfit] = useState(0)
  const [consecutiveLosses, setConsecutiveLosses] = useState(0)
  const [winStreak, setWinStreak] = useState(0)
  const [roundsPlayed, setRoundsPlayed] = useState(0)
  const [skippedRounds, setSkippedRounds] = useState(0)
  const [emergencyStop, setEmergencyStop] = useState(false)
  const [emergencyReason, setEmergencyReason] = useState('')
  const lastProcessedHistoryIdRef = useRef<string | null>(null)
  
  // Advanced algorithm parameters (useRef for speed)
  const crashHistoryRef = useRef<number[]>([])
  const maxRecoveryStepsRef = useRef(5)
  const recoveryFactorRef = useRef(1.85)
  const targetBufferRef = useRef(1.12)
  const maxTargetRef = useRef(5.0)
  const baseTargetRef = useRef(1.65)
  const sessionStopLossRef = useRef(-500) // Stop if session profit drops below -500
  
  // Configurable parameters (UI)
  const [maxRecoverySteps, setMaxRecoverySteps] = useState(5)
  const [recoveryFactor, setRecoveryFactor] = useState(1.85)
  const [baseTarget, setBaseTarget] = useState(1.65)
  const [maxTarget, setMaxTarget] = useState(5.0)
  const [sessionStopLoss, setSessionStopLoss] = useState(-500)
  const [sessionTakeProfit, setSessionTakeProfit] = useState(DEFAULT_TAKE_PROFIT)
  const [averageMultiplierThreshold, setAverageMultiplierThreshold] = useState(DEFAULT_AVERAGE_MULTIPLIER_THRESHOLD)
  const [strategyPreset, setStrategyPreset] = useState<StrategyPreset>(DEFAULT_STRATEGY_PRESET)
  const takeProfitRef = useRef(DEFAULT_TAKE_PROFIT)
  const averageMultiplierThresholdRef = useRef(DEFAULT_AVERAGE_MULTIPLIER_THRESHOLD)
  
  // Sync refs with state
  useEffect(() => {
    maxRecoveryStepsRef.current = maxRecoverySteps
    recoveryFactorRef.current = recoveryFactor
    baseTargetRef.current = baseTarget
    maxTargetRef.current = maxTarget
    sessionStopLossRef.current = sessionStopLoss
    takeProfitRef.current = sessionTakeProfit
    averageMultiplierThresholdRef.current = averageMultiplierThreshold
  }, [maxRecoverySteps, recoveryFactor, baseTarget, maxTarget, sessionStopLoss, sessionTakeProfit, averageMultiplierThreshold])

  // Apply external-style preset defaults when idle
  useEffect(() => {
    if (isActive) return
    const preset = STRATEGY_PRESETS[strategyPreset]
    setBaseTarget(preset.baseTarget)
    setRecoveryFactor(preset.recoveryFactor)
    setMaxRecoverySteps(preset.maxRecoverySteps)
    setAverageMultiplierThreshold(preset.averageMultiplierThreshold)
    setSessionTakeProfit(preset.takeProfit)
  }, [strategyPreset, isActive])
  
  // Track if we've placed a bet this round
  const [betPlacedThisRound, setBetPlacedThisRound] = useState(false)
  const [lastPhase, setLastPhase] = useState<Phase>(gamePhase)
  const [roundSkipped, setRoundSkipped] = useState(false)
  
  const activeBet = betting.getActiveBet(panelId)
  const queuedBet = betting.getQueuedBet(panelId)

  // Reset bet placed flag when phase changes to waiting
  useEffect(() => {
    if (gamePhase === 'waiting' && lastPhase !== 'waiting') {
      setBetPlacedThisRound(false)
      setRoundSkipped(false)
    }
    setLastPhase(gamePhase)
  }, [gamePhase, lastPhase])

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2: SMART ENTRY - GAME_STARTING TRIGGER
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Helper: Count consecutive low crashes from recent history
  const getLowCrashStreak = useCallback(() => {
    const history = crashHistoryRef.current
    if (history.length === 0) return 0
    
    let streak = 0
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i] < LOW_CRASH_THRESHOLD) {
        streak++
      } else {
        break
      }
    }
    return streak
  }, [])

  // Helper: Check if last crash was very low
  const wasLastCrashVeryLow = useCallback(() => {
    const history = crashHistoryRef.current
    if (history.length === 0) return false
    return history[history.length - 1] < VERY_LOW_CRASH_THRESHOLD
  }, [])

  const getRecentWindowSignals = useCallback(() => {
    const recent = crashHistoryRef.current.slice(-HISTORY_WINDOW_SIZE)
    const lowCrashes = recent.filter(multiplier => multiplier < LOW_CRASH_THRESHOLD).length
    const veryLowCrashes = recent.filter(multiplier => multiplier < VERY_LOW_CRASH_THRESHOLD).length

    return {
      sampleSize: recent.length,
      lowCrashes,
      veryLowCrashes,
      hasSignal: lowCrashes >= MIN_LOW_CRASHES_FOR_SIGNAL || veryLowCrashes >= MIN_VERY_LOW_CRASHES_FOR_SIGNAL
    }
  }, [])

  const getRecentAverageMultiplier = useCallback(() => {
    const recent = crashHistoryRef.current.slice(-HISTORY_WINDOW_SIZE)
    if (recent.length === 0) return 0
    const sum = recent.reduce((acc, value) => acc + value, 0)
    return sum / recent.length
  }, [])

  // Continuously sync latest server round history so entry logic is never starved
  useEffect(() => {
    if (!Array.isArray(roundHistory) || roundHistory.length === 0) return
    crashHistoryRef.current = roundHistory.slice(-HISTORY_WINDOW_SIZE)
  }, [roundHistory])

  // Auto-place bet when round starts (with ENTRY HUNTING)
  useEffect(() => {
    if (!isActive || !isLoggedIn || emergencyStop) return
    if (gamePhase !== 'waiting') return
    if (betPlacedThisRound || roundSkipped) return
    if (activeBet || queuedBet) return
    
    // ═══ SAFETY GATES ═══
    
    // Gate 1: Max bet limit exceeded
    if (currentBet > maxBetLimit) {
      console.log(`Bot ${panelId}: EMERGENCY STOP - Max bet limit (${maxBetLimit}) exceeded`)
      setEmergencyStop(true)
      setEmergencyReason('Max bet limit exceeded')
      setIsActive(false)
      return
    }
    
    // Gate 2: Session stop-loss hit
    if (sessionProfit <= sessionStopLossRef.current) {
      console.log(`Bot ${panelId}: EMERGENCY STOP - Session stop-loss (${sessionStopLossRef.current}) hit`)
      setEmergencyStop(true)
      setEmergencyReason('Session stop-loss hit')
      setIsActive(false)
      return
    }

    // Gate 3: Session take-profit hit
    if (sessionProfit >= takeProfitRef.current) {
      console.log(`Bot ${panelId}: TARGET HIT - Session take-profit (${takeProfitRef.current}) reached`)
      setEmergencyStop(true)
      setEmergencyReason('Session take-profit reached')
      setIsActive(false)
      return
    }
    
    // Gate 4: Insufficient balance
    if (currentBet > maxBalance) {
      console.log(`Bot ${panelId}: EMERGENCY STOP - Insufficient balance`)
      setEmergencyStop(true)
      setEmergencyReason('Insufficient balance')
      setIsActive(false)
      return
    }
    
    // ═══ ENTRY HUNTING LOGIC ═══
    
    // If in RECOVERY MODE (have losses to recover), bypass hunting - force bet
    if (accumulatedLoss > 0) {
      console.log(`Bot ${panelId}: Recovery mode - placing bet ${currentBet} @ ${dynamicTarget.toFixed(2)}x`)
    } else {
      // BASE MODE: Apply entry hunting
      const lowCrashStreak = getLowCrashStreak()
      const lastWasVeryLow = wasLastCrashVeryLow()
      const recentSignals = getRecentWindowSignals()
      const recentAverage = getRecentAverageMultiplier()
      const hasBasicEntrySignal = lowCrashStreak >= 2 || lastWasVeryLow || recentSignals.hasSignal
      const averageGateOpen =
        recentSignals.sampleSize < MIN_SAMPLE_SIZE_FOR_AVERAGE_GATE ||
        recentAverage <= averageMultiplierThresholdRef.current
      const skipLimitReached = skippedRounds >= FORCED_ENTRY_SKIP_LIMIT
      const warmupBypass = recentSignals.sampleSize < WARMUP_MIN_SAMPLE_SIZE && skippedRounds >= WARMUP_SKIP_BEFORE_ENTRY
      const shouldEnterNow =
        (hasBasicEntrySignal && averageGateOpen) ||
        warmupBypass ||
        skipLimitReached
      
      // Only bet if conditions are favorable
      if (!shouldEnterNow) {
        // Skip this round - conditions not favorable
        console.log(
          `Bot ${panelId}: Skipping round (streak: ${lowCrashStreak}, avg: ${recentAverage.toFixed(2)}x, threshold: ${averageMultiplierThresholdRef.current.toFixed(2)}x, sample: ${recentSignals.sampleSize})`
        )
        setRoundSkipped(true)
        setSkippedRounds(prev => prev + 1)
        return
      }
      
      console.log(`Bot ${panelId}: Entry conditions met (streak: ${lowCrashStreak}, avg: ${recentAverage.toFixed(2)}x, lowCrashes: ${recentSignals.lowCrashes}, skipped: ${skippedRounds}) - placing bet`)
    }
    
    // Place bet
    const success = betting.placeBet(panelId, currentBet, isFreebet, maxBalance, freebetLocked)
    if (success) {
      console.log(`Bot ${panelId}: Placed bet ${currentBet} KSH at target ${dynamicTarget.toFixed(2)}x`)
      setBetPlacedThisRound(true)
      setRoundsPlayed(prev => prev + 1)
      setSkippedRounds(0)
    }
  }, [isActive, isLoggedIn, emergencyStop, gamePhase, currentBet, maxBalance, maxBetLimit, 
      panelId, betting, isFreebet, freebetLocked, activeBet, queuedBet, betPlacedThisRound, dynamicTarget,
      sessionProfit, accumulatedLoss, roundSkipped, skippedRounds, getLowCrashStreak, wasLastCrashVeryLow, getRecentWindowSignals, getRecentAverageMultiplier])

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2: MULTIPLIER_UPDATE - AUTO CASHOUT
  // ═══════════════════════════════════════════════════════════════════════════
  
  useEffect(() => {
    if (!isActive || !activeBet) return
    if (gamePhase !== 'flying') return
    
    if (currentMultiplier >= dynamicTarget) {
      betting.cashOut(panelId, currentMultiplier)
      console.log(`Bot ${panelId}: Cashed out at ${currentMultiplier.toFixed(2)}x (target: ${dynamicTarget.toFixed(2)}x)`)
    }
  }, [isActive, activeBet, gamePhase, currentMultiplier, dynamicTarget, panelId, betting])

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2: GAME_CRASHED - CALCULATION PHASE
  // ═══════════════════════════════════════════════════════════════════════════
  
  useEffect(() => {
    if (!isActive) return
    if (gamePhase !== 'crashed') return
    if (!betPlacedThisRound) return

    const latestHistory = betting.betHistory.find(entry => entry.panelId === panelId)
    if (!latestHistory) return
    if (latestHistory.id === lastProcessedHistoryIdRef.current) return

    lastProcessedHistoryIdRef.current = latestHistory.id

    // Get crash multiplier from the current game (use currentMultiplier as it holds the crash point)
    const crashMultiplier = currentMultiplier

    if (latestHistory.cashoutMultiplier !== null && latestHistory.won !== null) {
      // ═══ WON ═══
      const profit = latestHistory.won - latestHistory.amount
      console.log(`Bot ${panelId}: WON ${profit.toFixed(2)} KSH`)
      
      // Reset loss tracking
      setAccumulatedLoss(0)
      setConsecutiveLosses(0)
      
      // Increment win streak
      setWinStreak(prev => {
        const newStreak = prev + 1
        
        // ANTI-MARTINGALE BOOST: Increase bet slightly on winning streaks
        const boostMultiplier = Math.min(1 + (newStreak * 0.12), 1.6)
        const boostedBet = Math.round(baseBet * boostMultiplier)
        setCurrentBet(boostedBet)
        console.log(`Bot ${panelId}: Win streak ${newStreak} - Anti-martingale boost: ${boostedBet} KSH`)
        
        return newStreak
      })
      
      // Reset to base target
      setDynamicTarget(baseTargetRef.current)
      setSessionProfit(prev => prev + profit)
      
    } else {
      // ═══ LOST ═══
      const lossAmount = latestHistory.amount
      console.log(`Bot ${panelId}: LOST ${lossAmount.toFixed(2)} KSH at crash ${crashMultiplier.toFixed(2)}x`)
      
      // Update loss tracking
      const newAccumulatedLoss = accumulatedLoss + lossAmount
      const nextLossStreak = Math.min(consecutiveLosses + 1, maxRecoveryStepsRef.current)
      setAccumulatedLoss(newAccumulatedLoss)
      setConsecutiveLosses(nextLossStreak)
      setWinStreak(0)
      setSessionProfit(prev => prev - lossAmount)
      
      // SOFT PROGRESSION: grow bet until recovery cap, then keep it stable
      const shouldIncreaseBet = nextLossStreak < maxRecoveryStepsRef.current
      const newCurrentBet = Math.min(
        shouldIncreaseBet ? Math.round(currentBet * recoveryFactorRef.current) : currentBet,
        maxBetLimit
      )
      setCurrentBet(newCurrentBet)
      
      // IMPROVED TARGET MATH: Calculate target to recover loss + base profit + buffer
      // Formula: ((accumulatedLoss + baseBet) / newCurrentBet) * targetBuffer + 1
      const calcTarget = ((newAccumulatedLoss + baseBet) / newCurrentBet) * targetBufferRef.current + 1
      const newTarget = Math.min(
        maxTargetRef.current,
        Math.max(1.10, calcTarget)
      )
      setDynamicTarget(newTarget)
      
      console.log(`Bot ${panelId}: Soft progression - New bet: ${newCurrentBet} KSH, Target: ${newTarget.toFixed(2)}x`)
    }
  }, [gamePhase, isActive, betPlacedThisRound, panelId, betting.betHistory, currentBet, 
      accumulatedLoss, baseBet, currentMultiplier, maxBetLimit, consecutiveLosses])

  // ═══════════════════════════════════════════════════════════════════════════
  // BOT CONTROLS
  // ═══════════════════════════════════════════════════════════════════════════

  const handleReset = useCallback(() => {
    setCurrentBet(baseBet)
    setDynamicTarget(baseTargetRef.current)
    setAccumulatedLoss(0)
    setRoundsPlayed(0)
    setSessionProfit(0)
    setConsecutiveLosses(0)
    setWinStreak(0)
    setSkippedRounds(0)
    setBetPlacedThisRound(false)
    setRoundSkipped(false)
    setEmergencyStop(false)
    setEmergencyReason('')
    lastProcessedHistoryIdRef.current = betting.betHistory[0]?.id ?? null
    crashHistoryRef.current = []
  }, [baseBet, betting.betHistory])

  const handleToggleActive = useCallback(() => {
    if (isActive) {
      setIsActive(false)
      console.log(`Bot ${panelId}: Stopped`)
    } else {
      handleReset()
      setIsActive(true)
      console.log(`Bot ${panelId}: Started with base bet ${baseBet} KSH, base target ${baseTarget}x`)
    }
  }, [isActive, panelId, baseBet, baseTarget, handleReset])

  const handleDismissEmergency = useCallback(() => {
    setEmergencyStop(false)
    setEmergencyReason('')
  }, [])

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="bg-[#1a1d24] rounded-xl p-3 border border-white/5 flex flex-col gap-2 w-full max-w-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-[#00C74D] animate-pulse' : emergencyStop ? 'bg-[#00E65A]' : 'bg-gray-500'}`} />
          <h3 className="text-xs font-bold text-white">Smart Bot</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <Link
            to="/bot-help"
            className="w-6 h-6 rounded-full bg-[#0f1318] border border-[#00C74D]/35 text-[#00C74D] text-xs font-black flex items-center justify-center hover:bg-[#00C74D]/15 transition-colors"
            aria-label="How to use bot"
          >
            ?
          </Link>
          <button
            onClick={handleToggleActive}
            disabled={!isLoggedIn}
            className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
              isActive
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-[#00C74D] hover:brightness-110 text-[#0b0e11]'
            }`}
          >
            {isActive ? 'STOP' : 'START'}
          </button>
        </div>
      </div>

      {/* Emergency Alert */}
      {emergencyStop && (
        <div className="bg-[#00C74D]/15 border border-[#00C74D]/35 rounded-lg p-2 flex items-center justify-between">
          <p className="text-[10px] text-[#00E65A] font-bold">
            ⚠️ {emergencyReason}
          </p>
          <button
            onClick={handleDismissEmergency}
            className="text-[10px] text-[#00E65A] hover:text-[#7BFFAE] font-bold"
          >
            DISMISS
          </button>
        </div>
      )}

      {/* Simplified Settings */}
      <div className="grid grid-cols-2 gap-1.5">
        <div className="flex flex-col gap-0.5">
          <label className="text-[8px] text-gray-200 font-semibold uppercase">Strategy</label>
          <select
            value={strategyPreset}
            onChange={(e) => setStrategyPreset(e.target.value as StrategyPreset)}
            disabled={isActive || !isLoggedIn}
            className="bg-[#0f1318] rounded px-2 py-1 text-[10px] font-mono font-bold text-white focus:outline-none focus:ring-1 focus:ring-[#00C74D] disabled:opacity-50"
          >
            <option value="conservative">Conservative</option>
            <option value="moderate">Moderate</option>
            <option value="aggressive">Aggressive</option>
          </select>
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[8px] text-gray-200 font-semibold uppercase">Base Bet</label>
          <input
            type="number"
            value={baseBet}
            onChange={(e) => {
              const nextBase = Math.max(10, parseInt(e.target.value) || 10)
              setBaseBet(nextBase)
              setMaxBetLimit(Math.max(nextBase, maxBetLimit))
            }}
            disabled={isActive || !isLoggedIn}
            className="bg-[#0f1318] rounded px-2 py-1 text-[10px] font-mono font-bold text-white focus:outline-none focus:ring-1 focus:ring-[#00C74D] disabled:opacity-50 w-full"
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[8px] text-gray-200 font-semibold uppercase">Stop Loss</label>
          <input
            type="number"
            value={sessionStopLoss}
            onChange={(e) => setSessionStopLoss(parseInt(e.target.value) || -500)}
            disabled={isActive || !isLoggedIn}
            className="bg-[#0f1318] rounded px-2 py-1 text-[10px] font-mono font-bold text-white focus:outline-none focus:ring-1 focus:ring-[#00C74D] disabled:opacity-50 w-full"
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[8px] text-gray-200 font-semibold uppercase">Take Profit</label>
          <input
            type="number"
            value={sessionTakeProfit}
            onChange={(e) => setSessionTakeProfit(Math.max(0, parseInt(e.target.value) || DEFAULT_TAKE_PROFIT))}
            disabled={isActive || !isLoggedIn}
            className="bg-[#0f1318] rounded px-2 py-1 text-[10px] font-mono font-bold text-white focus:outline-none focus:ring-1 focus:ring-[#00C74D] disabled:opacity-50 w-full"
          />
        </div>
      </div>

      {/* Live Stats - Primary Row */}
      <div className="grid grid-cols-4 gap-1 bg-[#0f1318] rounded-lg p-2">
        <div className="flex flex-col items-center">
          <span className="text-[8px] text-gray-200 font-semibold uppercase">Bet</span>
          <span className="text-[10px] font-mono font-bold text-white">{currentBet}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[8px] text-gray-200 font-semibold uppercase">Target</span>
          <span className="text-[10px] font-mono font-bold text-yellow-500">{dynamicTarget.toFixed(2)}x</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[8px] text-gray-200 font-semibold uppercase">Losses</span>
          <span className={`text-[10px] font-mono font-bold ${consecutiveLosses > 2 ? 'text-red-500' : consecutiveLosses > 0 ? 'text-orange-500' : 'text-gray-500'}`}>
            {consecutiveLosses}/{maxRecoverySteps}
          </span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[8px] text-gray-200 font-semibold uppercase">Wins</span>
          <span className={`text-[10px] font-mono font-bold ${winStreak > 0 ? 'text-[#00C74D]' : 'text-gray-500'}`}>
            {winStreak}🔥
          </span>
        </div>
      </div>

      {/* Stats Row 2 */}
      <div className="grid grid-cols-4 gap-1 text-center">
        <div>
          <div className="text-[8px] text-gray-200 font-semibold uppercase">Rounds</div>
          <div className="text-[10px] font-mono font-bold text-white">{roundsPlayed}</div>
        </div>
        <div>
          <div className="text-[8px] text-gray-200 font-semibold uppercase">Skipped</div>
          <div className="text-[10px] font-mono font-bold text-blue-400">{skippedRounds}</div>
        </div>
        <div>
          <div className="text-[8px] text-gray-200 font-semibold uppercase">Profit</div>
          <div className={`text-[10px] font-mono font-bold ${sessionProfit >= 0 ? 'text-[#00C74D]' : 'text-red-500'}`}>
            {sessionProfit >= 0 ? '+' : ''}{sessionProfit.toFixed(0)}
          </div>
        </div>
        <div>
          <div className="text-[8px] text-gray-200 font-semibold uppercase">At Risk</div>
          <div className="text-[10px] font-mono font-bold text-orange-500">{accumulatedLoss.toFixed(0)}</div>
        </div>
      </div>

      {/* Mode Indicator */}
      {isActive && (
        <div className={`text-center py-1 rounded text-[9px] font-bold ${
          accumulatedLoss > 0 
            ? 'bg-orange-500/20 text-orange-400' 
            : 'bg-[#00C74D]/20 text-[#00C74D]'
        }`}>
          {accumulatedLoss > 0 ? '🔄 RECOVERY MODE' : '🎯 HUNTING MODE'}
        </div>
      )}

      {!isLoggedIn && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-1.5">
          <p className="text-[9px] text-yellow-400 font-medium text-center">
            Please login to use the bot
          </p>
        </div>
      )}
    </div>
  )
}
