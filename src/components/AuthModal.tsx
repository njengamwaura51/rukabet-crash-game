import { useState } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { Modal } from './Modal'

interface AuthModalProps {
  mode: 'login' | 'register'
  onClose: () => void
  onLogin: (phone: string, password: string) => Promise<{ success: boolean; error?: string }>
  onRegister: (phone: string, password: string, username: string) => Promise<{ success: boolean; error?: string }>
  onSwitchMode: () => void
}

// Safaricom prefixes in 9-digit format (without country code or leading zero):
// 7xx... (70,71,72,74,75,76,79) and 11x... (110-115)
const SAFARICOM_REGEX = /^0(7[01245679]\d{7}|11[0-5]\d{6})$/

function normalizePhoneInput(phone: string): string {
  let cleaned = phone.replace(/\D/g, '')
  if (cleaned.startsWith('254')) {
    cleaned = '0' + cleaned.slice(3)
  }
  if (cleaned.length > 0 && !cleaned.startsWith('0')) {
    cleaned = '0' + cleaned
  }
  return cleaned.slice(0, 10)
}

function validateSafaricomNumber(phone: string): { valid: boolean; normalized: string; isComplete: boolean; error?: string } {
  const normalized = normalizePhoneInput(phone)
  const isComplete = normalized.length === 10

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
  const [showPassword, setShowPassword] = useState(false)
  const validation = validateSafaricomNumber(phone)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!validation.isComplete) {
      setError('Enter your 10-digit phone number')
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

  const isLogin = mode === 'login'

  return (
    <Modal
      title={isLogin ? 'Welcome back' : 'Create account'}
      description={isLogin ? 'Log in to continue' : 'Get a KSH 150 freebet bonus'}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="auth-phone" className="mb-1.5 block text-sm font-medium text-ink-2">
            Phone number
          </label>
          <input
            id="auth-phone"
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            value={phone}
            onChange={e => setPhone(normalizePhoneInput(e.target.value))}
            placeholder="0712345678"
            maxLength={10}
            className="h-12 w-full rounded-md border border-line bg-field px-3 text-base text-ink placeholder:text-ink-3 focus-visible:border-brand focus-visible:outline-none"
            required
          />
          {mode === 'register' && validation.isComplete && !validation.valid && (
            <p className="mt-1.5 text-sm text-loss">Only Safaricom numbers are supported</p>
          )}
        </div>

        <div>
          <label htmlFor="auth-password" className="mb-1.5 block text-sm font-medium text-ink-2">
            Password
          </label>
          <div className="relative">
            <input
              id="auth-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password"
              className="h-12 w-full rounded-md border border-line bg-field px-3 text-base text-ink placeholder:text-ink-3 focus-visible:border-brand focus-visible:outline-none pr-12"
              required
              minLength={4}
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-1 top-1 flex size-10 items-center justify-center rounded-md text-ink-3 hover:text-ink"
            >
              {showPassword ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
            </button>
          </div>
        </div>

        {mode === 'register' && (
          <div>
            <label htmlFor="auth-confirm" className="mb-1.5 block text-sm font-medium text-ink-2">
              Confirm password
            </label>
            <input
              id="auth-confirm"
              name="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
              className="h-12 w-full rounded-md border border-line bg-field px-3 text-base text-ink placeholder:text-ink-3 focus-visible:border-brand focus-visible:outline-none"
              required
              minLength={4}
            />
          </div>
        )}

        {error && (
          <div role="alert" className="rounded-md border border-loss/30 bg-loss/10 px-3 py-2.5 text-sm text-loss">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-brand text-base font-semibold text-brand-ink transition-colors hover:bg-brand-hover active:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Processing...
            </>
          ) : (
            isLogin ? 'Log in' : 'Create account'
          )}
        </button>

        {mode === 'register' && (
          <div className="rounded-md border border-bonus/30 bg-bonus/10 px-3 py-2.5">
            <p className="text-sm font-semibold text-bonus">KSH 150 freebet bonus</p>
            <p className="mt-0.5 text-sm text-ink-2">Deposit KSH 20 and place a bet to unlock it.</p>
          </div>
        )}

        <p className="pt-1 text-center text-sm text-ink-2">
          {isLogin ? "Don't have an account? " : 'Already have an account? '}
          <button type="button" onClick={onSwitchMode} className="font-semibold text-brand hover:underline">
            {isLogin ? 'Register' : 'Log in'}
          </button>
        </p>
      </form>
    </Modal>
  )
}
