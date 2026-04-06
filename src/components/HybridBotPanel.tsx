import { useState, useEffect, useCallback } from 'react'
import { useBetting } from '@/contexts/BettingContext'
import { Phase } from '@/hooks/useGameState'

interface HybridBotPanelProps {
  panelId: number
  gamePhase: Phase
  currentMultiplier: number
  isLoggedIn: boolean
  isFreebet: boolean
  maxBalance: number
  currency?: string
}

export default function HybridBotPanel({
  panelId,
  gamePhase,
  currentMultiplier,
  isLoggedIn,
  isFreebet,
  maxBalance,
  currency = 'KSH'
}: HybridBotPanelProps) {
  const betting = useBetting()
  
  // Bot state
  const [isActive, setIsActive] = useState(false)
  const [baseBet, setBaseBet] = useState(10)
  const [currentBet, setCurrentBet] = useState(10)
  const [maxBetLimit, setMaxBetLimit] = useState(1000)
  const [dynamicTarget, setDynamicTarget] = useState(2.0)
  const [accumulatedLoss, setAccumulatedLoss] = useState(0)
  const [roundsPlayed, setRoundsPlayed] = useState(0)
  const [totalProfit, setTotalProfit] = useState(0)
  const [consecutiveLosses, setConsecutiveLosses] = useState(0)
  
  // Track if we've placed a bet this round
  const [betPlacedThisRound, setBetPlacedThisRound] = useState(false)
  const [lastPhase, setLastPhase] = useState<Phase>(gamePhase)
  
  const activeBet = betting.getActiveBet(panelId)
  const queuedBet = betting.getQueuedBet(panelId)

  // Reset bet placed flag when phase changes to waiting
  useEffect(() => {
    if (gamePhase === 'waiting' && lastPhase !== 'waiting') {
      setBetPlacedThisRound(false)
    }
    setLastPhase(gamePhase)
  }, [gamePhase, lastPhase])

  // Auto-place bet when round starts
  useEffect(() => {
    if (!isActive || !isLoggedIn) return
    if (gamePhase !== 'waiting') return
    if (betPlacedThisRound) return
    if (activeBet || queuedBet) return
    
    // Check if we can afford the bet
    if (currentBet > maxBalance) {
      console.log(`Bot ${panelId}: Cannot place bet - insufficient balance`)
      setIsActive(false)
      return
    }
    
    // Check max bet limit
    if (currentBet > maxBetLimit) {
      console.log(`Bot ${panelId}: Max bet limit reached - stopping bot`)
      setIsActive(false)
      return
    }
    
    // Place bet
    const success = betting.placeBet(panelId, currentBet, isFreebet)
    if (success) {
      console.log(`Bot ${panelId}: Placed bet ${currentBet} KSH at target ${dynamicTarget.toFixed(2)}x`)
      setBetPlacedThisRound(true)
      setRoundsPlayed(prev => prev + 1)
    }
  }, [isActive, isLoggedIn, gamePhase, currentBet, maxBalance, maxBetLimit, panelId, betting, isFreebet, activeBet, queuedBet, betPlacedThisRound, dynamicTarget])

  // Auto-cashout when target is reached
  useEffect(() => {
    if (!isActive || !activeBet) return
    if (gamePhase !== 'flying') return
    
    if (currentMultiplier >= dynamicTarget) {
      betting.cashOut(panelId, currentMultiplier)
      console.log(`Bot ${panelId}: Cashed out at ${currentMultiplier.toFixed(2)}x`)
    }
  }, [isActive, activeBet, gamePhase, currentMultiplier, dynamicTarget, panelId, betting])

  // Handle round end - adjust bet size based on win/loss
  useEffect(() => {
    if (!isActive) return
    if (gamePhase !== 'crashed') return
    if (!betPlacedThisRound) return
    
    // Check if we won or lost
    const bet = betting.bets.find(b => b.panelId === panelId && b.status === 'CASHED_OUT')
    
    if (bet) {
      // WON - reset to base bet
      const profit = bet.winAmount! - bet.amount
      console.log(`Bot ${panelId}: WON ${profit.toFixed(2)} KSH - Resetting to base bet`)
      
      setCurrentBet(baseBet)
      setDynamicTarget(2.0)
      setAccumulatedLoss(0)
      setConsecutiveLosses(0)
      setTotalProfit(prev => prev + profit)
    } else {
      // LOST - apply martingale
      const lossAmount = currentBet
      const newAccumulatedLoss = accumulatedLoss + lossAmount
      const newCurrentBet = currentBet * 2
      
      console.log(`Bot ${panelId}: LOST ${lossAmount.toFixed(2)} KSH - Doubling bet to ${newCurrentBet.toFixed(2)} KSH`)
      
      setConsecutiveLosses(prev => prev + 1)
      setAccumulatedLoss(newAccumulatedLoss)
      setCurrentBet(newCurrentBet)
      setTotalProfit(prev => prev - lossAmount)
      
      // Calculate target multiplier to recover all losses + base bet profit
      const targetMultiplier = (newAccumulatedLoss + baseBet) / newCurrentBet
      setDynamicTarget(Math.max(1.1, targetMultiplier))
      
      console.log(`Bot ${panelId}: New target ${targetMultiplier.toFixed(2)}x to recover ${newAccumulatedLoss.toFixed(2)} KSH + profit`)
    }
  }, [gamePhase, isActive, betPlacedThisRound, panelId, betting.bets, currentBet, accumulatedLoss, baseBet])

  // Reset bot
  const handleReset = useCallback(() => {
    setCurrentBet(baseBet)
    setDynamicTarget(2.0)
    setAccumulatedLoss(0)
    setRoundsPlayed(0)
    setTotalProfit(0)
    setConsecutiveLosses(0)
    setBetPlacedThisRound(false)
  }, [baseBet])

  // Toggle bot active state
  const handleToggleActive = useCallback(() => {
    if (isActive) {
      setIsActive(false)
      console.log(`Bot ${panelId}: Stopped`)
    } else {
      handleReset()
      setIsActive(true)
      console.log(`Bot ${panelId}: Started with base bet ${baseBet} KSH`)
    }
  }, [isActive, panelId, baseBet, handleReset])

  return (
    <div className="bg-[#1a1d24] rounded-xl p-4 border border-white/5 flex flex-col gap-3 w-full max-w-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
          <h3 className="text-sm font-bold text-white">Hybrid Martingale Bot</h3>
        </div>
        <button
          onClick={handleToggleActive}
          disabled={!isLoggedIn}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
            isActive 
              ? 'bg-red-600 hover:bg-red-700 text-white' 
              : 'bg-[#00C74D] hover:brightness-110 text-[#0b0e11]'
          }`}
        >
          {isActive ? 'STOP' : 'START'}
        </button>
      </div>

      {/* Settings */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-gray-400 font-medium uppercase">Base Bet</label>
          <input
            type="number"
            value={baseBet}
            onChange={(e) => setBaseBet(Math.max(10, parseInt(e.target.value) || 10))}
            disabled={isActive || !isLoggedIn}
            className="bg-[#0f1318] rounded-lg px-3 py-2 text-sm font-mono font-bold text-white focus:outline-none focus:ring-2 focus:ring-[#00C74D] disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-gray-400 font-medium uppercase">Max Bet Limit</label>
          <input
            type="number"
            value={maxBetLimit}
            onChange={(e) => setMaxBetLimit(Math.max(baseBet, parseInt(e.target.value) || 1000))}
            disabled={isActive || !isLoggedIn}
            className="bg-[#0f1318] rounded-lg px-3 py-2 text-sm font-mono font-bold text-white focus:outline-none focus:ring-2 focus:ring-[#00C74D] disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 bg-[#0f1318] rounded-lg p-3">
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-gray-400 font-medium uppercase mb-1">Current Bet</span>
          <span className="text-sm font-mono font-bold text-white">{currentBet.toFixed(0)} {currency}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-gray-400 font-medium uppercase mb-1">Target</span>
          <span className="text-sm font-mono font-bold text-yellow-500">{dynamicTarget.toFixed(2)}x</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-gray-400 font-medium uppercase mb-1">Loss Streak</span>
          <span className={`text-sm font-mono font-bold ${consecutiveLosses > 0 ? 'text-red-500' : 'text-gray-500'}`}>
            {consecutiveLosses}
          </span>
        </div>
      </div>

      {/* Additional Stats */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-[10px] text-gray-400 font-medium uppercase">Rounds</div>
          <div className="text-sm font-mono font-bold text-white">{roundsPlayed}</div>
        </div>
        <div>
          <div className="text-[10px] text-gray-400 font-medium uppercase">Profit</div>
          <div className={`text-sm font-mono font-bold ${totalProfit >= 0 ? 'text-[#00C74D]' : 'text-red-500'}`}>
            {totalProfit >= 0 ? '+' : ''}{totalProfit.toFixed(2)}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-gray-400 font-medium uppercase">At Risk</div>
          <div className="text-sm font-mono font-bold text-orange-500">{accumulatedLoss.toFixed(2)}</div>
        </div>
      </div>

      {/* Warning */}
      {isActive && currentBet > baseBet * 4 && (
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-2">
          <p className="text-[10px] text-orange-400 font-medium text-center">
            ⚠️ High risk: {consecutiveLosses} consecutive losses
          </p>
        </div>
      )}

      {!isLoggedIn && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-2">
          <p className="text-[10px] text-yellow-400 font-medium text-center">
            Please login to use the bot
          </p>
        </div>
      )}
    </div>
  )
}
