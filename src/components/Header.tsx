import { useState } from 'react'
import { Link } from 'wouter'
import { Menu } from 'lucide-react'
import { AuthModal } from './AuthModal'
import { DepositModal } from './DepositModal'
import { MenuDropdown } from './MenuDropdown'
import { WhatsAppIcon } from './WhatsAppIcon'
import { useConfig } from '@/hooks/useConfig'
import type { User } from '@/hooks/useAuth'

interface HeaderProps {
  user: User | null
  onLogin: (phone: string, password: string) => Promise<{ success: boolean; error?: string }>
  onRegister: (phone: string, password: string, username: string) => Promise<{ success: boolean; error?: string }>
  onLogout: () => void
  onDeposit: (amount: number) => void
  activeWallet?: 'main' | 'bonus'
}

export function Header({ user, onLogin, onRegister, onLogout, onDeposit, activeWallet = 'main' }: HeaderProps) {
  const [showAuth, setShowAuth] = useState<'login' | 'register' | null>(null)
  const [showDeposit, setShowDeposit] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const { config } = useConfig()

  const isLoggedIn = !!user
  const isBonus = activeWallet === 'bonus'

  const displayBalance = activeWallet === 'main'
    ? user?.balance ?? 0
    : user?.freebet ?? 0

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-page pt-[env(safe-area-inset-top)]">
        <div className="flex h-14 items-center justify-between gap-2 px-3 sm:px-4 lg:px-5">
          {/* Logo + support */}
          <div className="flex min-w-0 items-center gap-4">
            <Link to="/" className="block shrink-0">
              <img src="/logo.png" alt="" className="h-8 w-auto sm:h-9" />
              <span className="sr-only">RukaBet home</span>
            </Link>

            <a
              href={`https://wa.me/${config.whatsappSupportNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden items-center gap-2 text-sm text-ink-2 hover:text-ink md:flex"
            >
              <WhatsAppIcon className="size-4 text-[#25D366]" />
              <span>Support +{config.whatsappSupportNumber}</span>
            </a>
          </div>

          {/* Account */}
          <div className="flex shrink-0 items-center gap-2">
            {isLoggedIn ? (
              <>
                <div className="flex min-w-0 flex-col items-end leading-tight" aria-live="polite">
                  <span className="text-[11px] text-ink-3">{isBonus ? 'Bonus balance' : 'Balance'}</span>
                  <span className={`max-w-[7.5rem] truncate text-sm font-semibold tabular-nums sm:max-w-none ${isBonus ? 'text-bonus' : 'text-ink'}`}>
                    KSH {displayBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDeposit(true)}
                  className="h-10 rounded-md bg-brand px-4 text-sm font-semibold text-brand-ink transition-colors hover:bg-brand-hover active:bg-brand-hover"
                >
                  Deposit
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setShowAuth('login')}
                  className="h-10 rounded-md border border-line-strong px-3.5 text-sm font-semibold text-ink transition-colors hover:bg-field"
                >
                  Log in
                </button>
                <button
                  type="button"
                  onClick={() => setShowAuth('register')}
                  className="h-10 rounded-md bg-brand px-3.5 text-sm font-semibold text-brand-ink transition-colors hover:bg-brand-hover active:bg-brand-hover"
                >
                  Register
                </button>
              </>
            )}

            <button
              type="button"
              data-menu-toggle
              onClick={() => setShowMenu(open => !open)}
              aria-label="Menu"
              aria-expanded={showMenu}
              aria-haspopup="menu"
              className="flex size-10 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-field hover:text-ink"
            >
              <Menu className="size-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      {/* Modals */}
      {showAuth && (
        <AuthModal
          mode={showAuth}
          onClose={() => setShowAuth(null)}
          onLogin={onLogin}
          onRegister={onRegister}
          onSwitchMode={() => setShowAuth(showAuth === 'login' ? 'register' : 'login')}
        />
      )}

      {showDeposit && user && (
        <DepositModal
          balance={user.balance}
          freebet={user.freebet}
          freebetLocked={user.freebetLocked}
          userPhone={user.phone}
          onClose={() => setShowDeposit(false)}
          onDeposit={onDeposit}
        />
      )}

      {showMenu && (
        <MenuDropdown
          username={user?.username || 'Guest'}
          isLoggedIn={isLoggedIn}
          onClose={() => setShowMenu(false)}
          onLogout={onLogout}
        />
      )}
    </>
  )
}
