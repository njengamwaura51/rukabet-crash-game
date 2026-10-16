import { useState, useEffect } from 'react'
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

function readToken(): string | undefined {
  return TOKEN_STORAGE_KEYS
    .map((key) => localStorage.getItem(key))
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

export function DepositModal({
  balance,
  freebet,
  freebetLocked,
  userPhone,
  onClose,
  onDeposit,
}: DepositModalProps) {
  const { config } = useConfig()
  const [tab, setTab] = useState<WalletTab>('deposit')
  const [amount, setAmount] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [withdrawPhone, setWithdrawPhone] = useState(userPhone || '')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [isWithdrawing, setIsWithdrawing] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])

  const registeredPhone = normalizeToNineDigitPhone(userPhone)

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Load real transaction history when the transactions tab opens
  useEffect(() => {
    if (tab !== 'transactions') return
    const token = readToken()
    if (!token) return

    fetch(`${config.apiBaseUrl}/api/user/transactions`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.success && Array.isArray(data.transactions)) {
          setTransactions(data.transactions)
        }
      })
      .catch((err) => console.error('Failed to load transactions:', err))
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
      setStatus({ type: 'error', message: 'No registered M-Pesa phone number found on account' })
      return
    }

    setIsProcessing(true)
    setStatus({ type: 'info', message: 'Sending STK push to your M-Pesa phone...' })

    try {
      const token = readToken()
      if (!token) {
        setStatus({ type: 'error', message: 'Please log in to make a deposit' })
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
        throw new Error('Session expired. Please log in again.')
      }

      const data = await response.json().catch(() => null)
      if (response.ok && data?.success) {
        setStatus({
          type: 'success',
          message: 'STK push sent! Check your phone and enter your M-Pesa PIN.',
        })
      } else {
        throw new Error(data?.error || 'STK push failed. Please try again.')
      }
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Deposit initiation failed. Please try again.',
      })
    } finally {
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
      setStatus({ type: 'error', message: 'Enter a valid M-Pesa phone number' })
      return
    }

    setIsWithdrawing(true)
    setStatus({ type: 'info', message: 'Submitting withdrawal request...' })

    try {
      const token = readToken()
      if (!token) {
        setStatus({ type: 'error', message: 'Please log in to withdraw' })
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
          message: data.message || `Withdrawal of KSH ${withdrawAmt.toFixed(2)} submitted successfully!`,
        })
        setWithdrawAmount('')
        onDeposit(-withdrawAmt)
      } else {
        setStatus({ type: 'error', message: data?.error || 'Withdrawal request failed' })
      }
    } catch {
      setStatus({ type: 'error', message: 'Network error. Please try again.' })
    } finally {
      setIsWithdrawing(false)
    }
  }

  return (
    <div className="wallet-overlay" onClick={onClose}>
      <div className="wallet-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header Bar */}
        <div className="wallet-header">
          <span className="wallet-title">MY WALLET</span>
          <button className="wallet-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <div className="wallet-body">
          {/* Balance & Freebet Cards */}
          <div className="wallet-cards">
            <div className="wallet-card">
              <div className="card-label">BALANCE</div>
              <div className="card-amount">
                KSH <span>{balance.toFixed(2)}</span>
              </div>
            </div>
            <div className="wallet-card">
              <span className="freebet-status">{freebetLocked ? '(locked)' : '(unlocked)'}</span>
              <div className="card-label">FREEBET</div>
              <div className="card-amount">
                KSH <span>{freebet.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Navigation Pill Tabs */}
          <div className="wallet-tabs-wrapper">
            <div className="wallet-tabs">
              <button
                type="button"
                className={`tab-btn ${tab === 'deposit' ? 'active' : ''}`}
                onClick={() => switchTab('deposit')}
              >
                Deposit
              </button>
              <button
                type="button"
                className={`tab-btn ${tab === 'withdraw' ? 'active' : ''}`}
                onClick={() => switchTab('withdraw')}
              >
                Withdraw
              </button>
              <button
                type="button"
                className={`tab-btn ${tab === 'transactions' ? 'active' : ''}`}
                onClick={() => switchTab('transactions')}
              >
                Transactions
              </button>
            </div>
          </div>

          {/* Status Message */}
          {status && (
            <div
              role="alert"
              className={`mb-3 rounded-lg p-2.5 text-xs font-semibold leading-relaxed ${
                status.type === 'error'
                  ? 'border border-[#5c242d] bg-[#3b1219] text-[#ff5c6c]'
                  : status.type === 'success'
                  ? 'border border-[#1b6b3e] bg-[#0e3b22] text-[#00eb5b]'
                  : 'border border-[#384152] bg-[#1a2130] text-[#93c5fd]'
              }`}
            >
              {status.message}
            </div>
          )}

          {/* Deposit Form Section (Compact & non-scrollable) */}
          {tab === 'deposit' && (
            <div className="deposit-section">
              <label className="section-label">Amount to Deposit</label>

              {/* Combined Input + Quick Amounts */}
              <div className="amount-input-group">
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="Enter amount here"
                  className="amount-input"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={isProcessing}
                  min={MIN_DEPOSIT}
                />
                <div className="quick-amounts">
                  <button type="button" className="quick-btn" onClick={() => setAmount('10')} disabled={isProcessing}>
                    10
                  </button>
                  <button type="button" className="quick-btn" onClick={() => setAmount('100')} disabled={isProcessing}>
                    100
                  </button>
                  <button type="button" className="quick-btn" onClick={() => setAmount('1000')} disabled={isProcessing}>
                    1000
                  </button>
                  <button type="button" className="quick-btn" onClick={() => setAmount('5000')} disabled={isProcessing}>
                    5000
                  </button>
                </div>
              </div>

              <button
                type="button"
                className="btn-deposit"
                onClick={handleDeposit}
                disabled={isProcessing || !amount}
              >
                {isProcessing ? 'SENDING STK PUSH...' : 'DEPOSIT'}
              </button>
            </div>
          )}

          {/* Withdraw Form Section */}
          {tab === 'withdraw' && (
            <div className="withdraw-section">
              <label className="section-label">Withdrawal Phone Number</label>
              <input
                type="text"
                placeholder="07XXXXXXXX or 01XXXXXXXX"
                className="verify-input"
                value={withdrawPhone}
                onChange={(e) => setWithdrawPhone(e.target.value)}
                disabled={isWithdrawing}
              />

              <label className="section-label mt-2">Amount to Withdraw (Min KSH 50)</label>
              <input
                type="number"
                placeholder="Enter amount to withdraw"
                className="verify-input"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                disabled={isWithdrawing}
                max={balance}
                min={MIN_WITHDRAW}
              />

              <button
                type="button"
                className="btn-deposit mt-2"
                onClick={handleWithdraw}
                disabled={isWithdrawing || !withdrawAmount}
              >
                {isWithdrawing ? 'PROCESSING WITHDRAWAL...' : 'WITHDRAW'}
              </button>
            </div>
          )}

          {/* Transactions Section */}
          {tab === 'transactions' && (
            <div className="transactions-section max-h-56 overflow-y-auto space-y-1.5">
              {transactions.length === 0 ? (
                <p className="text-center text-xs text-[#8c939e] py-6">No recent transactions found.</p>
              ) : (
                transactions.map((tx) => (
                  <div
                    key={tx.id || `${tx.type}-${tx.date}`}
                    className="flex items-center justify-between p-2 rounded-lg bg-[#282a2e] text-xs"
                  >
                    <div>
                      <span className="font-bold text-white uppercase">{tx.type}</span>
                      <p className="text-[10px] text-[#8c939e]">{tx.date}</p>
                    </div>
                    <div className="text-right">
                      <span className="font-semibold text-[#00eb5b]">KSH {tx.amount.toFixed(2)}</span>
                      <p className="text-[10px] text-[#8c939e] capitalize">{tx.status}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Footer directly below deposit button */}
          <div className="wallet-footer">
            <span>Powered By</span>
            <div className="mpesa-logo">
              <span className="m-green">M</span>
              <span className="m-phone">📱</span>
              <span className="m-green">PESA</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
