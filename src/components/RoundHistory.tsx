interface RoundHistoryProps {
  history: number[]
}

function getStyle(v: number): { bg: string; text: string; border: string } {
  if (v >= 5) return { bg: 'rgba(0,230,118,0.15)', text: '#00E676', border: 'rgba(0,230,118,0.4)' }
  if (v >= 1.5) return { bg: 'rgba(255,152,0,0.15)', text: '#FF9800', border: 'rgba(255,152,0,0.4)' }
  return { bg: 'rgba(233,30,99,0.18)', text: '#E91E63', border: 'rgba(233,30,99,0.4)' }
}

export function RoundHistory({ history }: RoundHistoryProps) {
  return (
    <div className="flex-shrink-0 bg-gradient-to-r from-[#0a0a0a] to-[#0d0d0d] border-b border-white/8 px-1 sm:px-2 py-1.5 sm:py-2">
      <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto hide-scrollbar">
        {[...history].reverse().map((v, i) => {
          const { bg, text, border } = getStyle(v)
          return (
            <div
              key={i}
              className="flex-shrink-0 rounded-full px-1.5 sm:px-2.5 py-0.5 sm:py-1 font-mono text-[9px] sm:text-[11px] font-bold border shadow-sm"
              style={{ backgroundColor: bg, color: text, borderColor: border }}
            >
              {v.toFixed(2)}x
            </div>
          )
        })}
        {history.length === 0 && (
          <span className="text-white/25 text-[10px] sm:text-xs italic font-medium">No rounds yet</span>
        )}
      </div>
    </div>
  )
}
