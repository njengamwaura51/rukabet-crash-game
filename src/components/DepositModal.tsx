import { useState, useEffect } from 'react'
import { Check, Loader2, Lock, Receipt } from 'lucide-react'
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

const TOKEN_STORAGE_KEYS = ['rukabet_token', 'token', 'aspirebet_token'] as const

function normalizeToNineDigitPhone(phone?: string): string {
  if (!phone) return ''
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length === 9 && /^[17]\d{8}$/.test(cleaned)) return cleaned
  if (cleaned.length === 10 && cleaned.startsWith('0') && /^[17]\d{8}$/.test(cleaned.slice(1))) return cleaned.slice(1)
  if (cleaned.length === 12 && cleaned.startsWith('254') && /^[17]\d{8}$/.test(cleaned.slice(3))) return cleaned.slice(3)
  return ''
}

export function DepositModal({ balance, freebet, freebetLocked, userPhone, onClose, onDeposit }: DepositModalProps) {
  const { config } = useConfig()
  const [tab, setTab] = useState<WalletTab>('deposit')
  const [amount, setAmount] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [withdrawPhone, setWithdrawPhone] = useState(userPhone || '')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [isWithdrawing, setIsWithdrawing] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null)
  const [transactions, setTransactions] = useState<{ id: string; type: string; amount: number; date: string; status: string }[]>([])
  const registeredPhone = normalizeToNineDigitPhone(userPhone)

  // Fetch real transaction history when user opens the transactions tab
  useEffect(() => {
    if (tab !== 'transactions') return
    const token = TOKEN_STORAGE_KEYS
      .map(key => localStorage.getItem(key))
      .find((value): value is string => !!value)
    if (!token) return

    fetch(`${config.apiBaseUrl}/api/user/transactions`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data?.success && Array.isArray(data.transactions)) {
          setTransactions(data.transactions)
        }
      })
      .catch(err => console.error('Failed to load transactions:', err))
  }, [tab, config.apiBaseUrl])

  const quickAmounts = [50, 100, 500, 1000]

  const handleDeposit = async () => {
    const depositAmount = parseFloat(amount)
    if (isNaN(depositAmount) || depositAmount < 10) {
      setStatus({ type: 'error', message: 'Minimum deposit is KSH 10' })
      return
    }

    if (!registeredPhone) {
      setStatus({ type: 'error', message: 'No registered M-Pesa number found on your account' })
      return
    }

    setIsProcessing(true)
    setStatus({ type: 'info', message: 'Initiating M-Pesa payment...' })

    try {
      // Get JWT token from localStorage (support legacy and current key names)
      const token = TOKEN_STORAGE_KEYS
        .map(key => localStorage.getItem(key))
        .find((value): value is string => !!value)
      if (!token) {
        setStatus({ type: 'error', message: 'Please login to deposit' })
        setIsProcessing(false)
        return
      }

      // Call backend Payd STK Push API
      const response = await fetch(`${config.apiBaseUrl}/api/deposit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount: depositAmount,
          phone: registeredPhone,
        }),
      })

      if (response.status === 401) {
        throw new Error('Session expired. Please login again.')
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.error || 'STK Push failed')
      }

      const data = await response.json()

      if (data.success) {
        setStatus({
          type: 'info',
          message: 'STK Push sent. Complete payment on your phone. Balance updates only after confirmed payment.'
        })
        setIsProcessing(false)
      } else {
        throw new Error(data.error || 'STK Push failed')
      }
    } catch (error) {
      console.error('Deposit error:', error)
      setStatus({ 
        type: 'error', 
        message: error instanceof Error ? error.message : 'Payment failed. Please try again.' 
      })
      setIsProcessing(false)
    }
  }

  const handleWithdraw = async () => {
    const withdrawAmt = parseFloat(withdrawAmount)
    if (isNaN(withdrawAmt) || withdrawAmt < 50) {
      setStatus({ type: 'error', message: 'Minimum withdrawal is KSH 50' })
      return
    }

    if (withdrawAmt > balance) {
      setStatus({ type: 'error', message: 'Insufficient account balance' })
      return
    }

    const phoneToUse = withdrawPhone || userPhone
    if (!phoneToUse) {
      setStatus({ type: 'error', message: 'Please enter a valid M-Pesa phone number' })
      return
    }

    setIsWithdrawing(true)
    setStatus({ type: 'info', message: 'Submitting withdrawal request...' })

    try {
      const token = TOKEN_STORAGE_KEYS
        .map(key => localStorage.getItem(key))
        .find((value): value is string => !!value)
      if (!token) {
        setStatus({ type: 'error', message: 'Please login to withdraw' })
        setIsWithdrawing(false)
        return
      }

      const response = await fetch(`${config.apiBaseUrl}/api/withdraw`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: withdrawAmt,
          phone: phoneToUse
        })
      })

      const data = await response.json().catch(() => null)
      if (response.ok && data?.success) {
        setStatus({
          type: 'success',
          message: data.message || `Withdrawal request of KSH ${withdrawAmt} submitted.`
        })
        setWithdrawAmount('')
        onDeposit(-withdrawAmt)
      } else {
        setStatus({
          type: 'error',
          message: data?.error || 'Withdrawal request failed'
        })
      }
    } catch {
      setStatus({ type: 'error', message: 'Network error. Please try again.' })
    } finally {
      setIsWithdrawing(false)
    }
  }

  const statusStyle = {
    success: 'border-brand/30 bg-brand/10 text-brand',
    error: 'border-loss/30 bg-loss/10 text-loss',
    info: 'border-line-strong bg-field text-ink-2',
  } as const

  return (
    <Modal title="My wallet" onClose={onClose}>
      {/* Balances */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md border border-line bg-field p-3">
          <p className="text-xs text-ink-3">Balance</p>
          <p className="mt-1 truncate text-lg font-semibold tabular-nums text-ink">
            <span className="mr-1 text-sm font-medium text-ink-2">KSH</span>
            {balance.toFixed(2)}
          </p>
        </div>
        <div className="rounded-md border border-line bg-field p-3">
          <div className="flex items-center justify-between gap-1">
            <p className="text-xs text-ink-3">Freebet</p>
            <span className={`flex items-center gap-1 text-xs font-medium ${freebetLocked ? 'text-ink-3' : 'text-brand'}`}>
              {freebetLocked ? <Lock className="size-3" aria-hidden="true" /> : <Check className="size-3" aria-hidden="true" />}
              {freebetLocked ? 'Locked' : 'Unlocked'}
            </span>
          </div>
          <p className={`mt-1 truncate text-lg font-semibold tabular-nums ${freebetLocked ? 'text-ink-3' : 'text-bonus'}`}>
            <span className="mr-1 text-sm font-medium text-ink-2">KSH</span>
            {freebet.toFixed(2)}
          </p>
        </div>
      </div>
      {freebetLocked && (
        <p className="mt-2 text-sm text-ink-3">Deposit KSH 20 or more and place a bet to unlock your freebet.</p>
      )}

      {/* Tabs */}
      <div role="tablist" aria-label="Wallet" className="mt-4 flex rounded-md bg-field p-0.5">
        {(['deposit', 'withdraw', 'transactions'] as WalletTab[]).map(t => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`h-10 flex-1 rounded text-sm font-medium capitalize transition-colors ${
              tab === t ? 'bg-raised text-ink' : 'text-ink-3 hover:text-ink-2'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {status && (
        <div
          role={status.type === 'error' ? 'alert' : 'status'}
          className={`mt-4 rounded-md border px-3 py-2.5 text-sm ${statusStyle[status.type]}`}
        >
          {status.message}
        </div>
      )}

      {tab === 'deposit' && (
        <div className="mt-4">
          <label htmlFor="deposit-amount" className="mb-1.5 block text-sm font-medium text-ink-2">
            Amount (KSH)
          </label>
          <input
            id="deposit-amount"
            type="number"
            inputMode="numeric"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="Minimum 10"
            min={10}
            className="h-12 w-full rounded-md border border-line bg-field px-3 text-lg font-semibold tabular-nums text-ink placeholder:text-base placeholder:font-normal placeholder:text-ink-3 focus-visible:border-brand focus-visible:outline-none disabled:opacity-60"
            disabled={isProcessing}
          />

          <div className="mt-2 grid grid-cols-4 gap-2">
            {quickAmounts.map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setAmount(String(v))}
                disabled={isProcessing}
                className="h-11 rounded-md border border-line bg-field text-sm font-semibold tabular-nums text-ink-2 hover:bg-raised hover:text-ink disabled:opacity-50"
              >
                {v}
              </button>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between rounded-md border border-line bg-field px-3 py-2.5 text-xs">
            <span className="text-ink-3">Sending M-Pesa prompt to:</span>
            <span className="font-semibold text-ink tabular-nums">0{registeredPhone || userPhone || '—'}</span>
          </div>
          <p className="mt-1 text-[11px] text-ink-3">Payment request is sent automatically to your registered account phone.</p>

          <button
            type="button"
            onClick={handleDeposit}
            disabled={isProcessing || !amount || !registeredPhone}
            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-md bg-brand text-base font-semibold text-brand-ink transition-colors hover:bg-brand-hover active:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Processing...
              </>
            ) : (
              'Deposit with M-Pesa'
            )}
          </button>
        </div>
      )}

      {tab === 'withdraw' && (
        <div className="mt-4">
          <label htmlFor="withdraw-phone" className="mb-1.5 block text-sm font-medium text-ink-2">
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
            className="h-12 w-full rounded-md border border-line bg-field px-3 text-lg font-semibold tabular-nums text-ink placeholder:text-base placeholder:font-normal placeholder:text-ink-3 focus-visible:border-brand focus-visible:outline-none disabled:opacity-60"
          />

          <label htmlFor="withdraw-amount" className="mb-1.5 mt-4 block text-sm font-medium text-ink-2">
            Amount (KSH)
          </label>
          <input
            id="withdraw-amount"
            type="number"
            inputMode="numeric"
            value={withdrawAmount}
            onChange={e => setWithdrawAmount(e.target.value)}
            placeholder="Minimum 50"
            min={50}
            disabled={isWithdrawing}
            className="h-12 w-full rounded-md border border-line bg-field px-3 text-lg font-semibold tabular-nums text-ink placeholder:text-base placeholder:font-normal placeholder:text-ink-3 focus-visible:border-brand focus-visible:outline-none disabled:opacity-60"
          />
          <p className="mt-2 text-sm text-ink-3">Minimum withdrawal is KSH 50. Processing to your M-Pesa account.</p>

          <button
            type="button"
            onClick={handleWithdraw}
            disabled={isWithdrawing || !withdrawAmount || !withdrawPhone}
            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-md bg-brand text-base font-semibold text-brand-ink transition-colors hover:bg-brand-hover active:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isWithdrawing ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Processing withdrawal...
              </>
            ) : (
              'Withdraw to M-Pesa'
            )}
          </button>
        </div>
      )}

      {tab === 'transactions' && (
        <div className="mt-4">
          {transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Receipt className="mb-2 size-8 text-ink-3" aria-hidden="true" />
              <p className="text-sm font-medium text-ink-2">No transactions yet</p>
              <p className="mt-1 text-sm text-ink-3">Deposits and withdrawals will show up here.</p>
            </div>
          ) : (
            <ul className="divide-y divide-line rounded-md border border-line">
              {transactions.map(tx => (
                <li key={tx.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{tx.type}</p>
                    <p className="text-xs text-ink-3">{tx.date}</p>
                  </div>
                  <p className={`shrink-0 text-sm font-semibold tabular-nums ${tx.type === 'Deposit' ? 'text-brand' : 'text-loss'}`}>
                    {tx.type === 'Deposit' ? '+' : '-'}KSH {tx.amount.toFixed(2)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  )
}
