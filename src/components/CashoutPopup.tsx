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
    const enterTimer = setTimeout(() => setAnimState('float'), 40)
    const floatTimer = setTimeout(() => setAnimState('exit'), 700)
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
    enter: 'scale-50 opacity-0 translate-y-4',
    float: 'scale-100 opacity-100 translate-y-0',
    exit: 'scale-75 opacity-0 -translate-y-8',
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex items-start justify-center pt-14">
      <div
        role="status"
        className={`flex flex-col items-center gap-0.5 rounded-lg border border-brand/40 bg-page px-6 py-3 shadow-md transition-all duration-200 ease-out ${animClasses[animState]}`}
      >
        <span className="text-sm text-ink-2">You cashed out</span>
        <span className="text-3xl font-bold tabular-nums text-ink">{multiplier.toFixed(2)}x</span>
        <span className="text-base font-semibold tabular-nums text-brand">
          Won {amount.toLocaleString()} {currency}
        </span>
      </div>
    </div>
  )
}
