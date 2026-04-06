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

// Clean number formatting - no ugly trailing zeros
function formatNumber(num: number): string {
  if (num === 0) return '0'
  if (Number.isInteger(num)) return num.toString()
  const fixed = num.toFixed(2)
  // Remove trailing zeros after decimal
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
      className={`relative w-10 h-5 rounded-full transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
        enabled ? 'bg-[#00C74D]' : 'bg-[#374151]'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
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

  // Query the centralized state
  const activeBet = betting.getActiveBet(panelId)
  const queuedBet = betting.getQueuedBet(panelId)
  const cashedOutBet = betting.bets.find(b => b.panelId === panelId && b.status === 'CASHED_OUT')

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 4: ZERO LOCAL LOGIC - PURELY REFLECTIVE UI
  // ─────────────────────────────────────────────────────────────────────────

  // Handle amount changes
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

  // Auto-cashout logic
  useEffect(() => {
    if (autoCashoutEnabled && activeBet && gamePhase === 'flying' && autoCashout) {
      const target = parseFloat(autoCashout)
      if (!isNaN(target) && currentMultiplier >= target) {
        betting.cashOut(panelId, currentMultiplier)
      }
    }
  }, [currentMultiplier, gamePhase, activeBet, autoCashout, autoCashoutEnabled, panelId, betting])

  // Auto-bet logic: place bet automatically when new round starts
  useEffect(() => {
    if (autoBetEnabled && gamePhase === 'waiting' && lastBetAmount >= MIN_AMOUNT && isLoggedIn && !activeBet && !queuedBet) {
      if (lastBetAmount <= maxBalance) {
        betting.placeBet(panelId, lastBetAmount, isFreebet, maxBalance, freebetLocked)
      }
    }
  }, [gamePhase, autoBetEnabled, lastBetAmount, isLoggedIn, panelId, betting, isFreebet, activeBet, queuedBet, maxBalance, freebetLocked])

  // Clear error after 3 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [error])

  // Main button click handler
  const handleClick = () => {
    if (!isLoggedIn) return
    setError(null)

    // CASH OUT (during flying with active bet)
    if (activeBet && gamePhase === 'flying') {
      betting.cashOut(panelId, currentMultiplier)
      return
    }

    // CANCEL QUEUED BET
    if (queuedBet) {
      betting.cancelQueuedBet(panelId)
      return
    }

    // PLACE BET (during waiting)
    if (gamePhase === 'waiting' && !activeBet && !queuedBet) {
      const betAmount = Math.max(MIN_AMOUNT, Math.min(amount, maxBalance))
      
      // VALIDATION: Check balance
      if (betAmount > maxBalance) {
        setError('Insufficient funds')
        return
      }
      
      // VALIDATION: Check freebet lock
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

    // QUEUE BET (during flying/crashed)
    if ((gamePhase === 'flying' || gamePhase === 'crashed' || gamePhase === 'crashing') && !activeBet && !queuedBet) {
      const betAmount = Math.max(MIN_AMOUNT, Math.min(amount, maxBalance))
      
      // VALIDATION: Check balance
      if (betAmount > maxBalance) {
        setError('Insufficient funds')
        return
      }
      
      const success = betting.queueBet(panelId, betAmount, isFreebet, maxBalance)
      if (success) {
        setLastBetAmount(betAmount)
      } else {
        setError('Insufficient funds')
      }
      return
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BUTTON STATE MAPPING (ZERO LOGIC - PURELY REFLECTIVE)
  // ─────────────────────────────────────────────────────────────────────────

  let buttonText = 'BET'
  let buttonSubtext = `${formatNumber(amount)} ${currency}`
  let buttonBg = '#00C74D'
  let isDisabled = false

  if (!isLoggedIn) {
    buttonText = 'BET'
    buttonSubtext = `${formatNumber(amount)} ${currency}`
    buttonBg = '#00C74D'
  } else if (cashedOutBet && gamePhase !== 'waiting') {
    buttonText = 'WAIT'
    buttonSubtext = 'Next Round'
    buttonBg = '#374151'
    isDisabled = true
  } else if (queuedBet) {
    buttonText = 'CANCEL'
    buttonSubtext = `Next Round`
    buttonBg = '#ef4444'
  } else if (activeBet && gamePhase === 'flying') {
    const potentialWin = formatNumber(activeBet.amount * currentMultiplier)
    buttonText = 'CASH OUT'
    buttonSubtext = `${potentialWin} ${currency}`
    buttonBg = '#f59e0b'
  } else if (activeBet && gamePhase === 'waiting') {
    buttonText = 'ACTIVE'
    buttonSubtext = `${formatNumber(activeBet.amount)} ${currency}`
    buttonBg = '#374151'
    isDisabled = true
  } else if (gamePhase === 'crashed' || gamePhase === 'crashing') {
    buttonText = 'BET NEXT'
    buttonSubtext = `${formatNumber(amount)} ${currency}`
    buttonBg = '#00C74D'
  }

  return (
    <div className="bg-[#1a1d24] rounded-xl p-2 border border-white/5 w-full max-w-full overflow-hidden">
      {/* Error Toast */}
      {error && (
        <div className="mb-2 px-2 py-1.5 bg-red-500/20 border border-red-500/50 rounded-lg text-center">
          <span className="text-red-400 text-[10px] font-bold">{error}</span>
        </div>
      )}
      {/* Compact 50/50 Layout */}
      <div className="flex flex-row w-full gap-2 items-stretch">
        {/* Left Block: All Controls (50%) */}
        <div className="w-1/2 flex flex-col gap-1">
          {/* Row 1: Amount stepper - reduced height */}
          <div className="flex items-center bg-[#0f1318] rounded-full p-0.5 w-full">
            <button
              type="button"
              onClick={decrease}
              disabled={!!activeBet || !!queuedBet || !isLoggedIn}
              className="w-6 h-6 rounded-full bg-[#252a33] flex items-center justify-center text-[#00C74D] text-sm font-black hover:bg-[#374151] active:scale-95 transition-all flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none"
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
              className="flex-1 bg-transparent text-center font-mono text-xs font-black text-white truncate focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none min-w-0"
            />
            <button
              type="button"
              onClick={increase}
              disabled={!!activeBet || !!queuedBet || !isLoggedIn}
              className="w-6 h-6 rounded-full bg-[#252a33] flex items-center justify-center text-[#00C74D] text-sm font-black hover:bg-[#374151] active:scale-95 transition-all flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none"
            >
              +
            </button>
          </div>

          {/* Row 2: Quick bet buttons - reduced height */}
          <div className="grid grid-cols-4 gap-0.5 w-full">
            {QUICK_AMOUNTS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setAmount(Math.min(v, maxBalance || v))}
                disabled={!!activeBet || !!queuedBet || !isLoggedIn}
                className="h-5 rounded bg-[#0f1318] text-[8px] font-mono font-bold text-gray-100 hover:bg-[#252a33] hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none truncate"
              >
                {v >= 1000 ? `${v / 1000}k` : v}
              </button>
            ))}
          </div>

          {/* Row 3: Auto toggles - EXTENDED to full width with better spacing */}
          <div className="flex flex-row items-center w-full bg-[#0f1318] rounded px-1 py-0.5 text-[8px]">
            {/* Auto Bet */}
            <div className="flex items-center gap-0.5">
              <span className="text-gray-200 font-semibold">Auto</span>
              <ToggleSwitch
                enabled={autoBetEnabled}
                onToggle={() => onAutoBetToggle?.(!autoBetEnabled)}
                disabled={!isLoggedIn}
              />
            </div>

            {/* Spacer to push Auto Cash Out to the right */}
            <div className="flex-1" />

            {/* Auto Cash Out - extended to right edge */}
            <div className="flex items-center gap-0.5">
              <span className="text-gray-200 font-semibold">@</span>
              <ToggleSwitch
                enabled={autoCashoutEnabled}
                onToggle={() => setAutoCashoutEnabled(!autoCashoutEnabled)}
                disabled={!isLoggedIn}
              />
              <div className="flex items-center bg-[#1a1d24] rounded border border-white/10 overflow-hidden">
                <input
                  type="text"
                  value={autoCashout}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9.]/g, '')
                    setAutoCashout(val)
                  }}
                  disabled={!autoCashoutEnabled || !isLoggedIn}
                  className="w-7 h-4 bg-transparent text-white text-[9px] font-mono font-bold text-center focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <span className="text-[9px] text-gray-200 font-bold pr-0.5">x</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Block: Giant BET Button (50%) */}
        <div className="w-1/2">
          <button
            type="button"
            onClick={handleClick}
            disabled={isDisabled}
            style={{ backgroundColor: buttonBg }}
            className="h-full w-full rounded-xl flex flex-col justify-center items-center text-lg font-bold hover:brightness-110 active:scale-[0.98] transition-transform disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none"
          >
            <span className="text-base sm:text-lg font-black text-white tracking-wide">{buttonText}</span>
            <span className="text-[10px] sm:text-xs font-bold text-white/90 font-mono mt-0.5 truncate max-w-full px-2">
              {buttonSubtext}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
