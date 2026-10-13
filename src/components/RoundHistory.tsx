import { useState, useRef, useEffect } from 'react'
import { History, ChevronDown, X } from 'lucide-react'

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
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on click outside or escape key
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  // Past 20 rounds odds in reverse chronological order (most recent first)
  const past20 = [...history].reverse().slice(0, 20)

  return (
    <div
      ref={dropdownRef}
      className="relative shrink-0 rounded-lg border border-line bg-panel px-2 py-1.5"
      role="region"
      aria-label="Recent round results"
    >
      <div className="flex items-center justify-between gap-1.5">
        {/* Horizontal scroll of live odds chips */}
        <div className="hide-scrollbar flex flex-1 items-center gap-1.5 overflow-x-auto">
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
            <span className="px-1 py-1 text-xs text-ink-3">Waiting for rounds...</span>
          )}
        </div>

        {/* Dropdown toggle button */}
        <button
          type="button"
          onClick={() => setIsOpen(prev => !prev)}
          className={`flex shrink-0 items-center gap-1 rounded-md border border-line bg-field px-2 py-1 text-xs font-medium transition-colors ${
            isOpen ? 'border-brand/40 bg-raised text-brand' : 'text-ink-2 hover:bg-raised hover:text-ink'
          }`}
          title="Past 20 rounds history"
          aria-expanded={isOpen}
        >
          <History className="size-3.5" />
          <ChevronDown className={`size-3 transition-transform ${isOpen ? 'rotate-180 text-brand' : ''}`} />
        </button>
      </div>

      {/* Dropdown preview of past 20 rounds - compact solid design without glassmorphism or ash numbers */}
      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-72 sm:w-80 md:w-96 rounded-lg border border-line bg-panel p-2.5 shadow-xl">
          <div className="mb-2 flex items-center justify-between border-b border-line pb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-ink">Round History</span>
              <span className="rounded bg-raised px-1.5 py-0.5 text-[10px] font-semibold text-brand">
                Last 20
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded p-0.5 text-ink-3 hover:bg-field hover:text-ink"
              aria-label="Close"
            >
              <X className="size-3.5" />
            </button>
          </div>

          {past20.length === 0 ? (
            <p className="py-3 text-center text-xs text-ink-3">No rounds recorded yet</p>
          ) : (
            <div className="grid grid-cols-5 gap-1 sm:grid-cols-10">
              {past20.map((v, i) => (
                <div
                  key={i}
                  className="flex items-center justify-center rounded border border-line bg-field px-1.5 py-1 text-center transition-colors hover:bg-raised"
                >
                  <span
                    className="text-xs font-bold tabular-nums"
                    style={{ color: tierColor(v) }}
                  >
                    {v.toFixed(2)}x
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
