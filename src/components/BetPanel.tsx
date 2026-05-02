import { useState, useEffect } from 'react'
import { useBetting } from '@/contexts/BettingContext'
import { Phase } from '@/hooks/useGameState'

interface BetPanelProps {
  panelId: number
  defaultAmount?: number
  currency?: string
  gamePhase: Phase
  currentMultiplier: number
  isLoggedIn?: boolean
  isFreebet: boolean
  maxBalance: number
  freebetLocked?: boolean
  autoBetEnabled?: boolean
  onAutoBetToggle?: (enabled: boolean) => void
}

const QUICK_AMOUNTS = [10, 100, 1000, 10000] as const
const STEP = 5
const MIN_AMOUNT = 10

function formatNumber(num: number): string {
  if (num === 0) return '0'
  if (Number.isInteger(num)) return num.toString()
  const fixed = num.toFixed(2)
  return fixed.replace(/\.?0+$/, '') || '0'
}

function ToggleSwitch({ 
  enabled, 
  onToggle, 
  disabled = false 
}: { 
  enabled: boolean
  onToggle: () => void
  disabled?: boolean 
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={`relative w-10 h-5 rounded-full transition-all duration-200 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed ${
        enabled ? 'bg-[#00C74D] shadow-sm shadow-[#00C74D]/30' : 'bg-white/10'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${
          enabled ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

export default function BetPanelRefactored({
  panelId,
  defaultAmount = 10,
  currency = 'KSH',
  gamePhase,
  currentMultiplier,
  isLoggedIn = false,
  isFreebet,
  maxBalance,
  freebetLocked = false,
  autoBetEnabled = false,
  onAutoBetToggle,
}: BetPanelProps) {
  const betting = useBetting()
  const [amount, setAmount] = useState(defaultAmount)
  const [autoCashout, setAutoCashout] = useState('2.00')
  const [autoCashoutEnabled, setAutoCashoutEnabled] = useState(false)
  const [lastBetAmount, setLastBetAmount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const activeBet = betting.getActiveBet(panelId)
  const queuedBet = betting.getQueuedBet(panelId)
  const cashedOutBet = betting.bets.find(b => b.panelId === panelId && b.status === 'CASHED_OUT')

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, '')
    const numVal = parseInt(val, 10)
    if (!isNaN(numVal)) {
      setAmount(Math.min(numVal, maxBalance || 999999))
    } else if (val === '') {
      setAmount(0)
    }
  }

  const decrease = () => setAmount((prev) => Math.max(MIN_AMOUNT, prev - STEP))
  const increase = () => setAmount((prev) => Math.min(maxBalance || 999999, prev + STEP))

  useEffect(() => {
    if (autoCashoutEnabled && activeBet && gamePhase === 'flying' && autoCashout) {
      const target = parseFloat(autoCashout)
      if (!isNaN(target) && currentMultiplier >= target) {
        betting.cashOut(panelId, currentMultiplier)
      }
    }
  }, [currentMultiplier, gamePhase, activeBet, autoCashout, autoCashoutEnabled, panelId, betting])

  useEffect(() => {
    if (autoBetEnabled && gamePhase === 'waiting' && lastBetAmount >= MIN_AMOUNT && isLoggedIn && !activeBet && !queuedBet) {
      if (lastBetAmount <= maxBalance) {
        betting.placeBet(panelId, lastBetAmount, isFreebet, maxBalance, freebetLocked)
      }
    }
  }, [gamePhase, autoBetEnabled, lastBetAmount, isLoggedIn, panelId, betting, isFreebet, activeBet, queuedBet, maxBalance, freebetLocked])

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [error])

  const handleClick = () => {
    if (!isLoggedIn) return
    setError(null)

    if (activeBet && gamePhase === 'flying') {
      betting.cashOut(panelId, currentMultiplier)
      return
    }

    if (queuedBet) {
      betting.cancelQueuedBet(panelId)
      return
    }

    if (gamePhase === 'waiting' && !activeBet && !queuedBet) {
      const betAmount = Math.max(MIN_AMOUNT, Math.min(amount, maxBalance))
      
      if (betAmount > maxBalance) {
        setError('Insufficient funds')
        return
      }
      
      if (isFreebet && freebetLocked) {
        setError('Deposit at least 20 to unlock')
        return
      }
      
      const success = betting.placeBet(panelId, betAmount, isFreebet, maxBalance, freebetLocked)
      if (success) {
        setLastBetAmount(betAmount)
      } else {
        setError('Insufficient funds')
      }
      return
    }

    if ((gamePhase === 'flying' || gamePhase === 'crashed' || gamePhase === 'crashing') && !activeBet && !queuedBet) {
      const betAmount = Math.max(MIN_AMOUNT, Math.min(amount, maxBalance))
      
      if (betAmount > maxBalance) {
        setError('Insufficient funds')
        return
      }
      
      const success = betting.queueBet(panelId, betAmount, isFreebet, maxBalance, freebetLocked)
      if (success) {
        setLastBetAmount(betAmount)
      } else {
        setError('Insufficient funds')
      }
      return
    }
  }

  let buttonText = 'BET'
  let buttonSubtext = `${formatNumber(amount)} ${currency}`
  let buttonBg = 'from-[#00D455] to-[#00A83D]'
  let isDisabled = false
  let buttonShadow = 'shadow-[#00C74D]/25'

  if (!isLoggedIn) {
    buttonText = 'BET'
    buttonSubtext = `${formatNumber(amount)} ${currency}`
    buttonBg = 'from-[#00D455] to-[#00A83D]'
    buttonShadow = 'shadow-[#00C74D]/25'
  } else if (cashedOutBet && gamePhase !== 'waiting') {
    buttonText = 'WAIT'
    buttonSubtext = 'Next Round'
    buttonBg = 'from-[#374151] to-[#1F2937]'
    buttonShadow = 'shadow-black/20'
    isDisabled = true
  } else if (queuedBet) {
    buttonText = 'CANCEL'
    buttonSubtext = `Next Round`
    buttonBg = 'from-[#EF4444] to-[#DC2626]'
    buttonShadow = 'shadow-red-500/25'
  } else if (activeBet && gamePhase === 'flying') {
    const potentialWin = formatNumber(activeBet.amount * currentMultiplier)
    buttonText = 'CASH OUT'
    buttonSubtext = `${potentialWin} ${currency}`
    buttonBg = 'from-[#F59E0B] to-[#D97706]'
    buttonShadow = 'shadow-amber-500/25'
  } else if (activeBet && gamePhase === 'waiting') {
    buttonText = 'ACTIVE'
    buttonSubtext = `${formatNumber(activeBet.amount)} ${currency}`
    buttonBg = 'from-[#374151] to-[#1F2937]'
    buttonShadow = 'shadow-black/20'
    isDisabled = true
  } else if (gamePhase === 'crashed' || gamePhase === 'crashing') {
    buttonText = 'BET NEXT'
    buttonSubtext = `${formatNumber(amount)} ${currency}`
    buttonBg = 'from-[#00D455] to-[#00A83D]'
    buttonShadow = 'shadow-[#00C74D]/25'
  }

  return (
    <div className="bg-[#151920]/90 backdrop-blur-sm rounded-2xl p-2.5 border border-white/[0.06] w-full max-w-full overflow-hidden">
      {/* Error Toast */}
      {error && (
        <div className="mb-2 px-3 py-1.5 bg-red-500/10 border border-red-500/30 rounded-xl text-center animate-fade-in">
          <span className="text-red-400 text-[10px] font-bold">{error}</span>
        </div>
      )}
      {/* Compact 50/50 Layout */}
      <div className="flex flex-row w-full gap-2.5 items-stretch">
        {/* Left Block: All Controls (50%) */}
        <div className="w-1/2 flex flex-col gap-1.5">
          {/* Amount stepper */}
          <div className="flex items-center bg-white/[0.04] rounded-xl p-0.5 w-full border border-white/[0.06]">
            <button
              type="button"
              onClick={decrease}
              disabled={!!activeBet || !!queuedBet || !isLoggedIn}
              className="w-7 h-7 rounded-lg bg-white/[0.06] flex items-center justify-center text-[#00C74D] text-sm font-black hover:bg-white/[0.10] active:scale-90 transition-all duration-150 flex-shrink-0 disabled:opacity-35 disabled:cursor-not-allowed focus:outline-none"
            >
              −
            </button>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={amount.toLocaleString()}
              onChange={handleAmountChange}
              disabled={!!activeBet || !!queuedBet || !isLoggedIn}
              className="flex-1 bg-transparent text-center font-mono text-xs font-black text-white truncate focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none min-w-0"
            />
            <button
              type="button"
              onClick={increase}
              disabled={!!activeBet || !!queuedBet || !isLoggedIn}
              className="w-7 h-7 rounded-lg bg-white/[0.06] flex items-center justify-center text-[#00C74D] text-sm font-black hover:bg-white/[0.10] active:scale-90 transition-all duration-150 flex-shrink-0 disabled:opacity-35 disabled:cursor-not-allowed focus:outline-none"
            >
              +
            </button>
          </div>

          {/* Quick bet buttons */}
          <div className="grid grid-cols-4 gap-0.5 w-full">
            {QUICK_AMOUNTS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setAmount(Math.min(v, maxBalance || v))}
                disabled={!!activeBet || !!queuedBet || !isLoggedIn}
                className="h-6 rounded-lg bg-white/[0.04] text-[8px] font-mono font-bold text-white/70 hover:bg-white/[0.08] hover:text-white transition-all duration-150 disabled:opacity-35 disabled:cursor-not-allowed focus:outline-none border border-white/[0.04] truncate"
              >
                {v >= 1000 ? `${v / 1000}k` : v}
              </button>
            ))}
          </div>

          {/* Auto toggles */}
          <div className="flex flex-row items-center w-full bg-white/[0.03] rounded-xl px-1.5 py-1 text-[8px] border border-white/[0.04]">
            <div className="flex items-center gap-1">
              <span className="text-white/50 font-semibold">Auto</span>
              <ToggleSwitch
                enabled={autoBetEnabled}
                onToggle={() => onAutoBetToggle?.(!autoBetEnabled)}
                disabled={!isLoggedIn}
              />
            </div>

            <div className="flex-1" />

            <div className="flex items-center gap-0.5">
              <span className="text-white/50 font-semibold">@</span>
              <ToggleSwitch
                enabled={autoCashoutEnabled}
                onToggle={() => setAutoCashoutEnabled(!autoCashoutEnabled)}
                disabled={!isLoggedIn}
              />
              <div className="flex items-center bg-white/[0.04] rounded-lg border border-white/[0.06] overflow-hidden">
                <input
                  type="text"
                  value={autoCashout}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9.]/g, '')
                    setAutoCashout(val)
                  }}
                  disabled={!autoCashoutEnabled || !isLoggedIn}
                  className="w-7 h-4 bg-transparent text-white text-[9px] font-mono font-bold text-center focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                />
                <span className="text-[9px] text-white/40 font-bold pr-1">x</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Block: BET Button (50%) */}
        <div className="w-1/2">
          <button
            type="button"
            onClick={handleClick}
            disabled={isDisabled}
            className={`h-full w-full rounded-2xl flex flex-col justify-center items-center text-lg font-bold bg-gradient-to-b ${buttonBg} hover:brightness-110 active:scale-[0.97] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none shadow-lg ${buttonShadow}`}
          >
            <span className="text-base sm:text-lg font-black text-white tracking-wide drop-shadow-sm">{buttonText}</span>
            <span className="text-[10px] sm:text-xs font-bold text-white/85 font-mono mt-0.5 truncate max-w-full px-2">
              {buttonSubtext}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
