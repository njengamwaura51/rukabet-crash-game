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
  autoBetEnabled?: boolean
  onAutoBetToggle?: (enabled: boolean) => void
}

const QUICK_AMOUNTS = [10, 100, 1000, 10000] as const
const STEP = 5
const MIN_AMOUNT = 10

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
  autoBetEnabled = false,
  onAutoBetToggle,
}: BetPanelProps) {
  const betting = useBetting()
  const [amount, setAmount] = useState(defaultAmount)
  const [autoCashout, setAutoCashout] = useState('2.00')
  const [autoCashoutEnabled, setAutoCashoutEnabled] = useState(false)
  const [lastBetAmount, setLastBetAmount] = useState(0)

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
      betting.placeBet(panelId, lastBetAmount, isFreebet)
    }
  }, [gamePhase, autoBetEnabled, lastBetAmount, isLoggedIn, panelId, betting, isFreebet, activeBet, queuedBet])

  // Main button click handler
  const handleClick = () => {
    if (!isLoggedIn) return

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
      const success = betting.placeBet(panelId, betAmount, isFreebet)
      if (success) {
        setLastBetAmount(betAmount)
      }
      return
    }

    // QUEUE BET (during flying/crashed)
    if ((gamePhase === 'flying' || gamePhase === 'crashed' || gamePhase === 'crashing') && !activeBet && !queuedBet) {
      const betAmount = Math.max(MIN_AMOUNT, Math.min(amount, maxBalance))
      const success = betting.queueBet(panelId, betAmount, isFreebet)
      if (success) {
        setLastBetAmount(betAmount)
      }
      return
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BUTTON STATE MAPPING (ZERO LOGIC - PURELY REFLECTIVE)
  // ─────────────────────────────────────────────────────────────────────────

  let buttonText = 'BET'
  let buttonSubtext = `${amount.toFixed(2)} ${currency}`
  let buttonBg = '#00C74D'
  let isDisabled = false

  if (!isLoggedIn) {
    buttonText = 'BET'
    buttonSubtext = `${amount.toFixed(2)} ${currency}`
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
    const potentialWin = (activeBet.amount * currentMultiplier).toFixed(2)
    buttonText = 'CASH OUT'
    buttonSubtext = `${potentialWin} ${currency}`
    buttonBg = '#f59e0b'
  } else if (activeBet && gamePhase === 'waiting') {
    buttonText = 'ACTIVE'
    buttonSubtext = `${activeBet.amount.toFixed(2)} ${currency}`
    buttonBg = '#374151'
    isDisabled = true
  } else if (gamePhase === 'crashed' || gamePhase === 'crashing') {
    buttonText = 'BET NEXT'
    buttonSubtext = `${amount.toFixed(2)} ${currency}`
    buttonBg = '#00C74D'
  }

  return (
    <div className="bg-[#1a1d24] rounded-xl p-3 border border-white/5 flex flex-col gap-3 w-full max-w-full overflow-hidden">
      {/* Upper Section: Responsive layout */}
      <div className="flex flex-col xs:flex-row gap-3 w-full">
        {/* Left Column: Inputs */}
        <div className="flex-[3] flex flex-col gap-2 min-w-0">
          {/* Amount stepper - dark pill container */}
          <div className="flex items-center bg-[#0f1318] rounded-full p-1 w-full">
            <button
              type="button"
              onClick={decrease}
              disabled={!!activeBet || !!queuedBet || !isLoggedIn}
              className="w-9 h-9 rounded-full bg-[#252a33] flex items-center justify-center text-[#00C74D] text-xl font-black hover:bg-[#374151] active:scale-95 transition-all flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none"
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
              className="flex-1 bg-transparent text-center font-mono text-base sm:text-lg font-black text-white truncate focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none min-w-0"
            />
            <button
              type="button"
              onClick={increase}
              disabled={!!activeBet || !!queuedBet || !isLoggedIn}
              className="w-9 h-9 rounded-full bg-[#252a33] flex items-center justify-center text-[#00C74D] text-xl font-black hover:bg-[#374151] active:scale-95 transition-all flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none"
            >
              +
            </button>
          </div>

          {/* Quick bet buttons - 4 column grid */}
          <div className="grid grid-cols-4 gap-1.5 w-full">
            {QUICK_AMOUNTS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setAmount(Math.min(v, maxBalance || v))}
                disabled={!!activeBet || !!queuedBet || !isLoggedIn}
                className="h-8 rounded-lg bg-[#0f1318] text-[10px] sm:text-[11px] font-mono font-bold text-white/70 hover:bg-[#252a33] hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none truncate"
              >
                {v >= 1000 ? `${v / 1000}k` : v}
              </button>
            ))}
          </div>
        </div>

        {/* Right Column: BET Button - full width on xs, shrink on sm+ */}
        <button
          type="button"
          onClick={handleClick}
          disabled={isDisabled}
          style={{ backgroundColor: buttonBg }}
          className="flex-[2] w-full xs:min-w-[100px] min-h-[80px] flex flex-col items-center justify-center rounded-xl hover:brightness-110 active:scale-[0.98] transition-transform disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none"
        >
          <span className="text-lg sm:text-xl font-black text-white tracking-wide">{buttonText}</span>
          <span className="text-xs font-bold text-white/90 font-mono mt-0.5 truncate max-w-full px-2">
            {buttonSubtext}
          </span>
        </button>
      </div>

      {/* Lower Section: Auto controls - responsive stacking */}
      <div className="flex flex-col xs:flex-row items-start xs:items-center justify-between gap-2 xs:gap-0 bg-[#0f1318] rounded-lg px-3 py-2 w-full overflow-x-auto">
        {/* Auto Bet */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-gray-400 font-medium whitespace-nowrap">Auto Bet</span>
          <ToggleSwitch
            enabled={autoBetEnabled}
            onToggle={() => onAutoBetToggle?.(!autoBetEnabled)}
            disabled={!isLoggedIn}
          />
        </div>

        {/* Divider */}
        <div className="hidden xs:block w-px h-5 bg-white/10 flex-shrink-0" />

        {/* Auto Cash Out */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-gray-400 font-medium whitespace-nowrap">Auto Cash Out</span>
          <ToggleSwitch
            enabled={autoCashoutEnabled}
            onToggle={() => setAutoCashoutEnabled(!autoCashoutEnabled)}
            disabled={!isLoggedIn}
          />
          <div className="flex items-center bg-[#1a1d24] rounded-md border border-white/10 overflow-hidden flex-shrink-0">
            <input
              type="text"
              value={autoCashout}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9.]/g, '')
                setAutoCashout(val)
              }}
              disabled={!autoCashoutEnabled || !isLoggedIn}
              className="w-12 h-6 bg-transparent text-white text-xs font-mono font-bold text-center focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span className="text-xs text-gray-400 font-bold pr-2">x</span>
          </div>
        </div>
      </div>
    </div>
  )
}
