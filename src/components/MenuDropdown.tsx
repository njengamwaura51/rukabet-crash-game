import { useEffect, useRef } from 'react'
import { Link } from 'wouter'
import { useConfig } from '@/hooks/useConfig'

interface MenuDropdownProps {
  username: string
  isLoggedIn: boolean
  onClose: () => void
  onLogout: () => void
}

export function MenuDropdown({ username, isLoggedIn, onClose, onLogout }: MenuDropdownProps) {
  const ref = useRef<HTMLDivElement>(null)
  const { config } = useConfig()

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  const handleSupportClick = () => {
    window.open(`https://wa.me/${config.whatsappSupportNumber}`, '_blank')
    onClose()
  }

  return (
    <div
      ref={ref}
      className="fixed right-3 top-14 z-50 bg-gradient-to-b from-[#1e1e1e] to-[#141414] border border-white/10 rounded-xl shadow-2xl w-56 overflow-hidden"
    >
      {/* Username header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-[#1a1a1a]">
        <div className="w-10 h-10 rounded-full bg-[#00C74D] flex items-center justify-center">
          <span className="text-black font-black text-sm">{username.charAt(0).toUpperCase()}</span>
        </div>
        <div>
          <span className="text-white font-bold text-sm block">{username}</span>
          <span className="text-white/40 text-[10px]">Member</span>
        </div>
      </div>

      {/* Menu items with routing */}
      <div className="py-2">
        <Link to="/profile" onClick={onClose}>
          <MenuItem icon="👤" label="My Profile" />
        </Link>
        <Link to="/referrals" onClick={onClose}>
          <MenuItem icon="👥" label="Refer & Earn" badge="KSH 20" />
        </Link>
        <Link to="/bonuses" onClick={onClose}>
          <MenuItem icon="🎁" label="Bonuses" />
        </Link>
        {/* Help & Support - external WhatsApp redirect */}
        <MenuItem icon="❓" label="Help & Support" onClick={handleSupportClick} />
        
        {isLoggedIn && (
          <>
            <div className="border-t border-white/10 my-1" />
            <MenuItem icon="🚪" label="Logout" danger onClick={() => { onLogout(); onClose(); }} />
          </>
        )}
      </div>
    </div>
  )
}

function MenuItem({
  icon,
  label,
  badge,
  danger = false,
  onClick,
}: {
  icon: string
  label: string
  badge?: string
  danger?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center justify-between px-4 py-2.5 text-xs font-bold hover:bg-white/5 transition-colors ${
        danger ? 'text-[#E91E63]' : 'text-white/70 hover:text-white'
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="text-sm">{icon}</span>
        <span>{label}</span>
      </div>
      {badge && (
        <span className="bg-[#00C74D]/20 text-[#00C74D] text-[10px] font-black px-2 py-0.5 rounded-full">
          {badge}
        </span>
      )}
    </button>
  )
}
