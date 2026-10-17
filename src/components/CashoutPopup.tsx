import { useEffect, useState } from 'react'

interface CashoutPopupProps {
  multiplier: number
  amount: number
  currency?: string
  onComplete?: () => void
}

export function CashoutPopup({ multiplier, amount, currency = 'KSH', onComplete }: CashoutPopupProps) {
  const [visible, setVisible] = useState(true)
  const [animState, setAnimState] = useState<'enter' | 'float' | 'exit'>('enter')

  useEffect(() => {
    const enterTimer = setTimeout(() => setAnimState('float'), 30)
    const floatTimer = setTimeout(() => setAnimState('exit'), 800)
    const exitTimer = setTimeout(() => {
      setVisible(false)
      onComplete?.()
    }, 1000)

    return () => {
      clearTimeout(enterTimer)
      clearTimeout(floatTimer)
      clearTimeout(exitTimer)
    }
  }, [onComplete])

  if (!visible) return null

  const animClasses = {
    enter: 'scale-75 opacity-0 translate-y-2',
    float: 'scale-100 opacity-100 translate-y-0',
    exit: 'scale-90 opacity-0 -translate-y-4',
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex items-start justify-center pt-8 sm:pt-10">
      <div
        role="status"
        className={`flex items-center gap-3 rounded-full border border-brand/50 bg-page/95 backdrop-blur-sm px-4 py-1.5 shadow-lg transition-all duration-200 ease-out ${animClasses[animState]}`}
      >
        <span className="text-xs font-medium text-ink-2">Cashed out</span>
        <span className="text-base sm:text-lg font-bold tabular-nums text-ink">{multiplier.toFixed(2)}x</span>
        <span className="text-xs sm:text-sm font-bold tabular-nums text-brand">
          +{amount.toLocaleString()} {currency}
        </span>
      </div>
    </div>
  )
}
