import { useState, useEffect, useRef } from 'react'
import { useBetting } from '@/contexts/BettingContext'
import { SharedLiveBet } from '@/hooks/useGameState'

type SidebarTab = 'live' | 'mine' | 'top'

interface LiveBet {
  id: number | string
  user: string
  rank: number
  bet: number
  cashout: number | null
  won: number | null
  cashoutTarget: number
  isUser?: boolean
}

// User bet history item
export interface UserBetHistory {
  id: string
  roundId: number
  amount: number
  cashoutMultiplier: number | null
  won: number | null
  isFreebet: boolean
  timestamp: number
}



function getOddsBadgeColor(v: number): string {
  if (v >= 5) return '#00C74D'
  if (v >= 1.5) return '#f59e0b'
  return '#ec4899'
}

// User avatar with initial
function UserAvatar({ name, isUser }: { name: string; isUser?: boolean }) {
  return (
    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
      isUser ? 'bg-gradient-to-br from-[#00D455] to-[#00A83D] shadow-sm shadow-[#00C74D]/20' : 'bg-white/[0.08]'
    }`}>
      <span className={`text-[10px] font-black ${isUser ? 'text-black' : 'text-white/50'}`}>
        {name.charAt(0).toUpperCase()}
      </span>
    </div>
  )
}

interface LiveBetsSidebarProps {
  phase: string
  variant?: 'sidebar' | 'bottom'
  multiplier?: number
  userBetHistory?: UserBetHistory[]
  username?: string
  sharedBets?: SharedLiveBet[]
}

export function LiveBetsSidebar({ 
  phase, 
  variant = 'sidebar', 
  multiplier = 1,
  username = 'You',
  sharedBets = []
}: LiveBetsSidebarProps) {
  const [tab, setTab] = useState<SidebarTab>('live')
  const lastPhaseRef = useRef(phase)
  
  const betting = useBetting()
  const userBetHistory = betting?.betHistory ?? []
  
  useEffect(() => {
    lastPhaseRef.current = phase
  }, [phase])

  const liveRows: LiveBet[] = sharedBets.length > 0
    ? [...sharedBets].sort((a, b) => b.bet - a.bet)
    : []

  // Render a single bet pill - reduced padding
  const renderBetPill = (row: LiveBet, index: number) => {
    const hasWon = row.cashout !== null
    const badgeColor = hasWon ? getOddsBadgeColor(row.cashout!) : null
    
    return (
      <div
        key={`${row.id}-${index}`}
        className={`mx-2 mb-1.5 rounded-full px-3 py-1 flex items-center justify-between transition-all ${
          hasWon 
            ? 'bg-gradient-to-r from-[#00C74D]/20 to-[#00C74D]/10 border border-[#00C74D]/40' 
            : 'bg-[#0f1318] border border-white/5 hover:border-white/10'
        } ${row.isUser ? 'border-[#00C74D]/60 shadow-lg shadow-[#00C74D]/10' : ''}`}
      >
        {/* Left: Avatar + Name */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <UserAvatar name={row.user} isUser={row.isUser} />
          <span className={`text-[11px] font-bold truncate ${row.isUser ? 'text-[#00C74D]' : 'text-white/80'}`}>
            {row.user}
          </span>
        </div>
        
        {/* Center: Bet amount */}
        <div className="flex items-center gap-2 px-2">
          <span className="text-[11px] text-white/60 font-mono font-bold">
            {row.bet.toLocaleString()}
          </span>
        </div>
        
        {/* Right: Multiplier + Win */}
        <div className="flex items-center gap-2 min-w-[80px] justify-end">
          {hasWon && badgeColor ? (
            <>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-black"
                style={{ backgroundColor: badgeColor, color: '#000' }}
              >
                {row.cashout!.toFixed(2)}x
              </span>
              <span className="text-[11px] font-mono font-black text-[#00C74D]">
                {row.won?.toLocaleString()}
              </span>
            </>
          ) : (
            <span className="text-[11px] text-white/20 font-medium">—</span>
          )}
        </div>
      </div>
    )
  }

  // Render user bet history as pills
  const renderUserBetHistory = () => {
    if (userBetHistory.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-32 text-white/30">
          <svg className="w-10 h-10 mb-2 opacity-30" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14H6v-2h6v2zm4-4H6v-2h10v2zm0-4H6V7h10v2z"/>
          </svg>
          <span className="text-xs font-bold">No bets yet</span>
          <span className="text-[10px] text-white/20 mt-1">Place a bet to see history</span>
        </div>
      )
    }

    return (
      <div className="py-2">
        {userBetHistory.map((bet, index) => {
          const hasWon = bet.cashoutMultiplier !== null
          const badgeColor = hasWon ? getOddsBadgeColor(bet.cashoutMultiplier!) : '#ef4444'
          
          return (
            <div
              key={`${bet.id}-${index}`}
              className={`mx-2 mb-1.5 rounded-full px-3 py-1 flex items-center justify-between transition-all ${
                hasWon 
                  ? 'bg-gradient-to-r from-[#00C74D]/20 to-[#00C74D]/10 border border-[#00C74D]/40' 
                  : 'bg-gradient-to-r from-red-500/10 to-red-500/5 border border-red-500/30'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <UserAvatar name={username} isUser />
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-[#00C74D]">{username}</span>
                  {bet.isFreebet && (
                    <span className="text-[8px] text-[#FBBF24] font-bold">FREEBET</span>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-2 px-2">
                <span className="text-[11px] text-white/60 font-mono font-bold">
                  {bet.amount.toLocaleString()}
                </span>
              </div>
              
              <div className="flex items-center gap-2 min-w-[80px] justify-end">
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-black"
                  style={{ backgroundColor: badgeColor, color: '#000' }}
                >
                  {hasWon ? `${bet.cashoutMultiplier!.toFixed(2)}x` : 'LOST'}
                </span>
                <span className={`text-[11px] font-mono font-black ${hasWon ? 'text-[#00C74D]' : 'text-red-400'}`}>
                  {hasWon ? `+${bet.won?.toLocaleString()}` : `-${bet.amount.toLocaleString()}`}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const renderTopWins = () => {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-white/25">
        <svg className="w-10 h-10 mb-2 opacity-25" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
        <span className="text-xs font-bold">Top wins coming soon</span>
        <span className="text-[10px] text-white/15 mt-1">Play to see the leaderboard</span>
      </div>
    )
  }

  return (
    <div className={`flex flex-col h-full max-h-[500px] lg:max-h-full min-h-0 w-full overflow-hidden ${variant === 'sidebar' ? 'p-2' : 'p-2 border-t border-white/[0.04]'}`}
      style={{ background: '#0b0e11' }}
    >
      <div className="flex flex-col flex-1 h-full max-h-full min-h-0 bg-[#151920]/90 backdrop-blur-sm rounded-2xl overflow-hidden border border-white/[0.06]">
        
        {/* Pill-shaped tabs */}
        <div className="flex-shrink-0 p-3 pb-2">
          <div className="flex bg-white/[0.04] rounded-xl p-0.5 border border-white/[0.04]">
            <button
              type="button"
              onClick={() => setTab('live')}
              className={`flex-1 py-2 text-[10px] font-black tracking-wide rounded-lg transition-all duration-200 ${
                tab === 'live'
                  ? 'bg-gradient-to-b from-[#00D455] to-[#00A83D] text-black shadow-sm shadow-[#00C74D]/20'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              ALL
            </button>
            <button
              type="button"
              onClick={() => setTab('mine')}
              className={`flex-1 py-2 text-[10px] font-black tracking-wide rounded-lg transition-all duration-200 ${
                tab === 'mine'
                  ? 'bg-gradient-to-b from-[#00D455] to-[#00A83D] text-black shadow-sm shadow-[#00C74D]/20'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              MINE
            </button>
            <button
              type="button"
              onClick={() => setTab('top')}
              className={`flex-1 py-2 text-[10px] font-black tracking-wide rounded-lg transition-all duration-200 ${
                tab === 'top'
                  ? 'bg-gradient-to-b from-[#00D455] to-[#00A83D] text-black shadow-sm shadow-[#00C74D]/20'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              TOP WINS
            </button>
          </div>
        </div>

        {/* Column headers */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-2 text-[9px] font-black uppercase tracking-wider text-white/30 border-b border-white/[0.06]">
          <span>Player</span>
          <span>Bet</span>
          <span>Multiplier / Win</span>
        </div>

        {/* Bet pills list */}
        <div className="flex-1 min-h-0 w-full overflow-y-auto live-bets-scroll scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent py-2">
          {tab === 'live' && (
            liveRows.length > 0
              ? liveRows.map((row, index) => renderBetPill(row, index))
              : (
                <div className="flex flex-col items-center justify-center h-32 text-white/25">
                  <svg className="w-10 h-10 mb-2 opacity-25" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                  <span className="text-xs font-bold">Waiting for bets</span>
                  <span className="text-[10px] text-white/15 mt-1">Place a bet to get started</span>
                </div>
              )
          )}
          {tab === 'mine' && renderUserBetHistory()}
          {tab === 'top' && renderTopWins()}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-3 py-2 border-t border-white/[0.06]">
          <div className="text-[9px] text-white/20 text-center font-bold tracking-wider">
            Provably Fair
          </div>
        </div>
      </div>
    </div>
  )
}
