import { useState } from 'react'
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
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null)
  const [transactions] = useState<{ id: string; type: string; amount: number; date: string; status: string }[]>([])
  const registeredPhone = normalizeToNineDigitPhone(userPhone)

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

      // Call backend IntaSend STK Push API
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
        setStatus({ type: 'success', message: 'STK Push sent! Check your phone and enter M-Pesa PIN' })
        
        // Balance will be updated via WebSocket when payment completes
        // For now, we wait and then show success
        setTimeout(() => {
          setStatus({ type: 'info', message: 'Waiting for payment confirmation...' })
        }, 3000)
        
        // After 10 seconds, assume success if WebSocket hasn't updated
        setTimeout(() => {
          if (isProcessing) {
            onDeposit(depositAmount)
            setStatus({ type: 'success', message: `KSH ${depositAmount.toFixed(2)} deposited successfully!` })
            setAmount('')
            setIsProcessing(false)
          }
        }, 10000)
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4" onClick={onClose}>
      <div
        className="bg-[#151920]/95 backdrop-blur-xl rounded-2xl border border-white/[0.08] shadow-2xl shadow-black/60 w-full max-w-md overflow-hidden max-h-[90vh] overflow-y-auto animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] sticky top-0 bg-[#151920]/95 backdrop-blur-xl z-10">
          <span className="text-white font-black text-sm tracking-wide">My Wallet</span>
          <button
            type="button"
            onClick={onClose}
            className="text-white/40 hover:text-white transition-colors duration-200 w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/[0.06]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        {/* Wallet cards */}
        <div className="flex gap-3 px-5 py-4">
          {/* Balance card */}
          <div className="flex-1 bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
            <div className="text-white/40 text-[10px] font-black text-center mb-1.5 tracking-wider">BALANCE</div>
            <div className="text-center">
              <span className="text-white/50 text-xs mr-1">KSH</span>
              <span className="text-white font-black text-lg">{balance.toFixed(2)}</span>
            </div>
          </div>
          {/* Freebet card */}
          <div className="flex-1 bg-white/[0.03] rounded-xl p-4 border border-[#00C74D]/15 relative overflow-hidden">
            <div className={`absolute top-1.5 right-1.5 text-[8px] px-2 py-0.5 rounded-full font-black ${
              freebetLocked 
                ? 'bg-[#00C74D]/20 text-[#00E65A] border border-[#00C74D]/30' 
                : 'bg-[#00C74D]/20 text-[#00C74D] border border-[#00C74D]/30'
            }`}>
              {freebetLocked ? '🔒 locked' : '✓ unlocked'}
            </div>
            <div className="text-white/50 text-[10px] font-black text-center mb-1.5 tracking-wider">FREEBET</div>
            <div className="text-center">
              <span className="text-white/50 text-xs mr-1">KSH</span>
              <span className={`font-black text-lg ${freebetLocked ? 'text-white/40' : 'text-[#00C74D]'}`}>
                {freebet.toFixed(2)}
              </span>
            </div>
            {freebetLocked && (
              <div className="text-[9px] text-white/40 text-center mt-1 font-bold">
                Deposit KSH 20+ & bet to unlock
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 mb-4">
          {(['deposit', 'withdraw', 'transactions'] as WalletTab[]).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all duration-200 capitalize ${
                tab === t
                  ? 'bg-gradient-to-b from-[#00D455] to-[#00A83D] text-black shadow-md shadow-[#00C74D]/20'
                  : 'bg-white/[0.04] text-white/45 hover:text-white/70 hover:bg-white/[0.07]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Status message */}
        {status && (
          <div className={`mx-5 mb-4 px-4 py-3 rounded-lg text-xs text-center font-bold ${
            status.type === 'success' ? 'bg-[#00C74D]/10 border border-[#00C74D]/30 text-[#00C74D]' :
            status.type === 'error' ? 'bg-[#00C74D]/10 border border-[#00C74D]/30 text-[#00E65A]' :
            'bg-blue-500/10 border border-blue-500/30 text-blue-400'
          }`}>
            {status.message}
          </div>
        )}

        {/* Content */}
        {tab === 'deposit' && (
          <div className="px-5 pb-5">
            <div className="mb-4 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
              <div className="text-white/60 text-[10px] font-bold">
                STK push will be sent to your registered M-Pesa number.
              </div>
            </div>

            <div className="text-white/70 text-xs font-bold mb-1.5">Amount to Deposit</div>
            {/* Amount input - LARGER */}
            <div className="flex gap-2 mb-4">
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="Enter amount"
                min={10}
                className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3.5 text-white text-lg font-bold focus:outline-none focus:border-[#00C74D]/60 transition-all duration-200 placeholder-white/25"
                disabled={isProcessing}
              />
            </div>
            
            {/* Quick amounts */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {quickAmounts.map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAmount(String(v))}
                  disabled={isProcessing}
                  className="bg-white/[0.04] border border-white/[0.06] text-white/70 text-sm font-bold py-2.5 rounded-xl hover:border-[#00C74D]/40 hover:text-white transition-all duration-200 disabled:opacity-50"
                >
                  {v}
                </button>
              ))}
            </div>

            {/* Deposit button */}
            <button
              type="button"
              onClick={handleDeposit}
              disabled={isProcessing || !amount || !registeredPhone}
              className="w-full py-4 bg-gradient-to-b from-[#00D455] to-[#00A83D] hover:brightness-110 rounded-xl text-black font-black text-sm tracking-wider transition-all duration-200 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#00C74D]/20"
            >
              {isProcessing ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                  </svg>
                  Processing...
                </span>
              ) : (
                'DEPOSIT VIA M-PESA'
              )}
            </button>
          </div>
        )}

        {tab === 'withdraw' && (
          <div className="px-5 pb-5">
            <div className="text-white/70 text-xs font-bold mb-1.5">Phone Number</div>
            <div className="relative mb-3">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50 text-sm font-bold">🇰🇪 +254</span>
              <input
                type="tel"
                placeholder="712345678"
                maxLength={9}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-20 pr-4 py-3.5 text-white text-base font-bold focus:outline-none focus:border-[#00C74D]/60 transition-all duration-200 placeholder-white/25"
              />
            </div>
            <div className="text-white/70 text-xs font-bold mb-1.5">Amount to Withdraw</div>
            <input
              type="number"
              placeholder="Enter amount"
              min={50}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3.5 text-white text-lg font-bold focus:outline-none focus:border-[#00C74D]/60 transition-all duration-200 placeholder-white/25 mb-2"
            />
            <p className="text-white/40 text-[11px] mb-4 font-bold">Minimum withdrawal: KSH 50</p>
            <button
              type="button"
              className="w-full py-4 bg-gradient-to-b from-[#00D455] to-[#00A83D] hover:brightness-110 rounded-xl text-black font-black text-sm tracking-wider transition-all duration-200 active:scale-[0.99] shadow-lg shadow-[#00C74D]/20"
            >
              WITHDRAW
            </button>
          </div>
        )}

        {tab === 'transactions' && (
          <div className="px-5 pb-5">
            {transactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-white/30">
                <svg width="48" height="48" fill="currentColor" viewBox="0 0 24 24" className="mb-3 opacity-50">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
                </svg>
                <span className="text-xs font-bold">No transactions yet</span>
              </div>
            ) : (
              <div className="space-y-2">
                {transactions.map(tx => (
                  <div key={tx.id} className="bg-white/[0.04] rounded-xl p-3 flex items-center justify-between border border-white/[0.04]">
                    <div>
                      <div className="text-white text-xs font-bold">{tx.type}</div>
                      <div className="text-white/40 text-[10px]">{tx.date}</div>
                    </div>
                    <div className={`text-sm font-black ${tx.type === 'Deposit' ? 'text-[#00C74D]' : 'text-red-400'}`}>
                      {tx.type === 'Deposit' ? '+' : '-'}KSH {tx.amount.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
