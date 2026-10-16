import { useState, useEffect, type ReactNode } from 'react'
import { Link } from 'wouter'
import { Check, ChevronLeft, Copy, Gift, KeyRound, Link2, MessageCircle, Ticket } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

/** Shared frame for the account pages: back link, title, single column. */
function PageShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-page px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-ink sm:px-6">
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex items-center gap-2">
          <Link
            to="/"
            className="-ml-2 flex size-10 shrink-0 items-center justify-center rounded-md text-ink-2 hover:bg-field hover:text-ink"
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
            <span className="sr-only">Back to game</span>
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold leading-tight">{title}</h1>
            <p className="text-sm text-ink-2">{subtitle}</p>
          </div>
        </div>
        <div className="space-y-3">{children}</div>
        <p className="mt-8 text-center text-xs text-ink-3">RukaBet v1.0 · Provably fair</p>
      </div>
    </div>
  )
}

const CARD = 'rounded-lg border border-line bg-panel p-4'

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete: string
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-2">
        {label}
      </label>
      <input
        id={id}
        type="password"
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 w-full rounded-md border border-line bg-field px-3 text-base text-ink placeholder:text-ink-3 focus-visible:border-brand focus-visible:outline-none"
      />
    </div>
  )
}

export function ProfilePage() {
  const { user } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    if (!currentPassword) {
      setMessage({ type: 'error', text: 'Please enter your current password' })
      return
    }

    if (newPassword.length < 4) {
      setMessage({ type: 'error', text: 'New password must be at least 4 characters' })
      return
    }
    
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match' })
      return
    }

    const token = localStorage.getItem('rukabet_token') || localStorage.getItem('token') || localStorage.getItem('aspirebet_token')
    if (!token) {
      setMessage({ type: 'error', text: 'You must be logged in to change your password' })
      return
    }

    setIsUpdating(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ currentPassword, newPassword })
      })

      const data = await res.json().catch(() => null)
      if (res.ok && data?.success) {
        setMessage({ type: 'success', text: 'Password updated successfully!' })
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } else {
        setMessage({ type: 'error', text: data?.error || 'Failed to update password' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error. Please try again.' })
    } finally {
      setIsUpdating(false)
    }
  }

  const rows: [string, string, string?][] = [
    ['Username', user?.username || '—'],
    ['Phone number', user?.phone || '—'],
    ['Balance', `KSH ${(user?.balance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 'text-brand'],
    ['Freebet balance', `KSH ${(user?.freebet ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 'text-bonus'],
  ]

  return (
    <PageShell title="My profile" subtitle="Manage your account">
      <section className={CARD}>
        <div className="mb-3 flex items-center gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand text-lg font-semibold text-brand-ink">
            {user?.username?.charAt(0).toUpperCase() || 'U'}
          </div>
          <h2 className="truncate text-base font-semibold">{user?.username || 'User'}</h2>
        </div>
        <dl className="divide-y divide-line">
          {rows.map(([label, value, color]) => (
            <div key={label} className="flex items-center justify-between gap-3 py-3">
              <dt className="text-sm text-ink-2">{label}</dt>
              <dd className={`truncate text-sm font-semibold tabular-nums ${color ?? 'text-ink'}`}>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={CARD}>
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
          <KeyRound className="size-4 text-ink-2" aria-hidden="true" />
          Change password
        </h2>

        {message && (
          <div
            role={message.type === 'error' ? 'alert' : 'status'}
            className={`mb-4 rounded-md border px-3 py-2.5 text-sm ${
              message.type === 'success'
                ? 'border-brand/30 bg-brand/10 text-brand'
                : 'border-loss/30 bg-loss/10 text-loss'
            }`}
          >
            {message.text}
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-4">
          <PasswordField
            id="current-password"
            label="Current password"
            value={currentPassword}
            onChange={setCurrentPassword}
            autoComplete="current-password"
          />
          <PasswordField
            id="new-password"
            label="New password"
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
          />
          <PasswordField
            id="confirm-password"
            label="Confirm new password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
          />
          <button
            type="submit"
            disabled={isUpdating}
            className="h-12 w-full rounded-md bg-brand text-base font-semibold text-brand-ink transition-colors hover:bg-brand-hover active:bg-brand-hover disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isUpdating ? 'Updating password...' : 'Update password'}
          </button>
        </form>
      </section>
    </PageShell>
  )
}

export function ReferralsPage() {
  const { user } = useAuth()
  const [copied, setCopied] = useState(false)
  
  // Generate referral link pointing to live host
  const referralCode = user?.username?.toLowerCase().replace(/\s+/g, '') || user?.phone || 'guest'
  const appOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://rukabet.live'
  const referralLink = `${appOrigin}/?ref=${encodeURIComponent(referralCode)}`
  
  // Real stats from user account
  const totalReferrals = user?.referralsCount ?? 0
  const totalEarned = user?.referralsEarnings ?? 0

  const handleCopy = () => {
    navigator.clipboard.writeText(referralLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <PageShell title="Refer and earn" subtitle="Invite friends, earn rewards">
      <section className="rounded-lg border border-brand/30 bg-brand/[0.07] p-5 text-center">
        <p className="text-3xl font-bold tabular-nums text-brand">KSH 20</p>
        <p className="mt-1 text-sm text-ink">per successful referral</p>
        <p className="mt-2 text-sm text-ink-2">Paid when your friend makes a first deposit of KSH 10 or more.</p>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <div className={CARD}>
          <p className="text-sm text-ink-2">Total referrals</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{totalReferrals}</p>
        </div>
        <div className={CARD}>
          <p className="text-sm text-ink-2">Total earned</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-brand">KSH {totalEarned}</p>
        </div>
      </div>

      <section className={CARD}>
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
          <Link2 className="size-4 text-ink-2" aria-hidden="true" />
          Your referral link
        </h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={referralLink}
            readOnly
            aria-label="Referral link"
            onFocus={(e) => e.currentTarget.select()}
            className="h-12 min-w-0 flex-1 rounded-md border border-line bg-field px-3 text-base text-ink-2 focus-visible:border-brand focus-visible:outline-none"
          />
          <button
            type="button"
            onClick={handleCopy}
            className={`flex h-12 shrink-0 items-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors ${
              copied ? 'bg-brand text-brand-ink' : 'bg-raised text-ink hover:bg-line-strong'
            }`}
          >
            {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-ink-2">
          Share your link with friends. When they register and make a first deposit of KSH 10 or more,
          KSH 20 is credited to your main balance.
        </p>
      </section>
    </PageShell>
  )
}

export function BonusesPage() {
  const { user } = useAuth()
  const freebetBalance = user?.freebet ?? 0
  
  // Real deposit bonus progress
  const wagerRequired = user?.wagerRequired ?? (user?.hasPlayedWithMoney ? 0 : 20)
  const wagerProgress = user?.wagerProgress ?? (user?.hasPlayedWithMoney ? wagerRequired : 0)
  const progressPercent = wagerRequired > 0 ? Math.min((wagerProgress / wagerRequired) * 100, 100) : (user?.hasPlayedWithMoney ? 100 : 0)

  return (
    <PageShell title="Bonuses" subtitle="Your rewards and promotions">
      <section className={CARD}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-bonus/15 text-bonus">
              <Ticket className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Freebets</h2>
              <p className="text-sm text-ink-2">Risk-free bets</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold tabular-nums text-bonus">
              KSH {freebetBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-ink-3">Available</p>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-ink-2">
          Freebet winnings are credited as real cash minus the original stake. Use them on the main game to win real money.
        </p>
      </section>

      <section className={CARD}>
        <div className="mb-4">
          <h2 className="text-base font-semibold">Deposit bonus</h2>
          <p className="text-sm font-medium text-brand">50% on deposits of KSH 99 or more</p>
        </div>

        <div className="mb-2 flex items-baseline justify-between gap-3">
          <span className="text-sm text-ink-2">Wager progress (2x requirement)</span>
          <span className="shrink-0 text-sm font-semibold tabular-nums">{wagerProgress} / {wagerRequired} KSH</span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-raised"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progressPercent)}
          aria-label="Wager progress"
        >
          <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${progressPercent}%` }} />
        </div>
        <p className="mt-3 text-sm leading-relaxed text-ink-2">
          Deposit KSH 99 or more to receive a 50% bonus. Wager 2x the bonus amount to convert it to withdrawable cash.
        </p>
      </section>

      <section className={CARD}>
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
          <Gift className="size-4 text-ink-2" aria-hidden="true" />
          Welcome bonus
        </h2>
        <p className="text-3xl font-bold tabular-nums text-brand">KSH 150</p>
        <p className="mt-1 text-sm text-ink-2">Freebet for new users, credited when you register.</p>
      </section>
    </PageShell>
  )
}

// Kept for old links: redirects straight to WhatsApp support
export function SupportPage() {
  useEffect(() => {
    window.location.href = 'https://wa.me/254713934411'
  }, [])

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-page px-6 text-center text-ink">
      <MessageCircle className="size-8 text-brand" aria-hidden="true" />
      <p className="text-sm text-ink-2">Opening WhatsApp support...</p>
    </div>
  )
}
