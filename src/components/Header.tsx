import { useState } from 'react'
import { Link } from 'wouter'
import { Menu } from 'lucide-react'
import { AuthModal } from './AuthModal'
import { DepositModal } from './DepositModal'
import { MenuDropdown } from './MenuDropdown'
import { WhatsAppIcon } from './WhatsAppIcon'
import { formatWhatsAppUrl } from '@/lib/utils'
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

const money = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function Header({ user, onLogin, onRegister, onLogout, onDeposit, activeWallet = 'main' }: HeaderProps) {
  const [showAuth, setShowAuth] = useState<'login' | 'register' | null>(null)
  const [showDeposit, setShowDeposit] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const { config } = useConfig()

  const isLoggedIn = !!user
  const isBonus = activeWallet === 'bonus'
  const displayBalance = isBonus ? user?.freebet ?? 0 : user?.balance ?? 0

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-page pt-[env(safe-area-inset-top)]">
        <div className="flex h-14 items-center justify-between gap-2 pl-2 pr-2.5 sm:pl-3 sm:pr-4 lg:pl-3.5 lg:pr-5">
          {/* Brand + WhatsApp Support Icon */}
          <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
            <Link to="/" className="flex shrink-0 items-center rounded-md">
              <img src="/logo.png" alt={config.brandName} className="h-[22px] w-auto object-contain sm:h-[26px] lg:h-[28px]" />
              <span className="sr-only">{config.brandName} home</span>
            </Link>

            {/* WhatsApp Icon right next to the logo on all screens */}
            <a
              href={formatWhatsAppUrl(config.whatsappSupportNumber)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="WhatsApp Support"
              title="Chat with WhatsApp Support"
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#122e1b] text-whatsapp transition-transform hover:scale-110 active:scale-95 border border-[#1b4327] shadow-sm sm:size-8"
            >
              <WhatsAppIcon className="size-4 text-whatsapp sm:size-4.5" />
            </a>
          </div>

          {/* Account */}
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {isLoggedIn ? (
              <div className="flex h-9 items-stretch overflow-hidden rounded-md border border-line bg-field sm:h-10">
                <div className="flex min-w-0 flex-col justify-center px-2.5 leading-none sm:px-3" aria-live="polite">
                  <span className="text-[10px] font-medium text-ink-3">{isBonus ? 'Bonus' : 'Balance'}</span>
                  <span
                    className={`mt-0.5 max-w-[6.5rem] truncate text-[13px] font-semibold tabular-nums sm:max-w-[11rem] sm:text-sm ${
                      isBonus ? 'text-bonus' : 'text-ink'
                    }`}
                  >
                    <span className="mr-1 text-[10px] font-medium text-ink-3 sm:text-[11px]">KSH</span>
                    {money.format(displayBalance)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDeposit(true)}
                  className="flex items-center bg-brand px-3 text-[13px] font-semibold text-brand-ink transition-colors hover:bg-brand-hover active:bg-brand-active sm:px-3.5 sm:text-sm"
                >
                  Deposit
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setShowAuth('login')}
                  className="h-9 rounded-md border border-line-strong bg-panel px-3 text-[13px] font-semibold text-ink transition-colors hover:bg-field sm:h-10 sm:px-3.5 sm:text-sm"
                >
                  Log in
                </button>
                <button
                  type="button"
                  onClick={() => setShowAuth('register')}
                  className="h-9 rounded-md bg-brand px-3 text-[13px] font-semibold text-brand-ink transition-colors hover:bg-brand-hover active:bg-brand-active sm:h-10 sm:px-3.5 sm:text-sm"
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
              className={`flex size-9 items-center justify-center rounded-md border transition-colors sm:size-10 ${
                showMenu
                  ? 'border-line-strong bg-raised text-ink'
                  : 'border-line bg-panel text-ink-2 hover:bg-field hover:text-ink'
              }`}
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
