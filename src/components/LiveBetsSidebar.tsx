import { useMemo, useState } from 'react'
import type { LiveBet, Phase } from '@/hooks/useGameState'

interface LiveBetsSidebarProps {
  phase: Phase
  multiplier: number
  username?: string
  sharedBets?: LiveBet[]
  variant?: 'sidebar' | 'bottom'
}

type TabType = 'all' | 'my' | 'top'

const TABS: { id: TabType; label: string }[] = [
  { id: 'all', label: 'All Bets' },
  { id: 'my', label: 'My Bets' },
  { id: 'top', label: 'Top' },
]

// Shared column template so header and rows stay pixel-aligned.
const ROW_GRID = 'grid grid-cols-[minmax(0,1fr)_64px_64px_72px] gap-2 px-3 py-1.5'

const formatAmount = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 0 })

export function LiveBetsSidebar({ username, sharedBets = [], variant = 'sidebar' }: LiveBetsSidebarProps) {
  const [activeTab, setActiveTab] = useState<TabType>('all')

  const totalBetsCount = sharedBets.length
  const totalBetAmount = useMemo(
    () => sharedBets.reduce((sum, b) => sum + (b.bet || 0), 0),
    [sharedBets]
  )

  const myBets = useMemo(() => {
    if (!username) return []
    return sharedBets.filter((b) => b.user === username)
  }, [sharedBets, username])

  const topBets = useMemo(
    () =>
      [...sharedBets]
        .filter((b) => (b.cashedOut && b.win && b.win > 0) || b.bet >= 500)
        .sort((a, b) => (b.win || b.bet) - (a.win || a.bet))
        .slice(0, 30),
    [sharedBets]
  )

  const displayedBets = activeTab === 'all' ? sharedBets : activeTab === 'my' ? myBets : topBets
  const tabCounts: Partial<Record<TabType, number>> = { all: totalBetsCount, my: myBets.length }

  const emptyMessage =
    activeTab === 'my'
      ? username
        ? 'No bets this round'
        : 'Log in to track your bets'
      : 'Waiting for bets'

  const isBottom = variant === 'bottom'

  return (
    <div
      className={`flex h-full flex-col overflow-hidden bg-panel ${
        isBottom ? 'border-t border-line' : 'rounded-lg border border-line'
      }`}
    >
      {/* Segmented tab bar */}
      <div className="grid grid-cols-3 gap-1 border-b border-line bg-field p-1">
        {TABS.map((tab) => {
          const active = activeTab === tab.id
          const count = tabCounts[tab.id]
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-pressed={active}
              className={`flex h-7 items-center justify-center gap-1.5 rounded text-xs font-semibold transition-colors ${
                active ? 'bg-raised text-ink' : 'text-ink-3 hover:text-ink'
              }`}
            >
              {tab.label}
              {count !== undefined && (
                <span className={`tabular-nums ${active ? 'text-ink-2' : 'text-ink-3'}`}>{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Round totals */}
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5 text-[11px] font-medium text-ink-3">
        <span>
          Total{' '}
          <span className="tabular-nums text-ink-2">KSH {formatAmount(totalBetAmount)}</span>
        </span>
        <span>
          <span className="tabular-nums text-ink-2">{totalBetsCount}</span> players
        </span>
      </div>

      {/* Column headers */}
      <div className={`${ROW_GRID} border-b border-line text-[10px] font-semibold uppercase tracking-wide text-ink-3`}>
        <span>Player</span>
        <span className="text-right">Bet</span>
        <span className="text-right">×</span>
        <span className="text-right">Win</span>
      </div>

      {/* Rows */}
      <div className="live-bets-scroll flex-1 divide-y divide-line/30 overflow-y-auto overscroll-contain">
        {displayedBets.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-ink-3">{emptyMessage}</div>
        ) : (
          displayedBets.map((b) => {
            const hasCashed = b.cashedOut
            const wonAmount = b.win || (hasCashed && b.cashOut ? b.bet * b.cashOut : 0)

            return (
              <div
                key={b.id || `${b.user}-${b.bet}`}
                className={`${ROW_GRID} items-center text-xs ${hasCashed ? 'bg-brand/5' : ''}`}
              >
                <span className="truncate font-medium text-ink">{b.user}</span>
                <span className="text-right tabular-nums text-ink">{formatAmount(b.bet)}</span>
                <span className="text-right tabular-nums">
                  {hasCashed && b.cashOut ? (
                    <span className="inline-block rounded bg-brand/10 px-1.5 py-0.5 text-[11px] font-bold leading-none text-brand">
                      {b.cashOut.toFixed(2)}x
                    </span>
                  ) : (
                    <span className="text-ink-3">—</span>
                  )}
                </span>
                <span className={`text-right font-semibold tabular-nums ${hasCashed ? 'text-brand' : 'text-ink-3'}`}>
                  {hasCashed ? formatAmount(wonAmount) : '—'}
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
