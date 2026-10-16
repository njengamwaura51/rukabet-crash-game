import { useMemo, useState } from 'react'
import type { LiveBet, Phase } from '@/hooks/useGameState'

interface LiveBetsSidebarProps {
  phase: Phase
  multiplier: number
  username?: string
  sharedBets?: LiveBet[]
  variant?: 'sidebar' | 'bottom'
}

type TabType = 'all' | 'my'

const TABS: { id: TabType; label: string }[] = [
  { id: 'all', label: 'Live Bets' },
  { id: 'my', label: 'My Bets' },
]

// Grid matching reference layout: User | Bet KSH | Cashout | Won KSH
const ROW_GRID = 'grid grid-cols-[minmax(0,1fr)_76px_68px_80px] items-center gap-1.5'

function getOddsTierColor(v: number): string {
  if (v >= 10) return '#c084fc'
  if (v >= 5) return '#00e676'
  if (v >= 2) return '#60a5fa'
  if (v >= 1.5) return '#ffb74d'
  return '#f06292'
}

const formatNumber = (value: number) => value.toFixed(2)

export function LiveBetsSidebar({ username, sharedBets = [], variant = 'sidebar' }: LiveBetsSidebarProps) {
  const [activeTab, setActiveTab] = useState<TabType>('all')

  const myBets = useMemo(() => {
    if (!username) return []
    return sharedBets.filter((b) => b.user === username)
  }, [sharedBets, username])

  const displayedBets = activeTab === 'all' ? sharedBets : myBets

  const emptyMessage =
    activeTab === 'my'
      ? username
        ? 'No bets placed this round'
        : 'Log in to track your bets'
      : 'Waiting for bets'

  const isBottom = variant === 'bottom'

  return (
    <div
      className={`flex h-full flex-col overflow-hidden bg-[#121316] ${
        isBottom ? 'border-t border-[#1d1f25]' : 'rounded-lg border border-[#1d1f25]'
      }`}
    >
      {/* Pill tabs matching reference design */}
      <div className="p-2 border-b border-[#1d1f25] bg-[#141518]">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-[#1c1e23] p-1">
          {TABS.map((tab) => {
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                aria-pressed={active}
                className={`flex h-8 items-center justify-center rounded-md text-xs font-bold transition-all ${
                  active
                    ? 'bg-[#00eb5b] text-[#091e0f] shadow-sm'
                    : 'text-[#8c939e] hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Column headers matching reference screenshot */}
      <div className={`${ROW_GRID} px-3 py-2 border-b border-[#1d1f25] text-[11px] font-semibold text-[#8c939e]`}>
        <span>User</span>
        <span className="text-right">Bet KSH</span>
        <span className="text-center">Cashout</span>
        <span className="text-right">Won KSH</span>
      </div>

      {/* Bets list with avatar DPs and green-capsule cashed out rows */}
      <div className="live-bets-scroll flex-1 overflow-y-auto overscroll-contain p-2 space-y-1">
        {displayedBets.length === 0 ? (
          <div className="px-3 py-10 text-center text-xs text-[#8c939e]">{emptyMessage}</div>
        ) : (
          displayedBets.map((b) => {
            const co = b.cashout ?? b.cashOut
            const hasCashed = Boolean(b.cashedOut || (co !== null && co !== undefined && co > 0))
            const rawWon = b.won ?? b.win
            const wonAmount = rawWon && rawWon > 0 ? rawWon : (hasCashed && co ? b.bet * co : 0)
            const avatarUrl = b.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(b.user)}`

            return (
              <div
                key={b.id || `${b.user}-${b.bet}`}
                className={`${ROW_GRID} px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                  hasCashed
                    ? 'border border-[#14a34d] bg-[#0d4624]/85 text-white shadow-sm'
                    : 'border border-[#202228] bg-[#16181b] text-white/90'
                }`}
              >
                {/* User avatar + masked username without leading letters */}
                <div className="flex items-center gap-2 min-w-0">
                  <img
                    src={avatarUrl}
                    alt=""
                    className="size-6 shrink-0 rounded-full object-cover bg-black/40 border border-black/40"
                    loading="lazy"
                    onError={(e) => {
                      // Fallback to simple colored dot if external SVG fails
                      ;(e.currentTarget as HTMLElement).style.display = 'none'
                    }}
                  />
                  <span className="truncate font-medium text-white text-[12px]">{b.user}</span>
                </div>

                {/* Bet amount with 2 decimal places */}
                <span className="text-right tabular-nums text-white/90 font-medium text-[12px]">
                  {formatNumber(b.bet)}
                </span>

                {/* Cashout pill badge */}
                <div className="flex items-center justify-center">
                  {hasCashed && co ? (
                    <span
                      className="inline-flex items-center justify-center rounded-md bg-[#0c0d10] px-2 py-0.5 text-[11px] font-bold tabular-nums shadow-sm"
                      style={{ color: getOddsTierColor(co) }}
                    >
                      {co.toFixed(2)}x
                    </span>
                  ) : null}
                </div>

                {/* Won amount */}
                <span className="text-right tabular-nums font-semibold text-white text-[12px]">
                  {hasCashed && wonAmount > 0 ? formatNumber(wonAmount) : null}
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
