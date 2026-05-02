interface RoundHistoryProps {
  history: number[]
}

function getStyle(v: number): { bg: string; text: string; border: string } {
  if (v >= 10) return { bg: 'rgba(168,85,247,0.18)', text: '#C084FC', border: 'rgba(168,85,247,0.35)' }
  if (v >= 5) return { bg: 'rgba(0,230,118,0.12)', text: '#00E676', border: 'rgba(0,230,118,0.30)' }
  if (v >= 2) return { bg: 'rgba(59,130,246,0.12)', text: '#60A5FA', border: 'rgba(59,130,246,0.30)' }
  if (v >= 1.5) return { bg: 'rgba(255,152,0,0.12)', text: '#FFB74D', border: 'rgba(255,152,0,0.30)' }
  return { bg: 'rgba(233,30,99,0.12)', text: '#F06292', border: 'rgba(233,30,99,0.30)' }
}

export function RoundHistory({ history }: RoundHistoryProps) {
  return (
    <div className="flex-shrink-0 bg-[#0a0a0a]/80 backdrop-blur-sm border-b border-white/[0.04] px-1.5 sm:px-2.5 py-1.5 sm:py-2">
      <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto hide-scrollbar">
        {[...history].reverse().map((v, i) => {
          const { bg, text, border } = getStyle(v)
          return (
            <div
              key={i}
              className="flex-shrink-0 rounded-full px-2 sm:px-3 py-0.5 sm:py-1 font-mono text-[9px] sm:text-[11px] font-black border backdrop-blur-sm transition-all duration-200 hover:scale-105"
              style={{ backgroundColor: bg, color: text, borderColor: border }}
            >
              {v.toFixed(2)}x
            </div>
          )
        })}
        {history.length === 0 && (
          <span className="text-white/20 text-[10px] sm:text-xs italic font-medium">No rounds yet</span>
        )}
      </div>
    </div>
  )
}
