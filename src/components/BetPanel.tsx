import { useState, useEffect } from 'react'
import { Minus, Plus } from 'lucide-react'
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
  disabled = false,
  label,
}: {
  enabled: boolean
  onToggle: () => void
  disabled?: boolean
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      onClick={onToggle}
      disabled={disabled}
      className="flex h-10 w-12 shrink-0 items-center justify-center disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span
        className={`relative block h-[22px] w-10 rounded-full transition-colors ${enabled ? 'bg-brand' : 'bg-raised'}`}
      >
        <span
          className={`absolute left-[3px] top-[3px] size-4 rounded-full bg-white transition-transform ${
            enabled ? 'translate-x-[18px]' : 'translate-x-0'
          }`}
        />
      </span>
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
      
      if (isFreebet && freebetLocked) {
        setError('Deposit at least 20 to activate account')
        return
      }
      
      if (betAmount > maxBalance) {
        setError('Insufficient funds')
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

  // Sentence-case labels, flat solid colours (dark text on green/amber for contrast)
  let buttonText = 'Bet'
  let buttonSubtext = `${formatNumber(amount)} ${currency}`
  let buttonStyle = 'bg-brand text-brand-ink hover:bg-brand-hover active:bg-brand-hover'
  let isDisabled = false

  if (!isLoggedIn) {
    buttonText = 'Bet'
  } else if (cashedOutBet && gamePhase !== 'waiting') {
    buttonText = 'Wait'
    buttonSubtext = 'Next round'
    buttonStyle = 'bg-raised text-ink-2'
    isDisabled = true
  } else if (queuedBet) {
    buttonText = 'Cancel'
    buttonSubtext = 'Next round'
    buttonStyle = 'bg-[#d93036] text-white hover:bg-[#c42a30] active:bg-[#c42a30]'
  } else if (activeBet && gamePhase === 'flying') {
    const potentialWin = formatNumber(activeBet.amount * currentMultiplier)
    buttonText = 'Cash out'
    buttonSubtext = `${potentialWin} ${currency}`
    buttonStyle = 'bg-cashout text-[#2b1700] hover:brightness-95 active:brightness-95'
  } else if (activeBet && gamePhase === 'waiting') {
    buttonText = 'Bet placed'
    buttonSubtext = `${formatNumber(activeBet.amount)} ${currency}`
    buttonStyle = 'bg-raised text-ink-2'
    isDisabled = true
  } else if (gamePhase === 'crashed' || gamePhase === 'crashing') {
    buttonText = 'Bet next'
  }

  const controlsLocked = !!activeBet || !!queuedBet || !isLoggedIn

  return (
    <div className="w-full max-w-full overflow-hidden rounded-lg border border-line bg-panel">
      {error && (
        <div
          role="alert"
          className="animate-fade-in mx-3 mt-3 rounded-md border border-loss/30 bg-loss/10 px-3 py-2 text-center text-sm font-medium text-loss"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(7rem,0.62fr)] gap-2 p-3">
        {/* Amount stepper */}
        <div className="flex h-11 items-center rounded-md border border-line bg-field">
          <button
            type="button"
            onClick={decrease}
            disabled={controlsLocked}
            aria-label="Decrease bet"
            className="flex h-full w-11 shrink-0 items-center justify-center rounded-l-md text-brand hover:bg-raised disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Minus className="size-4" aria-hidden="true" />
          </button>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label={`Bet amount in ${currency}`}
            value={amount.toLocaleString()}
            onChange={handleAmountChange}
            disabled={controlsLocked}
            className="h-full min-w-0 flex-1 bg-transparent text-center text-base font-semibold tabular-nums text-ink disabled:cursor-not-allowed disabled:opacity-50"
          />
          <button
            type="button"
            onClick={increase}
            disabled={controlsLocked}
            aria-label="Increase bet"
            className="flex h-full w-11 shrink-0 items-center justify-center rounded-r-md text-brand hover:bg-raised disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Plus className="size-4" aria-hidden="true" />
          </button>
        </div>

        {/* Main action: spans stepper + quick amounts */}
        <button
          type="button"
          onClick={handleClick}
          disabled={isDisabled}
          className={`row-span-2 flex min-h-[5.75rem] w-full flex-col items-center justify-center rounded-md px-2 text-center transition-colors disabled:cursor-not-allowed ${buttonStyle}`}
        >
          <span className="text-lg font-bold leading-tight">{buttonText}</span>
          <span className="mt-0.5 max-w-full truncate text-sm font-medium tabular-nums opacity-90">
            {buttonSubtext}
          </span>
        </button>

        {/* Quick amounts */}
        <div className="grid grid-cols-4 gap-1.5">
          {QUICK_AMOUNTS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setAmount(Math.min(v, maxBalance || v))}
              disabled={controlsLocked}
              className="h-9 rounded-md border border-line bg-field text-xs font-semibold tabular-nums text-ink-2 hover:bg-raised hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
            >
              {v >= 1000 ? `${v / 1000}k` : v}
            </button>
          ))}
        </div>

        {/* Auto play */}
        <div className="col-span-2 flex flex-wrap items-center justify-between gap-x-3 rounded-md border border-line bg-field pl-3 pr-1">
          <div className="flex items-center">
            <span className="text-sm text-ink-2">Auto bet</span>
            <ToggleSwitch
              label={`Auto bet, panel ${panelId}`}
              enabled={autoBetEnabled}
              onToggle={() => onAutoBetToggle?.(!autoBetEnabled)}
              disabled={!isLoggedIn}
            />
          </div>

          <div className="flex items-center">
            <span className="text-sm text-ink-2">Auto cash out</span>
            <ToggleSwitch
              label={`Auto cash out, panel ${panelId}`}
              enabled={autoCashoutEnabled}
              onToggle={() => setAutoCashoutEnabled(!autoCashoutEnabled)}
              disabled={!isLoggedIn}
            />
            <div className="flex h-8 items-center rounded border border-line bg-page px-2">
              <input
                type="text"
                inputMode="decimal"
                aria-label="Auto cash out multiplier"
                value={autoCashout}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9.]/g, '')
                  setAutoCashout(val)
                }}
                disabled={!autoCashoutEnabled || !isLoggedIn}
                className="w-10 bg-transparent text-center text-base font-semibold tabular-nums text-ink disabled:cursor-not-allowed disabled:opacity-40"
              />
              <span className="text-sm text-ink-3">x</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
