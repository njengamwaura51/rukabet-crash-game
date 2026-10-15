import { useState, useEffect } from 'react'
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Info,
  Loader2,
  Lock,
  Receipt,
  Smartphone,
} from 'lucide-react'
import { Modal } from './Modal'
import { useConfig } from '@/hooks/useConfig'

interface DepositModalProps {
  balance: number
  freebet: number
  freebetLocked: boolean
  userPhone?: string
  onClose: () => void
  onDeposit: (amount: number) => void
}

type WalletTab = 'deposit' | 'withdraw' | 'transactions'
type StatusKind = 'success' | 'error' | 'info'

interface Transaction {
  id: string
  type: string
  amount: number
  date: string
  status: string
}

const TOKEN_STORAGE_KEYS = ['rukabet_token', 'token', 'aspirebet_token'] as const
const MIN_DEPOSIT = 10
const MIN_WITHDRAW = 50
const QUICK_AMOUNTS = [50, 100, 500, 1000] as const

const TABS: { id: WalletTab; label: string }[] = [
  { id: 'deposit', label: 'Deposit' },
  { id: 'withdraw', label: 'Withdraw' },
  { id: 'transactions', label: 'History' },
]

const money = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const INPUT =
  'h-11 w-full rounded-md border border-line bg-field px-3 text-base font-semibold tabular-nums text-ink placeholder:text-sm placeholder:font-normal placeholder:text-ink-3 disabled:cursor-not-allowed disabled:text-ink-2'

const CTA =
  'mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-brand text-sm font-semibold text-brand-ink transition-colors hover:bg-brand-hover active:bg-brand-active disabled:cursor-not-allowed disabled:bg-raised disabled:text-ink-3'

const STATUS_STYLE: Record<StatusKind, string> = {
  success: 'border-brand-line bg-brand-tint text-brand',
  error: 'border-loss-line bg-loss-tint text-loss',
  info: 'border-line-strong bg-field text-ink-2',
}

const STATUS_ICON: Record<StatusKind, typeof Info> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
}

function readToken(): string | undefined {
  return TOKEN_STORAGE_KEYS
    .map(key => localStorage.getItem(key))
    .find((value): value is string => !!value)
}

function normalizeToNineDigitPhone(phone?: string): string {
  if (!phone) return ''
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length === 9 && /^[17]\d{8}$/.test(cleaned)) return cleaned
  if (cleaned.length === 10 && cleaned.startsWith('0') && /^[17]\d{8}$/.test(cleaned.slice(1))) return cleaned.slice(1)
  if (cleaned.length === 12 && cleaned.startsWith('254') && /^[17]\d{8}$/.test(cleaned.slice(3))) return cleaned.slice(3)
  return ''
}

function isDepositTx(tx: Transaction): boolean {
  return tx.type.toLowerCase() === 'deposit'
}

export function DepositModal({ balance, freebet, freebetLocked, userPhone, onClose, onDeposit }: DepositModalProps) {
  const { config } = useConfig()
  const [tab, setTab] = useState<WalletTab>('deposit')
  const [amount, setAmount] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [withdrawPhone, setWithdrawPhone] = useState(userPhone || '')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [isWithdrawing, setIsWithdrawing] = useState(false)
  const [status, setStatus] = useState<{ type: StatusKind; message: string } | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const registeredPhone = normalizeToNineDigitPhone(userPhone)

  // Load real transaction history when the history tab opens
  useEffect(() => {
    if (tab !== 'transactions') return
    const token = readToken()
    if (!token) return

    fetch(`${config.apiBaseUrl}/api/user/transactions`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.json())
      .then(data => {
        if (data?.success && Array.isArray(data.transactions)) {
          setTransactions(data.transactions)
        }
      })
      .catch(err => console.error('Failed to load transactions:', err))
  }, [tab, config.apiBaseUrl])

  const switchTab = (next: WalletTab) => {
    setTab(next)
    setStatus(null)
  }

  const handleDeposit = async () => {
    const depositAmount = parseFloat(amount)
    if (Number.isNaN(depositAmount) || depositAmount < MIN_DEPOSIT) {
      setStatus({ type: 'error', message: `Minimum deposit is KSH ${MIN_DEPOSIT}` })
      return
    }

    if (!registeredPhone) {
      setStatus({ type: 'error', message: 'No registered M-Pesa number on this account' })
      return
    }

    setIsProcessing(true)
    setStatus({ type: 'info', message: 'Sending M-Pesa prompt…' })

    try {
      const token = readToken()
      if (!token) {
        setStatus({ type: 'error', message: 'Log in to deposit' })
        setIsProcessing(false)
        return
      }

      const response = await fetch(`${config.apiBaseUrl}/api/deposit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount: depositAmount, phone: registeredPhone }),
      })

      if (response.status === 401) {
        throw new Error('Session expired. Log in again.')
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.error || 'STK push failed')
      }

      const data = await response.json()

      if (data.success) {
        setStatus({
          type: 'info',
          message: 'Prompt sent. Enter your M-Pesa PIN on your phone. Balance updates once payment is confirmed.',
        })
        setIsProcessing(false)
      } else {
        throw new Error(data.error || 'STK push failed')
      }
    } catch (error) {
      console.error('Deposit error:', error)
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Payment failed. Try again.',
      })
      setIsProcessing(false)
    }
  }

  const handleWithdraw = async () => {
    const withdrawAmt = parseFloat(withdrawAmount)
    if (Number.isNaN(withdrawAmt) || withdrawAmt < MIN_WITHDRAW) {
      setStatus({ type: 'error', message: `Minimum withdrawal is KSH ${MIN_WITHDRAW}` })
      return
    }

    if (withdrawAmt > balance) {
      setStatus({ type: 'error', message: 'Insufficient balance' })
      return
    }

    const phoneToUse = withdrawPhone || userPhone
    if (!phoneToUse) {
      setStatus({ type: 'error', message: 'Enter a valid M-Pesa number' })
      return
    }

    setIsWithdrawing(true)
    setStatus({ type: 'info', message: 'Submitting withdrawal…' })

    try {
      const token = readToken()
      if (!token) {
        setStatus({ type: 'error', message: 'Log in to withdraw' })
        setIsWithdrawing(false)
        return
      }

      const response = await fetch(`${config.apiBaseUrl}/api/withdraw`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount: withdrawAmt, phone: phoneToUse }),
      })

      const data = await response.json().catch(() => null)
      if (response.ok && data?.success) {
        setStatus({
          type: 'success',
          message: data.message || `Withdrawal of KSH ${money.format(withdrawAmt)} submitted`,
        })
        setWithdrawAmount('')
        onDeposit(-withdrawAmt)
      } else {
        setStatus({ type: 'error', message: data?.error || 'Withdrawal request failed' })
      }
    } catch {
      setStatus({ type: 'error', message: 'Network error. Try again.' })
    } finally {
      setIsWithdrawing(false)
    }
  }

  const StatusIcon = status ? STATUS_ICON[status.type] : null

  return (
    <Modal title="Wallet" onClose={onClose}>
      {/* Balances */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md border border-line bg-field p-2.5">
          <p className="text-[11px] font-medium text-ink-3">Balance</p>
          <p className="mt-1 truncate text-base font-semibold tabular-nums text-ink">
            <span className="mr-1 text-[11px] font-medium text-ink-3">KSH</span>
            {money.format(balance)}
          </p>
        </div>
        <div className="rounded-md border border-line bg-field p-2.5">
          <div className="flex items-center justify-between gap-1">
            <p className="text-[11px] font-medium text-ink-3">Freebet</p>
            <span className={`flex items-center gap-1 text-[11px] font-medium ${freebetLocked ? 'text-ink-3' : 'text-brand'}`}>
              {freebetLocked ? <Lock className="size-3" aria-hidden="true" /> : <Check className="size-3" aria-hidden="true" />}
              {freebetLocked ? 'Locked' : 'Unlocked'}
            </span>
          </div>
          <p className={`mt-1 truncate text-base font-semibold tabular-nums ${freebetLocked ? 'text-ink-3' : 'text-bonus'}`}>
            <span className="mr-1 text-[11px] font-medium text-ink-3">KSH</span>
            {money.format(freebet)}
          </p>
        </div>
      </div>
      {freebetLocked && (
        <p className="mt-2 text-xs text-ink-3">Deposit KSH 20+ and place one bet to unlock the freebet.</p>
      )}

      {/* Tabs */}
      <div role="tablist" aria-label="Wallet" className="mt-3 flex rounded-md border border-line bg-field p-0.5">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => switchTab(t.id)}
            className={`h-9 flex-1 rounded text-[13px] font-medium transition-colors ${
              tab === t.id ? 'bg-raised text-ink' : 'text-ink-3 hover:text-ink-2'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {status && StatusIcon && (
        <div
          role={status.type === 'error' ? 'alert' : 'status'}
          className={`mt-3 flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs sm:text-sm ${STATUS_STYLE[status.type]}`}
        >
          <StatusIcon className="mt-px size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0">{status.message}</span>
        </div>
      )}

      {tab === 'deposit' && (
        <div className="mt-3">
          <label htmlFor="deposit-amount" className="mb-1.5 block text-xs font-medium text-ink-2">
            Amount (KSH)
          </label>
          <input
            id="deposit-amount"
            type="number"
            inputMode="numeric"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder={`Minimum ${MIN_DEPOSIT}`}
            min={MIN_DEPOSIT}
            className={INPUT}
            disabled={isProcessing}
          />

          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {QUICK_AMOUNTS.map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setAmount(String(v))}
                disabled={isProcessing}
                aria-pressed={amount === String(v)}
                className={`h-9 rounded-md border text-xs font-semibold tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  amount === String(v)
                    ? 'border-brand-line bg-brand-tint text-brand'
                    : 'border-line bg-field text-ink-2 hover:bg-raised hover:text-ink'
                }`}
              >
                {v.toLocaleString('en-US')}
              </button>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-line bg-field px-2.5 py-2">
            <span className="flex items-center gap-1.5 text-xs text-ink-3">
              <Smartphone className="size-3.5" aria-hidden="true" />
              M-Pesa number
            </span>
            <span className="text-sm font-semibold tabular-nums text-ink">
              {registeredPhone ? `0${registeredPhone}` : userPhone || '—'}
            </span>
          </div>
          <p className="mt-1.5 text-[11px] text-ink-3">STK prompt is sent to this number.</p>

          <button
            type="button"
            onClick={handleDeposit}
            disabled={isProcessing || !amount || !registeredPhone}
            className={CTA}
          >
            {isProcessing ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Processing…
              </>
            ) : (
              'Deposit with M-Pesa'
            )}
          </button>
        </div>
      )}

      {tab === 'withdraw' && (
        <div className="mt-3">
          <label htmlFor="withdraw-phone" className="mb-1.5 block text-xs font-medium text-ink-2">
            M-Pesa number
          </label>
          <input
            id="withdraw-phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            value={withdrawPhone}
            onChange={e => setWithdrawPhone(e.target.value)}
            placeholder="0712345678"
            maxLength={10}
            disabled={isWithdrawing}
            className={INPUT}
          />

          <label htmlFor="withdraw-amount" className="mb-1.5 mt-3 block text-xs font-medium text-ink-2">
            Amount (KSH)
          </label>
          <input
            id="withdraw-amount"
            type="number"
            inputMode="numeric"
            value={withdrawAmount}
            onChange={e => setWithdrawAmount(e.target.value)}
            placeholder={`Minimum ${MIN_WITHDRAW}`}
            min={MIN_WITHDRAW}
            disabled={isWithdrawing}
            className={INPUT}
          />

          <div className="mt-2 flex items-center justify-between rounded-md border border-line bg-field px-2.5 py-2 text-xs">
            <span className="text-ink-3">Available</span>
            <span className="font-semibold tabular-nums text-ink">KSH {money.format(balance)}</span>
          </div>
          <p className="mt-1.5 text-[11px] text-ink-3">Min KSH {MIN_WITHDRAW}. Paid to M-Pesa after review.</p>

          <button
            type="button"
            onClick={handleWithdraw}
            disabled={isWithdrawing || !withdrawAmount || !withdrawPhone}
            className={CTA}
          >
            {isWithdrawing ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Processing…
              </>
            ) : (
              'Withdraw to M-Pesa'
            )}
          </button>
        </div>
      )}

      {tab === 'transactions' && (
        <div className="mt-3">
          {transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-md border border-line bg-field py-8 text-center">
              <Receipt className="mb-2 size-6 text-ink-3" aria-hidden="true" />
              <p className="text-sm font-medium text-ink-2">No transactions yet</p>
              <p className="mt-0.5 text-xs text-ink-3">Deposits and withdrawals appear here.</p>
            </div>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-field">
              {transactions.map(tx => {
                const deposit = isDepositTx(tx)
                return (
                  <li key={tx.id} className="flex items-center gap-2.5 px-2.5 py-2">
                    <span
                      className={`flex size-7 shrink-0 items-center justify-center rounded-md ${
                        deposit ? 'bg-brand-tint text-brand' : 'bg-loss-tint text-loss'
                      }`}
                    >
                      {deposit ? (
                        <ArrowDownLeft className="size-4" aria-hidden="true" />
                      ) : (
                        <ArrowUpRight className="size-4" aria-hidden="true" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{tx.type}</p>
                      <p className="truncate text-[11px] tabular-nums text-ink-3">{tx.date}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`text-sm font-semibold tabular-nums ${deposit ? 'text-brand' : 'text-loss'}`}>
                        {deposit ? '+' : '−'}{money.format(tx.amount)}
                      </p>
                      <p className="text-[11px] text-ink-3">{tx.status}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </Modal>
  )
}
