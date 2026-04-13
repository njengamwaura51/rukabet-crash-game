import { useState } from 'react'

interface AuthModalProps {
  mode: 'login' | 'register'
  onClose: () => void
  onLogin: (phone: string, password: string) => Promise<{ success: boolean; error?: string }>
  onRegister: (phone: string, password: string, username: string) => Promise<{ success: boolean; error?: string }>
  onSwitchMode: () => void
}

// Safaricom prefixes in 9-digit format (without country code or leading zero):
// 7xx... (70,71,72,74,75,76,79) and 11x... (110-115)
const SAFARICOM_REGEX = /^(7[01245679]\d{7}|11[0-5]\d{6})$/

function normalizePhoneInput(phone: string): string {
  let cleaned = phone.replace(/\D/g, '')

  // Gracefully accept pasted 254... / 0... inputs, but store as 9 digits
  if (cleaned.startsWith('254') && cleaned.length > 9) {
    cleaned = cleaned.slice(3)
  }
  if (cleaned.startsWith('0') && cleaned.length > 9) {
    cleaned = cleaned.slice(1)
  }

  return cleaned.slice(0, 9)
}

function validateSafaricomNumber(phone: string): { valid: boolean; normalized: string; isComplete: boolean; error?: string } {
  const normalized = normalizePhoneInput(phone)
  const isComplete = normalized.length === 9

  if (!isComplete) {
    return { valid: false, normalized, isComplete: false }
  }

  if (!SAFARICOM_REGEX.test(normalized)) {
    return {
      valid: false,
      normalized,
      isComplete: true,
      error: 'Only Safaricom numbers are allowed'
    }
  }

  return { valid: true, normalized, isComplete: true }
}

// Generate auto username from phone: User_XXXXX or anonymized number
function generateUsername(phone: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let suffix = ''
  for (let i = 0; i < 5; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return `User_${suffix}`
}

export function AuthModal({ mode, onClose, onLogin, onRegister, onSwitchMode }: AuthModalProps) {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const validation = validateSafaricomNumber(phone)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!validation.isComplete) {
      setError('Enter your 9-digit phone number')
      return
    }

    // Validate Safaricom number (checked only after full input)
    if (!validation.valid) {
      setError(validation.error || 'Invalid phone number')
      return
    }

    const normalizedPhone = validation.normalized

    if (mode === 'register') {
      if (password !== confirmPassword) {
        setError('Passwords do not match')
        return
      }
      if (password.length < 4) {
        setError('Password must be at least 4 characters')
        return
      }
    }

    setIsLoading(true)
    try {
      let result
      if (mode === 'login') {
        result = await onLogin(normalizedPhone, password)
      } else {
        const autoUsername = generateUsername(normalizedPhone)
        result = await onRegister(normalizedPhone, password, autoUsername)
      }

      if (result.success) {
        onClose()
      } else {
        setError(result.error || 'An error occurred')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[#1a1d24] rounded-2xl border border-white/10 w-full max-w-xs mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header - compact */}
        <div className="relative px-4 py-3 border-b border-white/10 text-center">
          {/* Logo */}
          <div className="flex justify-center mb-2">
            <img src="/logo.png" alt="RukaBet" className="h-10 w-auto" />
          </div>
          <h2 className="text-white font-bold text-sm">
            {mode === 'login' ? 'Welcome Back!' : 'Create Account'}
          </h2>
          <p className="text-white/50 text-[10px] mt-0.5">
            {mode === 'login' ? 'Login to continue' : 'Get KSH 150 freebet bonus!'}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="absolute top-2 right-2 text-white/40 hover:text-white transition-colors p-1"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        {/* Form - compact */}
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          {/* Phone input - Safaricom only */}
          <div>
            <label className="block text-white/60 text-[10px] font-medium mb-1">
              Phone Number
            </label>
            <input
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={e => {
                setPhone(normalizePhoneInput(e.target.value))
              }}
              placeholder="712345678"
              maxLength={9}
              className="w-full bg-[#0f1318] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#00C74D] transition-all placeholder-white/30"
              required
            />
            {mode === 'register' && validation.isComplete && !validation.valid && (
              <p className="text-[#00E65A] text-[10px] mt-1 font-medium">
                Only Safaricom numbers are supported
              </p>
            )}
          </div>

          {/* Password input */}
          <div>
            <label className="block text-white/60 text-[10px] font-medium mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full bg-[#0f1318] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#00C74D] transition-all placeholder-white/30"
              required
              minLength={4}
            />
          </div>

          {/* Confirm password (register only) */}
          {mode === 'register' && (
            <div>
              <label className="block text-white/60 text-[10px] font-medium mb-1">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                className="w-full bg-[#0f1318] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#00C74D] transition-all placeholder-white/30"
                required
                minLength={4}
              />
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="bg-[#00C74D]/10 border border-[#00C74D]/30 rounded-lg px-3 py-2 text-[#00E65A] text-[11px] text-center">
              {error}
            </div>
          )}

          {/* Submit button - brand green */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-[#00C74D] rounded-lg text-black font-bold text-sm tracking-wide hover:bg-[#00a83d] transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                </svg>
                Processing...
              </span>
            ) : (
              mode === 'login' ? 'LOGIN' : 'CREATE ACCOUNT'
            )}
          </button>

          {/* Register bonus info */}
          {mode === 'register' && (
            <div className="bg-[#00C74D]/10 border border-[#00C74D]/30 rounded-lg px-3 py-2 text-center">
              <span className="text-[#00C74D] text-[11px] font-bold">🎁 KSH 150 Freebet Bonus!</span>
              <p className="text-white/50 text-[10px] mt-0.5">Deposit KSH 20 & bet to unlock</p>
            </div>
          )}

          {/* Switch mode */}
          <div className="text-center pt-1">
            <span className="text-white/50 text-[11px]">
              {mode === 'login' ? "Don't have an account? " : "Already have an account? "}
            </span>
            <button
              type="button"
              onClick={onSwitchMode}
              className="text-[#00C74D] text-[11px] font-bold hover:underline"
            >
              {mode === 'login' ? 'Register' : 'Login'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
