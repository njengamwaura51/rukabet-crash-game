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

// Top wins data
interface TopWin {
  id: string
  user: string
  multiplier: number
  betAmount: number
  winAmount: number
  timestamp: number
}

const BOT_NAMES = [
  'dk**29', 'km**93', 'mp**17', 'ja**41', 'ar**84', 'pt**66', 'su**52', 'ra**78',
  'bo**35', 'ct**10', 'fx**63', 'gu**97', 'hy**42', 'lm**89', 'nk**34', 'tw**16',
  'ud**51', 'vn**75', 'ws**88', 'xp**23', 'yo**90', 'zr**67', 'el**22', 'if**94',
  'qz**46', 'om**79', 'wr**82', 'ni**55', 'yx**48', 'ko**31', 'mu**74', 'pk**27',
  'jd**60', 're**13', 'st**96', 'az**49', 'bx**72', 'cw**25', 'dm**58', 'eq**81',
]

// Generate top wins data
function generateTopWins(): TopWin[] {
  const wins: TopWin[] = [
    { id: '1', user: 'mk**74', multiplier: 55.40, betAmount: 1000, winAmount: 55400, timestamp: Date.now() - 120000 },
    { id: '2', user: 'pt**29', multiplier: 42.18, betAmount: 500, winAmount: 21090, timestamp: Date.now() - 340000 },
    { id: '3', user: 'ar**63', multiplier: 38.92, betAmount: 2000, winAmount: 77840, timestamp: Date.now() - 560000 },
    { id: '4', user: 'dk**17', multiplier: 31.55, betAmount: 750, winAmount: 23662, timestamp: Date.now() - 890000 },
    { id: '5', user: 'su**88', multiplier: 28.34, betAmount: 1500, winAmount: 42510, timestamp: Date.now() - 1200000 },
    { id: '6', user: 'ja**45', multiplier: 24.76, betAmount: 300, winAmount: 7428, timestamp: Date.now() - 1450000 },
    { id: '7', user: 'lm**91', multiplier: 22.13, betAmount: 5000, winAmount: 110650, timestamp: Date.now() - 1890000 },
    { id: '8', user: 'bo**52', multiplier: 19.88, betAmount: 100, winAmount: 1988, timestamp: Date.now() - 2340000 },
  ]
  return wins.sort((a, b) => b.multiplier - a.multiplier)
}

function generateBotBets(): LiveBet[] {
  const count = 58 + Math.floor(Math.random() * 16)
  const bets: LiveBet[] = []
  
  // Calculate how many should be high-rollers (20% of pool)
  const highRollerCount = Math.ceil(count * 0.2)
  
  for (let i = 0; i < count; i++) {
    let bet: number
    
    // First 20% are high-rollers (5,000 - 10,000 KSH)
    if (i < highRollerCount) {
      bet = Math.floor(5000 + Math.random() * 5001)
    } else {
      // Rest distributed normally
      const roll = Math.random()
      if (roll < 0.50) {
        bet = Math.floor(10 + Math.random() * 90)
      } else if (roll < 0.80) {
        bet = Math.floor(100 + Math.random() * 400)
      } else {
        bet = Math.floor(500 + Math.random() * 1500)
      }
    }
    
    bets.push({
      id: i + 1,
      user: BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)],
      rank: 1 + Math.floor(Math.random() * 5),
      bet,
      cashout: null,
      won: null,
      cashoutTarget: Math.random() < 0.4 
        ? 1.1 + Math.random() * 0.5
        : Math.random() < 0.7
          ? 1.5 + Math.random() * 1.5
          : 2.5 + Math.random() * 5
    })
  }
  
  return bets.sort((a, b) => b.bet - a.bet)
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
      isUser ? 'bg-[#00C74D]' : 'bg-gradient-to-br from-[#374151] to-[#1f2937]'
    }`}>
      <span className={`text-[10px] font-black ${isUser ? 'text-black' : 'text-white/70'}`}>
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
  const [bets, setBets] = useState<LiveBet[]>(() => generateBotBets())
  const [topWins] = useState<TopWin[]>(() => generateTopWins())
  const lastPhaseRef = useRef(phase)
  
  // Get user bet history from betting context
  const betting = useBetting()
  const userBetHistory = betting?.betHistory ?? []
  
  useEffect(() => {
    if (phase === 'waiting' && lastPhaseRef.current !== 'waiting') {
      setBets(generateBotBets())
    }
    lastPhaseRef.current = phase
  }, [phase])
  
  useEffect(() => {
    if (phase === 'flying' && multiplier > 1) {
      setBets(prevBets => 
        prevBets.map(bet => {
          if (bet.cashout !== null) return bet
          if (multiplier >= bet.cashoutTarget) {
            return {
              ...bet,
              cashout: Math.round(multiplier * 100) / 100,
              won: Math.round(bet.bet * multiplier * 100) / 100
            }
          }
          return bet
        })
      )
    }
  }, [phase, multiplier])

  const liveRows: LiveBet[] = sharedBets.length > 0
    ? [...sharedBets, ...bets].sort((a, b) => b.bet - a.bet)
    : bets

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

  // Render top wins
  const renderTopWins = () => {
    return (
      <div className="py-2">
        {topWins.map((win, index) => (
          <div
            key={win.id}
            className="mx-2 mb-1.5 rounded-full px-3 py-1 flex items-center justify-between transition-all bg-gradient-to-r from-[#00C74D]/20 to-[#00C74D]/10 border border-[#00C74D]/40"
          >
            {/* Rank + User */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#FBBF24] to-[#F59E0B] flex items-center justify-center flex-shrink-0">
                <span className="text-[10px] font-black text-black">#{index + 1}</span>
              </div>
              <UserAvatar name={win.user} />
              <span className="text-[11px] font-bold text-white/80 truncate">
                {win.user}
              </span>
            </div>
            
            {/* Bet amount */}
            <div className="flex items-center gap-2 px-2">
              <span className="text-[11px] text-white/60 font-mono font-bold">
                {win.betAmount.toLocaleString()}
              </span>
            </div>
            
            {/* Multiplier + Win */}
            <div className="flex items-center gap-2 min-w-[90px] justify-end">
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-black bg-[#00C74D] text-black"
              >
                {win.multiplier.toFixed(2)}x
              </span>
              <span className="text-[11px] font-mono font-black text-[#00C74D]">
                {win.winAmount.toLocaleString()}
              </span>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={`flex flex-col h-full min-h-0 w-full ${variant === 'sidebar' ? 'p-2' : 'p-2 border-t border-white/5'}`}
      style={{ background: '#0b0e11' }}
    >
      <div className="flex flex-col flex-1 min-h-0 h-full bg-[#1a1d24] rounded-2xl overflow-hidden">
        
        {/* Pill-shaped tabs */}
        <div className="flex-shrink-0 p-3 pb-2">
          <div className="flex bg-[#0f1318] rounded-full p-1">
            <button
              type="button"
              onClick={() => setTab('live')}
              className={`flex-1 py-2 text-[10px] font-black tracking-wide rounded-full transition-all ${
                tab === 'live'
                  ? 'bg-[#00C74D] text-black'
                  : 'text-white/50 hover:text-white/70'
              }`}
            >
              ALL
            </button>
            <button
              type="button"
              onClick={() => setTab('mine')}
              className={`flex-1 py-2 text-[10px] font-black tracking-wide rounded-full transition-all ${
                tab === 'mine'
                  ? 'bg-[#00C74D] text-black'
                  : 'text-white/50 hover:text-white/70'
              }`}
            >
              MINE
            </button>
            <button
              type="button"
              onClick={() => setTab('top')}
              className={`flex-1 py-2 text-[10px] font-black tracking-wide rounded-full transition-all ${
                tab === 'top'
                  ? 'bg-[#00C74D] text-black'
                  : 'text-white/50 hover:text-white/70'
              }`}
            >
              TOP WINS
            </button>
          </div>
        </div>

        {/* Column headers */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-2 text-[9px] font-black uppercase tracking-wider text-white/40 border-b border-white/10">
          <span>Player</span>
          <span>Bet</span>
          <span>Multiplier / Win</span>
        </div>

        {/* Bet pills list */}
        <div className="flex-1 min-h-0 w-full overflow-y-auto hide-scrollbar py-2">
          {tab === 'live' && liveRows.map((row, index) => renderBetPill(row, index))}
          {tab === 'mine' && renderUserBetHistory()}
          {tab === 'top' && renderTopWins()}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-3 py-2 border-t border-white/10">
          <div className="text-[9px] text-white/30 text-center font-bold">
            🔒 Provably Fair Gaming
          </div>
        </div>
      </div>
    </div>
  )
}
