import { useEffect, useRef, type ReactNode } from 'react'
import { Link } from 'wouter'
import { Gift, LifeBuoy, LogOut, User, Users } from 'lucide-react'
import { useConfig } from '@/hooks/useConfig'

interface MenuDropdownProps {
  username: string
  isLoggedIn: boolean
  onClose: () => void
  onLogout: () => void
}

const ROW = 'flex h-12 w-full items-center gap-3 px-4 text-left text-sm font-medium transition-colors hover:bg-field active:bg-field'

export function MenuDropdown({ username, isLoggedIn, onClose, onLogout }: MenuDropdownProps) {
  const ref = useRef<HTMLDivElement>(null)
  const { config } = useConfig()

  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Element
      // The header's menu button toggles on its own; don't close and reopen.
      if (target.closest('[data-menu-toggle]')) return
      if (ref.current && !ref.current.contains(target)) onClose()
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  const handleSupportClick = () => {
    window.open(`https://wa.me/${config.whatsappSupportNumber}`, '_blank', 'noopener,noreferrer')
    onClose()
  }

  return (
    <div
      ref={ref}
      role="menu"
      className="animate-fade-in fixed right-3 top-[calc(env(safe-area-inset-top)_+_3.5rem)] z-50 w-64 overflow-hidden rounded-lg border border-line bg-panel shadow-lg"
    >
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-ink">
          {username.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{username}</p>
          {!isLoggedIn && <p className="text-xs text-ink-3">Not logged in</p>}
        </div>
      </div>

      <nav className="py-1">
        <MenuLink to="/profile" icon={<User className="size-[18px]" />} label="My profile" onClose={onClose} />
        <MenuLink to="/referrals" icon={<Users className="size-[18px]" />} label="Refer and earn" badge={`KSH ${config.referralReward ?? 20}`} onClose={onClose} />
        <MenuLink to="/bonuses" icon={<Gift className="size-[18px]" />} label="Bonuses" onClose={onClose} />
        <button type="button" role="menuitem" onClick={handleSupportClick} className={`${ROW} text-ink-2 hover:text-ink`}>
          <LifeBuoy className="size-[18px]" aria-hidden="true" />
          <span>Help and support</span>
        </button>

        {isLoggedIn && (
          <>
            <div className="mx-4 my-1 border-t border-line" />
            <button
              type="button"
              role="menuitem"
              onClick={() => { onLogout(); onClose() }}
              className={`${ROW} text-loss`}
            >
              <LogOut className="size-[18px]" aria-hidden="true" />
              <span>Log out</span>
            </button>
          </>
        )}
      </nav>
    </div>
  )
}

function MenuLink({
  to,
  icon,
  label,
  badge,
  onClose,
}: {
  to: string
  icon: ReactNode
  label: string
  badge?: string
  onClose: () => void
}) {
  return (
    <Link to={to} onClick={onClose} role="menuitem" className={`${ROW} text-ink-2 hover:text-ink`}>
      <span aria-hidden="true">{icon}</span>
      <span className="flex-1">{label}</span>
      {badge && (
        <span className="rounded bg-brand/15 px-1.5 py-0.5 text-xs font-semibold text-brand">{badge}</span>
      )}
    </Link>
  )
}
