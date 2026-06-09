import { useState, useEffect } from 'react'
import { Link } from 'wouter'
import { useAuth } from '@/hooks/useAuth'

export function ProfilePage() {
  const { user } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters' })
      return
    }
    
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match' })
      return
    }

    // Simulate password change
    setMessage({ type: 'success', text: 'Password changed successfully!' })
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setTimeout(() => setMessage(null), 3000)
  }

  return (
    <div className="min-h-screen bg-[#0b0e11] text-white p-4 sm:p-6">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-black text-white">My Profile</h1>
            <p className="text-white/50 text-xs mt-0.5">Manage your account</p>
          </div>
          <Link to="/">
            <button className="px-3.5 py-1.5 bg-white/[0.04] backdrop-blur-sm border border-white/[0.06] rounded-xl text-white/70 hover:text-white hover:bg-white/[0.08] transition-all text-xs font-bold focus:outline-none">
              ← Back
            </button>
          </Link>
        </div>

        {/* Account Info Card */}
        <div className="bg-[#151920]/90 backdrop-blur-sm rounded-2xl border border-white/[0.06] p-5 mb-4">
          <div className="flex items-center gap-4 mb-5">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#00D455] to-[#00A83D] flex items-center justify-center shadow-sm shadow-[#00C74D]/20">
              <span className="text-black font-black text-xl">
                {user?.username?.charAt(0).toUpperCase() || 'U'}
              </span>
            </div>
            <div>
              <h2 className="text-white font-bold text-lg">{user?.username || 'User'}</h2>
              <span className="text-[#00C74D] text-xs font-bold">Member</span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center py-2.5 border-b border-white/[0.06]">
              <span className="text-white/50 text-sm">Username</span>
              <span className="text-white font-bold text-sm">{user?.username || '—'}</span>
            </div>
            <div className="flex justify-between items-center py-2.5 border-b border-white/[0.06]">
              <span className="text-white/50 text-sm">Phone Number</span>
              <span className="text-white font-bold text-sm font-mono">{user?.phone || '—'}</span>
            </div>
            <div className="flex justify-between items-center py-2.5 border-b border-white/[0.06]">
              <span className="text-white/50 text-sm">Balance</span>
              <span className="text-[#00C74D] font-black text-sm font-mono">
                KSH {(user?.balance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-white/50 text-sm">Freebet Balance</span>
              <span className="text-[#FBBF24] font-black text-sm font-mono">
                KSH {(user?.freebet ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* Change Password Card */}
        <div className="bg-[#151920]/90 backdrop-blur-sm rounded-2xl border border-white/[0.06] p-5">
          <h3 className="text-white font-bold text-sm mb-4 flex items-center gap-2">
            <span>🔐</span> Change Password
          </h3>

          {message && (
            <div className={`mb-4 p-3 rounded-xl text-xs font-bold ${
              message.type === 'success' 
                ? 'bg-[#00C74D]/20 text-[#00C74D] border border-[#00C74D]/30' 
                : 'bg-red-500/10 text-red-400 border border-red-500/30'
            }`}>
              {message.text}
            </div>
          )}

          <form onSubmit={handleChangePassword} className="space-y-3">
            <div>
              <label className="block text-white/50 text-xs font-bold mb-1.5">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#00C74D]/60 transition-all duration-200 placeholder-white/25"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="block text-white/50 text-xs font-bold mb-1.5">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#00C74D]/60 transition-all duration-200 placeholder-white/25"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="block text-white/50 text-xs font-bold mb-1.5">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#00C74D]/60 transition-all duration-200 placeholder-white/25"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              className="w-full mt-2 py-2.5 bg-gradient-to-b from-[#00D455] to-[#00A83D] text-black font-black text-sm rounded-xl hover:brightness-110 transition-all duration-200 active:scale-[0.98] focus:outline-none shadow-sm shadow-[#00C74D]/20"
            >
              Update Password
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-white/30 text-[10px]">
          RukaBet v1.0 • Provably Fair Gaming
        </div>
      </div>
    </div>
  )
}

export function ReferralsPage() {
  const { user } = useAuth()
  const [copied, setCopied] = useState(false)
  
  // Generate referral link (use username or a hash)
  const referralCode = user?.username?.toLowerCase().replace(/\s+/g, '') || 'guest'
  const referralLink = `https://rukabet.live/ref/${referralCode}`
  
  // Mock stats
  const totalReferrals = 3
  const totalEarned = 60

  const handleCopy = () => {
    navigator.clipboard.writeText(referralLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-screen bg-[#0b0e11] text-white p-4 sm:p-6">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-black text-white">Refer & Earn</h1>
            <p className="text-white/50 text-xs mt-0.5">Invite friends, earn rewards</p>
          </div>
          <Link to="/">
            <button className="px-3.5 py-1.5 bg-white/[0.04] backdrop-blur-sm border border-white/[0.06] rounded-xl text-white/70 hover:text-white hover:bg-white/[0.08] transition-all text-xs font-bold focus:outline-none">
              ← Back
            </button>
          </Link>
        </div>

        {/* Hero Card */}
        <div className="bg-gradient-to-br from-[#00C74D]/20 to-[#00C74D]/5 rounded-2xl border border-[#00C74D]/25 p-5 mb-4 text-center backdrop-blur-sm">
          <div className="text-4xl mb-2">💰</div>
          <h2 className="text-[#00C74D] font-black text-2xl">KSH 20</h2>
          <p className="text-white/70 text-sm mt-1">Per successful referral</p>
          <p className="text-white/40 text-xs mt-2">When your friend makes their first deposit of KSH 10+</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-[#151920]/90 backdrop-blur-sm rounded-2xl border border-white/[0.06] p-4 text-center">
            <div className="text-white/50 text-xs font-bold mb-1">Total Referrals</div>
            <div className="text-white font-black text-2xl">{totalReferrals}</div>
          </div>
          <div className="bg-[#151920]/90 backdrop-blur-sm rounded-2xl border border-white/[0.06] p-4 text-center">
            <div className="text-white/50 text-xs font-bold mb-1">Total Earned</div>
            <div className="text-[#00C74D] font-black text-2xl">KSH {totalEarned}</div>
          </div>
        </div>

        {/* Referral Link Card */}
        <div className="bg-[#151920]/90 backdrop-blur-sm rounded-2xl border border-white/[0.06] p-5">
          <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
            <span>🔗</span> Your Referral Link
          </h3>
          
          <div className="flex gap-2">
            <input
              type="text"
              value={referralLink}
              readOnly
              className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white/70 text-xs font-mono focus:outline-none"
            />
            <button
              onClick={handleCopy}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all duration-200 focus:outline-none ${
                copied 
                  ? 'bg-gradient-to-b from-[#00D455] to-[#00A83D] text-black shadow-sm shadow-[#00C74D]/20' 
                  : 'bg-[#00C74D]/20 text-[#00C74D] hover:bg-[#00C74D]/30'
              }`}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>

          <div className="mt-4 p-3 bg-white/[0.03] rounded-xl border border-white/[0.06]">
            <p className="text-white/50 text-xs">
              <strong className="text-white">How it works:</strong> Share your link with friends. 
              When they register and make their first deposit of KSH 10 or more, 
              you'll receive KSH 20 credited to your main balance instantly!
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-white/30 text-[10px]">
          RukaBet v1.0 • Provably Fair Gaming
        </div>
      </div>
    </div>
  )
}

export function BonusesPage() {
  const { user } = useAuth()
  const freebetBalance = user?.freebet ?? 0
  
  // Mock deposit bonus progress
  const wagerRequired = 198 // 99 * 2x
  const wagerProgress = 45 // Mock progress
  const progressPercent = Math.min((wagerProgress / wagerRequired) * 100, 100)

  return (
    <div className="min-h-screen bg-[#0b0e11] text-white p-4 sm:p-6">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-black text-white">Bonuses</h1>
            <p className="text-white/50 text-xs mt-0.5">Your rewards & promotions</p>
          </div>
          <Link to="/">
            <button className="px-3.5 py-1.5 bg-white/[0.04] backdrop-blur-sm border border-white/[0.06] rounded-xl text-white/70 hover:text-white hover:bg-white/[0.08] transition-all text-xs font-bold focus:outline-none">
              ← Back
            </button>
          </Link>
        </div>

        {/* Freebet Card */}
        <div className="bg-[#151920]/90 backdrop-blur-sm rounded-2xl border border-white/[0.06] p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-[#FBBF24]/15 flex items-center justify-center border border-[#FBBF24]/20">
                <span className="text-2xl">🎟️</span>
              </div>
              <div>
                <h3 className="text-white font-bold text-sm">Freebets</h3>
                <p className="text-white/50 text-xs">Risk-free bets</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[#FBBF24] font-black text-xl font-mono">
                KSH {freebetBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <div className="text-white/40 text-[10px]">Available</div>
            </div>
          </div>
          
          <div className="p-3 bg-white/[0.03] rounded-xl border border-white/[0.06]">
            <p className="text-white/60 text-xs">
              Freebet winnings are credited as real cash minus the original stake. 
              Use them on the main game to win real money!
            </p>
          </div>
        </div>

        {/* Deposit Bonus Card */}
        <div className="bg-gradient-to-br from-[#00C74D]/10 to-transparent rounded-2xl border border-[#00C74D]/20 p-5 mb-4 backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-[#00C74D]/20 flex items-center justify-center">
              <span className="text-2xl">💎</span>
            </div>
            <div>
              <h3 className="text-white font-bold text-sm">Deposit Bonus</h3>
              <p className="text-[#00C74D] text-xs font-bold">50% on deposits of KSH 99+</p>
            </div>
          </div>

          <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
            <div className="flex justify-between items-center mb-2">
              <span className="text-white/50 text-xs">Wager Progress (2x requirement)</span>
              <span className="text-white font-bold text-xs">{wagerProgress} / {wagerRequired} KSH</span>
            </div>
            
            {/* Progress bar */}
            <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-[#00C74D] to-[#00C74D]/70 rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            
            <p className="text-white/40 text-[10px] mt-2">
              Complete the 2x wager requirement to unlock your bonus funds as withdrawable cash.
            </p>
          </div>

          <div className="mt-4 p-3 bg-[#00C74D]/[0.08] rounded-xl border border-[#00C74D]/20">
            <p className="text-[#00C74D] text-xs font-bold mb-1">How it works:</p>
            <p className="text-white/60 text-xs">
              Deposit KSH 99 or more to receive a 50% bonus. Wager 2x the bonus amount 
              to convert it to real withdrawable cash.
            </p>
          </div>
        </div>

        {/* Welcome Bonus Info */}
        <div className="bg-[#151920]/90 backdrop-blur-sm rounded-2xl border border-white/[0.06] p-5">
          <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
            <span>🎁</span> Welcome Bonus
          </h3>
          <div className="text-center py-4">
            <div className="text-[#00C74D] font-black text-3xl mb-1">KSH 150</div>
            <p className="text-white/50 text-sm">Freebet for new users</p>
            <p className="text-white/30 text-xs mt-2">Automatically credited on registration</p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-white/30 text-[10px]">
          RukaBet v1.0 • Provably Fair Gaming
        </div>
      </div>
    </div>
  )
}

// Keep SupportPage for backwards compatibility but it just redirects
export function SupportPage() {
  // Redirect to WhatsApp
  useEffect(() => {
    window.location.href = 'https://wa.me/254713934411'
  }, [])
  
  return (
    <div className="min-h-screen bg-[#0b0e11] text-white flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-4">💬</div>
        <p className="text-white/50">Redirecting to WhatsApp...</p>
      </div>
    </div>
  )
}


