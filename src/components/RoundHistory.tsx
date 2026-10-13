interface RoundHistoryProps {
  history: number[]
}

// Text colour carries the result tier; the chip itself stays neutral.
function tierColor(v: number): string {
  if (v >= 10) return '#c084fc'
  if (v >= 5) return '#00e676'
  if (v >= 2) return '#60a5fa'
  if (v >= 1.5) return '#ffb74d'
  return '#f06292'
}

export function RoundHistory({ history }: RoundHistoryProps) {
  return (
    <div
      className="shrink-0 rounded-lg border border-line bg-panel px-2 py-1.5"
      role="list"
      aria-label="Recent round results"
    >
      <div className="hide-scrollbar flex items-center gap-1.5 overflow-x-auto">
        {[...history].reverse().map((v, i) => (
          <span
            key={i}
            role="listitem"
            className="shrink-0 rounded-md bg-field px-2.5 py-1 text-xs font-semibold tabular-nums"
            style={{ color: tierColor(v) }}
          >
            {v.toFixed(2)}x
          </span>
        ))}
        {history.length === 0 && (
          <span className="px-1 py-1 text-xs text-ink-3">No rounds yet</span>
        )}
      </div>
    </div>
  )
}
