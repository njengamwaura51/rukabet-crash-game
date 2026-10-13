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
  avatar?: string
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

// User avatar: initial, custom colour, or image URL
function UserAvatar({ name, isUser, color }: { name: string; isUser?: boolean; color?: string }) {
  if (color && (color.startsWith('http') || color.startsWith('/'))) {
    return <img src={color} alt="" className="size-6 shrink-0 rounded-full bg-raised" />
  }

  return (
    <div
      className={`flex size-6 shrink-0 items-center justify-center rounded-full ${
        isUser ? 'bg-brand text-brand-ink' : 'bg-raised text-ink-2'
      }`}
      style={!isUser && color ? { backgroundColor: color, color: '#fff' } : undefined}
    >
      <span className="text-[11px] font-semibold">{name.charAt(0).toUpperCase()}</span>
    </div>
  )
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex h-32 flex-col items-center justify-center px-4 text-center">
      <span className="text-sm font-medium text-ink-2">{title}</span>
      <span className="mt-1 text-xs text-ink-3">{hint}</span>
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

  // Count of total bets
  const betCount = liveRows.length

  const ROW = 'flex items-center gap-2 border-b border-line/70 px-3 py-2 text-[13px] last:border-b-0'

  // Render a single bet row
  const renderBetPill = (row: LiveBet, index: number) => {
    const hasWon = row.cashout !== null
    const badgeColor = hasWon ? getOddsBadgeColor(row.cashout!) : null

    return (
      <div
        key={`${row.id}-${index}`}
        className={`${ROW} ${hasWon ? 'bg-brand/[0.07]' : ''} ${row.isUser ? 'border-l-2 border-l-brand' : ''}`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <UserAvatar name={row.user} isUser={row.isUser} color={row.avatar} />
          <span className={`truncate font-medium ${row.isUser ? 'text-brand' : 'text-ink'}`}>{row.user}</span>
        </div>

        <span className="shrink-0 tabular-nums text-ink-2">{row.bet.toLocaleString()}</span>

        <div className="flex min-w-[6.5rem] shrink-0 items-center justify-end gap-2">
          {hasWon && badgeColor ? (
            <>
              <span
                className="rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums"
                style={{ backgroundColor: badgeColor, color: '#000' }}
              >
                {row.cashout!.toFixed(2)}x
              </span>
              <span className="font-semibold tabular-nums text-brand">{row.won?.toLocaleString()}</span>
            </>
          ) : (
            <span className="text-ink-3">–</span>
          )}
        </div>
      </div>
    )
  }

  // Render the signed-in user's bet history
  const renderUserBetHistory = () => {
    if (userBetHistory.length === 0) {
      return <EmptyState title="No bets yet" hint="Your bets will show up here" />
    }

    return (
      <div>
        {userBetHistory.map((bet, index) => {
          const hasWon = bet.cashoutMultiplier !== null
          const badgeColor = hasWon ? getOddsBadgeColor(bet.cashoutMultiplier!) : '#ff5c6c'

          return (
            <div key={`${bet.id}-${index}`} className={`${ROW} ${hasWon ? 'bg-brand/[0.07]' : ''}`}>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <UserAvatar name={username} isUser />
                <div className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate font-medium text-brand">{username}</span>
                  {bet.isFreebet && <span className="text-[11px] font-medium text-bonus">Freebet</span>}
                </div>
              </div>

              <span className="shrink-0 tabular-nums text-ink-2">{bet.amount.toLocaleString()}</span>

              <div className="flex min-w-[6.5rem] shrink-0 items-center justify-end gap-2">
                <span
                  className="rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums"
                  style={{ backgroundColor: badgeColor, color: '#000' }}
                >
                  {hasWon ? `${bet.cashoutMultiplier!.toFixed(2)}x` : 'Lost'}
                </span>
                <span className={`font-semibold tabular-nums ${hasWon ? 'text-brand' : 'text-loss'}`}>
                  {hasWon ? `+${bet.won?.toLocaleString()}` : `-${bet.amount.toLocaleString()}`}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const renderTopWins = () => (
    <EmptyState title="Top wins are coming soon" hint="The leaderboard will appear here" />
  )

  const tabs: { id: SidebarTab; label: string }[] = [
    { id: 'live', label: 'All bets' },
    { id: 'mine', label: 'My bets' },
    { id: 'top', label: 'Top wins' },
  ]

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-lg border border-line bg-panel">
      {/* Tabs */}
      <div className="shrink-0 p-2">
        <div role="tablist" aria-label="Bets" className="flex rounded-md bg-field p-0.5">
          {tabs.map(t => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded text-[13px] font-medium transition-colors ${
                tab === t.id ? 'bg-raised text-ink' : 'text-ink-3 hover:text-ink-2'
              }`}
            >
              {t.label}
              {t.id === 'live' && betCount > 0 && (
                <span className="text-xs tabular-nums text-ink-3">{betCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Column headers */}
      <div className="flex shrink-0 items-center gap-2 border-y border-line px-3 py-1.5 text-xs text-ink-3">
        <span className="flex-1">Player</span>
        <span>Bet</span>
        <span className="min-w-[6.5rem] text-right">Cash out</span>
      </div>

      {/* Rows */}
      <div role="tabpanel" className="live-bets-scroll min-h-0 w-full flex-1 overflow-y-auto">
        {tab === 'live' && (
          liveRows.length > 0
            ? liveRows.map((row, index) => renderBetPill(row, index))
            : <EmptyState title="Waiting for bets" hint="Place a bet to get started" />
        )}
        {tab === 'mine' && renderUserBetHistory()}
        {tab === 'top' && renderTopWins()}
      </div>

      <div className="shrink-0 border-t border-line px-3 py-2 text-center text-xs text-ink-3">
        Provably fair • 18+ Play responsibly
      </div>
    </div>
  )
}
