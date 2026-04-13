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
    // Start animation sequence
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
    <div className="absolute inset-0 flex items-start justify-center pt-16 pointer-events-none z-50">
      <div
        className={`
          bg-black/85 backdrop-blur-sm rounded-full px-6 py-3 
          flex flex-col items-center gap-0.5
          border border-[#00C74D]/30
          shadow-xl shadow-[#00C74D]/20
          transform transition-all duration-220 ease-out
          ${animClasses[animState]}
        `}
      >
        <span className="text-white/80 text-xs font-bold tracking-wide">You Cashed Out!</span>
        <span className="text-white text-2xl font-black">{multiplier.toFixed(2)}x</span>
        <span className="text-[#00C74D] text-sm font-black tracking-wide">
          WON {amount.toLocaleString()} {currency}
        </span>
      </div>
    </div>
  )
}
