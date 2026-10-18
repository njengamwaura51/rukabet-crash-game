import { useState, useEffect, type ChangeEvent } from 'react'
import { AlertCircle, Minus, Plus } from 'lucide-react'
import { useBetting } from '@/contexts/BettingContext'
import { useConfig } from '@/hooks/useConfig'
import type { Phase } from '@/hooks/useGameState'

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

const QUICK_ADD = [100, 200, 500, 1000] as const
const STEP = 5
const MIN_AMOUNT = 10
const FALLBACK_MAX = 999999
const MIN_AUTO_CASHOUT = 1.01

function formatNumber(num: number): string {
  if (num === 0) return '0'
  if (Number.isInteger(num)) return num.toLocaleString('en-US')
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatChip(v: number): string {
  return v >= 1000 ? `+${v / 1000}k` : `+${v}`
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
      className="flex h-8 w-10 shrink-0 items-center justify-center sm:h-9 sm:w-11 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span
        className={`relative block h-[18px] w-8 rounded-full border transition-colors sm:h-5 sm:w-9 ${
          enabled ? 'border-brand bg-brand' : 'border-line-strong bg-raised'
        }`}
      >
        <span
          className={`absolute left-px top-px size-3.5 rounded-full transition-transform sm:size-4 ${
            enabled ? 'translate-x-[14px] bg-brand-ink sm:translate-x-4' : 'translate-x-0 bg-ink-2'
          }`}
        />
      </span>
    </button>
  )
}

interface CtaState {
  title: string
  sub: string
  className: string
  subClassName: string
  disabled: boolean
}

export default function BetPanel({
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
  const { config } = useConfig()
  const betting = useBetting()
  const freebetUnlockAmount = config.freebetUnlockAmount ?? 50
  const minAmount = config.minBet ?? MIN_AMOUNT
  const [amount, setAmount] = useState(defaultAmount)
  const [autoCashout, setAutoCashout] = useState('2.00')
  const [autoCashoutEnabled, setAutoCashoutEnabled] = useState(false)
  const [lastBetAmount, setLastBetAmount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const activeBet = betting.getActiveBet(panelId)
  const queuedBet = betting.getQueuedBet(panelId)
  const cashedOutBet = betting.bets.find(b => b.panelId === panelId && b.status === 'CASHED_OUT')
  const ceiling = maxBalance || FALLBACK_MAX

  const handleAmountChange = (e: ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/[^0-9]/g, '')
    if (digits === '') {
      setAmount(0)
      return
    }
    const next = parseInt(digits, 10)
    if (!Number.isNaN(next)) setAmount(Math.min(next, ceiling))
  }

  const handleAmountBlur = () => {
    if (amount < MIN_AMOUNT) setAmount(MIN_AMOUNT)
  }

  const decrease = () => setAmount(prev => Math.max(MIN_AMOUNT, prev - STEP))
  const increase = () => setAmount(prev => Math.min(ceiling, prev + STEP))
  const addQuick = (v: number) => setAmount(prev => Math.min(ceiling, prev + v))

  const handleAutoCashoutBlur = () => {
    const n = parseFloat(autoCashout)
    setAutoCashout(Number.isNaN(n) || n < MIN_AUTO_CASHOUT ? MIN_AUTO_CASHOUT.toFixed(2) : n.toFixed(2))
  }

  useEffect(() => {
    if (autoCashoutEnabled && activeBet && gamePhase === 'flying' && autoCashout) {
      const target = parseFloat(autoCashout)
      if (!Number.isNaN(target) && currentMultiplier >= target) {
        betting.cashOut(panelId, currentMultiplier)
      }
    }
  }, [currentMultiplier, gamePhase, activeBet, autoCashout, autoCashoutEnabled, panelId, betting])

  useEffect(() => {
    if (autoBetEnabled && gamePhase === 'waiting' && lastBetAmount >= MIN_AMOUNT && isLoggedIn && !activeBet && !queuedBet) {
      if (lastBetAmount <= maxBalance) {
        const parsed = autoCashoutEnabled && autoCashout ? parseFloat(autoCashout) : undefined
        const validAutoCashout = typeof parsed === 'number' && Number.isFinite(parsed) && parsed >= 1.01 ? parsed : undefined
        betting.placeBet(panelId, lastBetAmount, isFreebet, maxBalance, freebetLocked, validAutoCashout)
      }
    }
  }, [gamePhase, autoBetEnabled, lastBetAmount, isLoggedIn, panelId, betting, isFreebet, activeBet, queuedBet, maxBalance, freebetLocked, autoCashoutEnabled, autoCashout])

  useEffect(() => {
    if (!error) return
    const timer = setTimeout(() => setError(null), 3000)
    return () => clearTimeout(timer)
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

    const betAmount = Math.max(minAmount, Math.min(amount, maxBalance))
    const parsedTarget = autoCashoutEnabled && autoCashout ? parseFloat(autoCashout) : undefined
    const validAutoCashout = typeof parsedTarget === 'number' && Number.isFinite(parsedTarget) && parsedTarget >= 1.01 ? parsedTarget : undefined

    // Check freebet lock upfront across all phases
    if (isFreebet && freebetLocked) {
      setError(`Freebets locked: Deposit KSH ${freebetUnlockAmount}+ to unlock`)
      return
    }

    if (gamePhase === 'waiting' && !activeBet) {
      if (betAmount > maxBalance) {
        setError('Insufficient funds')
        return
      }
      const success = betting.placeBet(panelId, betAmount, isFreebet, maxBalance, freebetLocked, validAutoCashout)
      if (success) {
        setLastBetAmount(betAmount)
      } else {
        setError(isFreebet && freebetLocked ? `Freebets locked: Deposit KSH ${freebetUnlockAmount}+ to unlock` : 'Insufficient funds')
      }
      return
    }

    if ((gamePhase === 'flying' || gamePhase === 'crashed' || gamePhase === 'crashing') && !activeBet) {
      if (betAmount > maxBalance) {
        setError('Insufficient funds')
        return
      }
      const success = betting.queueBet(panelId, betAmount, isFreebet, maxBalance, freebetLocked, validAutoCashout)
      if (success) {
        setLastBetAmount(betAmount)
      } else {
        setError(isFreebet && freebetLocked ? `Freebets locked: Deposit KSH ${freebetUnlockAmount}+ to unlock` : 'Insufficient funds')
      }
    }
  }

  // Sentence-case labels, flat solid colours. Dark ink on green/amber for contrast.
  let cta: CtaState = {
    title: 'Bet',
    sub: `${formatNumber(amount)} ${currency}`,
    className: 'bg-brand text-brand-ink hover:bg-brand-hover active:bg-brand-active',
    subClassName: 'text-brand-ink-2',
    disabled: false,
  }

  if (!isLoggedIn) {
    cta = { ...cta, title: 'Bet' }
  } else if (cashedOutBet && gamePhase !== 'waiting') {
    cta = {
      title: 'Cashed out',
      sub: `+${formatNumber(cashedOutBet.wonAmount ?? 0)} ${currency}`,
      className: 'border border-brand-line bg-brand-tint text-ink',
      subClassName: 'text-brand',
      disabled: true,
    }
  } else if (queuedBet) {
    cta = {
      title: 'Cancel',
      sub: 'Next round',
      className: 'bg-cancel text-ink hover:bg-cancel-hover active:bg-cancel-hover',
      subClassName: 'text-ink',
      disabled: false,
    }
  } else if (activeBet && gamePhase === 'flying') {
    cta = {
      title: 'Cash out',
      sub: `${formatNumber(activeBet.amount * currentMultiplier)} ${currency}`,
      className: 'bg-cashout text-cashout-ink hover:bg-cashout-hover active:bg-cashout-hover',
      subClassName: 'text-cashout-ink-2',
      disabled: false,
    }
  } else if (activeBet && gamePhase === 'waiting') {
    cta = {
      title: 'Bet placed',
      sub: `${formatNumber(activeBet.amount)} ${currency}`,
      className: 'bg-raised text-ink-2',
      subClassName: 'text-ink-3',
      disabled: true,
    }
  } else if (gamePhase === 'crashed' || gamePhase === 'crashing') {
    cta = { ...cta, title: 'Bet next' }
  }

  const controlsLocked = !!activeBet || !!queuedBet || !isLoggedIn

  return (
    <section
      aria-label={`Bet panel ${panelId}`}
      className="w-full max-w-full overflow-hidden rounded-lg border border-line bg-panel"
    >
      {error && (
        <div
          role="alert"
          className="animate-fade-in mx-2 mt-2 flex items-center gap-1.5 rounded-md border border-loss-line bg-loss-tint px-2.5 py-1.5 text-xs font-medium text-loss sm:mx-3 sm:mt-3 sm:text-sm"
        >
          <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 truncate">{error}</span>
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(6.5rem,0.6fr)] gap-1.5 p-2 sm:grid-cols-[minmax(0,1fr)_minmax(7rem,0.62fr)] sm:gap-2 sm:p-3">
        {/* Amount stepper */}
        <div className="flex h-9 items-stretch overflow-hidden rounded-md border border-line bg-field sm:h-11">
          <button
            type="button"
            onClick={decrease}
            disabled={controlsLocked}
            aria-label="Decrease bet"
            className="flex w-9 shrink-0 items-center justify-center border-r border-line text-ink-2 transition-colors hover:bg-raised hover:text-ink sm:w-11 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Minus className="size-3.5 sm:size-4" aria-hidden="true" />
          </button>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9,]*"
            aria-label={`Bet amount in ${currency}`}
            value={amount.toLocaleString('en-US')}
            onChange={handleAmountChange}
            onBlur={handleAmountBlur}
            disabled={controlsLocked}
            className="min-w-0 flex-1 bg-field text-center text-sm font-semibold tabular-nums text-ink sm:text-base disabled:cursor-not-allowed disabled:text-ink-2"
          />
          <button
            type="button"
            onClick={increase}
            disabled={controlsLocked}
            aria-label="Increase bet"
            className="flex w-9 shrink-0 items-center justify-center border-l border-line text-ink-2 transition-colors hover:bg-raised hover:text-ink sm:w-11 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Plus className="size-3.5 sm:size-4" aria-hidden="true" />
          </button>
        </div>

        {/* Primary trigger: spans stepper + quick chips */}
        <button
          type="button"
          onClick={handleClick}
          disabled={cta.disabled}
          className={`row-span-2 flex min-h-[4.25rem] w-full select-none flex-col items-center justify-center rounded-md px-1.5 text-center transition-colors sm:min-h-[5.75rem] sm:px-2 disabled:cursor-not-allowed ${cta.className}`}
        >
          <span className="text-base font-bold leading-tight tracking-tight sm:text-lg">{cta.title}</span>
          <span className={`mt-0.5 max-w-full truncate text-xs font-semibold tabular-nums sm:text-sm ${cta.subClassName}`}>
            {cta.sub}
          </span>
        </button>

        {/* Quick-add chips */}
        <div className="grid grid-cols-4 gap-1 sm:gap-1.5">
          {QUICK_ADD.map(v => (
            <button
              key={v}
              type="button"
              onClick={() => addQuick(v)}
              disabled={controlsLocked}
              aria-label={`Add ${v} to bet`}
              className="h-7 rounded-md border border-line bg-field text-[11px] font-semibold tabular-nums text-ink-2 transition-colors hover:bg-raised hover:text-ink sm:h-9 sm:text-xs disabled:cursor-not-allowed disabled:opacity-30"
            >
              {formatChip(v)}
            </button>
          ))}
        </div>

        {/* Auto play */}
        <div className="col-span-2 flex flex-wrap items-center justify-between gap-x-2 rounded-md border border-line bg-field py-0.5 pl-2 pr-1 sm:gap-x-3 sm:py-1 sm:pl-3 sm:pr-1.5">
          <div className="flex items-center gap-0.5">
            <span className="text-[11px] text-ink-2 sm:text-xs">Auto bet</span>
            <ToggleSwitch
              label={`Auto bet, panel ${panelId}`}
              enabled={autoBetEnabled}
              onToggle={() => onAutoBetToggle?.(!autoBetEnabled)}
              disabled={!isLoggedIn}
            />
          </div>

          <div className="flex items-center gap-0.5">
            <span className="text-[11px] text-ink-2 sm:text-xs">Auto cash out</span>
            <ToggleSwitch
              label={`Auto cash out, panel ${panelId}`}
              enabled={autoCashoutEnabled}
              onToggle={() => setAutoCashoutEnabled(v => !v)}
              disabled={!isLoggedIn}
            />
            <div
              className={`flex h-7 items-center rounded border px-1.5 sm:h-8 sm:px-2 ${
                autoCashoutEnabled && isLoggedIn ? 'border-line-strong bg-page' : 'border-line bg-page'
              }`}
            >
              <input
                type="text"
                inputMode="decimal"
                aria-label="Auto cash out multiplier"
                value={autoCashout}
                onChange={e => setAutoCashout(e.target.value.replace(/[^0-9.]/g, ''))}
                onBlur={handleAutoCashoutBlur}
                disabled={!autoCashoutEnabled || !isLoggedIn}
                className="w-9 bg-page text-right text-xs font-semibold tabular-nums text-ink sm:w-11 sm:text-sm disabled:cursor-not-allowed disabled:text-ink-3"
              />
              <span className="ml-0.5 text-[11px] text-ink-3 sm:text-xs">x</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
