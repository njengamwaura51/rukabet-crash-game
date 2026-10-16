import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Modal } from './Modal'
import { useConfig } from '@/hooks/useConfig'

interface AuthModalProps {
  mode: 'login' | 'register'
  onClose: () => void
  onLogin: (phone: string, password: string) => Promise<{ success: boolean; error?: string }>
  onRegister: (phone: string, password: string, username: string) => Promise<{ success: boolean; error?: string }>
  onSwitchMode: () => void
}

// Safaricom ranges in local 0-prefixed form: 07[0,1,2,4,5,6,9]x xxx xxx and 011[0-5]x xxx xx
const SAFARICOM_REGEX = /^0(7[01245679]\d{7}|11[0-5]\d{6})$/
const COUNTRY_CODE = '+254'
const MIN_PASSWORD_LENGTH = 4

function normalizePhoneInput(phone: string): string {
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('254')) {
    digits = '0' + digits.slice(3)
  }
  if (digits.length > 0 && !digits.startsWith('0')) {
    digits = '0' + digits
  }
  return digits.slice(0, 10)
}

interface PhoneValidation {
  valid: boolean
  normalized: string
  isComplete: boolean
  error?: string
}

function validateSafaricomNumber(phone: string): PhoneValidation {
  const normalized = normalizePhoneInput(phone)
  const isComplete = normalized.length === 10

  if (!isComplete) {
    return { valid: false, normalized, isComplete }
  }

  if (!SAFARICOM_REGEX.test(normalized)) {
    return { valid: false, normalized, isComplete, error: 'Safaricom numbers only' }
  }

  return { valid: true, normalized, isComplete }
}

function generateUsername(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let suffix = ''
  for (let i = 0; i < 5; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return `User_${suffix}`
}

function EyeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
      aria-hidden="true"
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
      aria-hidden="true"
    >
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <path d="M2 2l20 20" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3"
      aria-hidden="true"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-4 animate-spin" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={2.5} strokeOpacity={0.25} />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
    </svg>
  )
}

export function AuthModal({ mode, onClose, onLogin, onRegister, onSwitchMode }: AuthModalProps) {
  const { config } = useConfig()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isLogin = mode === 'login'
  const validation = validateSafaricomNumber(phone)
  const phoneInvalid = validation.isComplete && !validation.valid

  const handlePhoneChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    if (value.replace(/\D/g, '').length <= 12) {
      setPhone(value)
    }
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)

    if (!phone) {
      setError('Enter your phone number')
      return
    }

    if (!validation.valid) {
      setError(validation.error ?? 'Enter a valid Safaricom number')
      return
    }

    if (!password) {
      setError('Enter your password')
      return
    }

    if (!isLogin && password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
      return
    }

    setLoading(true)

    try {
      const result = isLogin
        ? await onLogin(validation.normalized, password)
        : await onRegister(validation.normalized, password, generateUsername())

      if (result.success) {
        onClose()
      } else {
        setError(result.error ?? (isLogin ? 'Login failed' : 'Registration failed'))
      }
    } catch {
      setError('Request failed. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      title={isLogin ? 'Sign In' : 'Sign Up'}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-3.5">
        {/* Phone */}
        <div>
          <label htmlFor="auth-phone" className="block text-xs font-medium text-ink-2">
            Phone Number
          </label>
          <div
            className={`mt-1 flex h-11 overflow-hidden rounded-md border bg-field ${
              phoneInvalid ? 'border-loss' : 'border-line focus-within:border-brand'
            }`}
          >
            <span className="flex select-none items-center border-r border-line px-3 text-sm font-medium tabular-nums text-ink-2">
              {COUNTRY_CODE}
            </span>
            <input
              id="auth-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              autoFocus
              placeholder="712345678"
              value={phone}
              onChange={handlePhoneChange}
              aria-invalid={phoneInvalid || undefined}
              className="min-w-0 flex-1 bg-transparent px-3 text-sm font-medium tabular-nums text-ink placeholder:text-ink-3 focus:outline-none"
            />
            {validation.valid && (
              <span className="mr-2 flex items-center gap-1 self-center rounded px-1.5 py-0.5 text-[11px] font-semibold bg-brand/10 text-brand">
                <CheckIcon />
              </span>
            )}
          </div>
        </div>

        {/* Password */}
        <div>
          <label htmlFor="auth-password" className="block text-xs font-medium text-ink-2">
            Password
          </label>
          <div className="relative mt-1">
            <input
              id="auth-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 w-full rounded-md border border-line bg-field pl-3 pr-11 text-sm font-medium text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-ink-3 transition-colors hover:text-ink focus:outline-none focus-visible:text-ink"
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <p role="alert" className="rounded-md border border-loss/30 bg-loss/10 px-3 py-2 text-xs font-medium text-loss">
            {error}
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || phoneInvalid}
          className="flex h-11 w-full items-center justify-center rounded-md bg-brand text-sm font-bold text-brand-ink transition-colors hover:bg-brand-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-panel disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? <SpinnerIcon /> : isLogin ? 'Sign In' : 'Create Account'}
        </button>

        {/* Freebet note */}
        {!isLogin && (
          <div className="flex items-center justify-between rounded-md border border-line bg-field px-3 py-2 text-xs">
            <span className="font-semibold text-bonus">
              KSH <span className="tabular-nums">{config.initialFreebet ?? 150}</span> Freebet
            </span>
            <span className="text-ink-3">
              Unlocks with KSH <span className="tabular-nums">{config.freebetUnlockAmount ?? 50}</span>+ deposit
            </span>
          </div>
        )}

        {/* Switch mode */}
        <p className="border-t border-line pt-3 text-center text-xs text-ink-3">
          {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button type="button" onClick={onSwitchMode} className="font-semibold text-brand hover:underline">
            {isLogin ? 'Sign Up' : 'Sign In'}
          </button>
        </p>
      </form>
    </Modal>
  )
}
