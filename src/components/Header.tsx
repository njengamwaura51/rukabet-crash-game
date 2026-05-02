import { useState } from 'react'
import { Link } from 'wouter'
import { AuthModal } from './AuthModal'
import { DepositModal } from './DepositModal'
import { MenuDropdown } from './MenuDropdown'
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

  const displayBalance = activeWallet === 'main' 
    ? user?.balance ?? 0 
    : user?.freebet ?? 0
  
  const balanceLabel = activeWallet === 'bonus' ? '(Bonus)' : ''
  const balanceColor = activeWallet === 'bonus' ? 'text-[#FBBF24]' : 'text-white'

  return (
    <>
      <header className="flex-shrink-0 flex items-center justify-between px-3 sm:px-5 py-2.5 sm:py-3 bg-[#0a0a0a]/90 backdrop-blur-xl border-b border-white/[0.06] shadow-[0_1px_3px_rgba(0,0,0,0.5)]">
        {/* Left: logo + whatsapp */}
        <div className="flex items-center gap-2.5 sm:gap-4">
          <Link to="/">
            <img 
              src="/logo.png" 
              alt="RukaBet" 
              className="h-8 sm:h-10 w-auto cursor-pointer hover:opacity-90 transition-opacity duration-200"
            />
          </Link>

          <a 
            href={`https://wa.me/${config.whatsappSupportNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:flex items-center gap-1.5 text-white/40 text-[10px] hover:text-white/60 transition-colors duration-200"
          >
            <span>Support:</span>
            <span className="text-white/70 font-semibold">+{config.whatsappSupportNumber}</span>
            <div className="w-5 h-5 rounded-full bg-[#25D366]/90 flex items-center justify-center ml-0.5 shadow-sm shadow-[#25D366]/30">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            </div>
          </a>
        </div>

        {/* Right: auth or balance */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {isLoggedIn ? (
            <>
              {/* Balance pill */}
              <div className={`flex items-center gap-1.5 sm:gap-2 bg-white/[0.04] backdrop-blur-sm rounded-xl px-2.5 sm:px-3.5 py-1.5 sm:py-2 border transition-all duration-300 ${
                activeWallet === 'bonus' ? 'border-[#FBBF24]/25' : 'border-white/[0.08]'
              }`}>
                <span className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-wider transition-colors duration-300 ${
                  activeWallet === 'bonus' ? 'text-[#FBBF24]/60' : 'text-white/40'
                }`}>
                  KSH {balanceLabel}
                </span>
                <span className={`font-black font-sans text-xs sm:text-sm transition-colors duration-300 ${balanceColor}`}>
                  {displayBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              {/* Deposit button */}
              <button
                type="button"
                onClick={() => setShowDeposit(true)}
                className="px-3.5 sm:px-5 py-1.5 sm:py-2 rounded-xl bg-gradient-to-b from-[#00D455] to-[#00A83D] text-black font-black text-[10px] sm:text-xs hover:brightness-110 transition-all duration-200 active:scale-95 focus:outline-none focus:ring-0 shadow-sm shadow-[#00C74D]/20"
              >
                Deposit
              </button>
              
              {/* Menu */}
              <button
                type="button"
                onClick={() => setShowMenu(!showMenu)}
                className="p-2 hover:bg-white/[0.06] rounded-xl transition-all duration-200"
              >
                <svg width="18" height="18" fill="white" viewBox="0 0 24 24" opacity="0.5">
                  <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>
                </svg>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setShowAuth('login')}
                className="px-3.5 sm:px-5 py-1.5 sm:py-2 rounded-xl border border-[#00C74D]/40 text-[#00C74D] font-black text-[10px] sm:text-xs hover:bg-[#00C74D]/10 hover:border-[#00C74D]/60 transition-all duration-200 active:scale-95 focus:outline-none focus:ring-0"
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => setShowAuth('register')}
                className="px-3.5 sm:px-5 py-1.5 sm:py-2 rounded-xl bg-gradient-to-b from-[#00D455] to-[#00A83D] text-black font-black text-[10px] sm:text-xs hover:brightness-110 transition-all duration-200 active:scale-95 focus:outline-none focus:ring-0 shadow-sm shadow-[#00C74D]/20"
              >
                Register
              </button>
              <button
                type="button"
                onClick={() => setShowMenu(!showMenu)}
                className="p-2 hover:bg-white/[0.06] rounded-xl transition-all duration-200"
              >
                <svg width="18" height="18" fill="white" viewBox="0 0 24 24" opacity="0.45">
                  <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>
                </svg>
              </button>
            </>
          )}
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
