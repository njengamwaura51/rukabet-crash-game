import { useState, useCallback } from 'react'
import { useGameState } from '@/hooks/useGameState'
import { useAuth } from '@/hooks/useAuth'
import { BettingProvider } from '@/contexts/BettingContext'
import { GameCanvas } from '@/components/GameCanvas'
import { Header } from '@/components/Header'
import { RoundHistory } from '@/components/RoundHistory'
import { LiveBetsSidebar } from '@/components/LiveBetsSidebar'
import BetPanel from '@/components/BetPanel'
import HybridBotPanel from '@/components/HybridBotPanel'
import { CashoutPopup } from '@/components/CashoutPopup'

export default function AviatorGame() {
  const game = useGameState()
  const auth = useAuth()
  const [activeWallet, setActiveWallet] = useState<'main' | 'bonus'>('main')
  const [cashoutPopup, setCashoutPopup] = useState<{ multiplier: number; amount: number } | null>(null)
  const [autoBetPanel1, setAutoBetPanel1] = useState(false)
  const [autoBetPanel2, setAutoBetPanel2] = useState(false)

  // Handle wallet toggle
  const handleToggleWallet = useCallback((wallet: 'main' | 'bonus') => {
    if (!auth.user) return
    if (wallet === 'bonus' && auth.user.freebetLocked) return
    setActiveWallet(wallet)
  }, [auth.user])

  // Balance change callback for BettingProvider
  const handleBalanceChange = useCallback((delta: number, isFreebet: boolean) => {
    if (delta > 0) {
      auth.updateBalance(delta, isFreebet)
    } else {
      // Deduct (delta is negative)
      auth.updateBalance(delta, isFreebet)
      // Mark as played if using real money
      if (!isFreebet) {
        auth.markPlayedWithMoney()
      }
    }
  }, [auth])

  // Cashout success callback
  const handleCashoutSuccess = useCallback((wonAmount: number, multiplier: number) => {
    setCashoutPopup({ multiplier, amount: wonAmount })
  }, [])

  // Determine bet mode based on active wallet
  const betMode = activeWallet === 'bonus' ? 'freebet' : 'money'
  const isFreebet = activeWallet === 'bonus'
  const displayBalance = auth.user?.balance ?? 0
  const displayFreebet = auth.user?.freebet ?? 0
  const freebetLocked = auth.user?.freebetLocked ?? true
  const maxBalance = isFreebet ? displayFreebet : displayBalance

  return (
    <BettingProvider
      gamePhase={game.phase}
      currentMultiplier={game.multiplier}
      onBalanceChange={handleBalanceChange}
      onCashoutSuccess={handleCashoutSuccess}
    >
      <div className="min-h-screen bg-[#0b0e11] flex flex-col overflow-x-hidden">
        {/* Header with dynamic wallet display */}
        <Header 
          user={auth.user}
          onLogin={auth.login}
          onRegister={auth.register}
          onLogout={auth.logout}
          onDeposit={auth.deposit}
          activeWallet={activeWallet}
        />

        {/* Body: sidebar + main game - responsive layout */}
        <div className="flex flex-col lg:flex-row flex-1 overflow-y-auto lg:overflow-hidden w-full">

          {/* Left sidebar: live bets — desktop only (lg+) - fixed width */}
          <aside className="hidden lg:flex flex-shrink-0 w-[320px] xl:w-[350px] h-full">
            <LiveBetsSidebar 
              phase={game.phase} 
              multiplier={game.multiplier}
              username={auth.user?.username}
            />
          </aside>

          {/* Main column: history + canvas + bet panels */}
          <main className="flex flex-col flex-1 min-w-0 w-full p-2 lg:pl-0 gap-2 max-w-full">

            {/* Multiplier history bar */}
            <RoundHistory history={game.roundHistory} />

            {/* Game canvas - constrained height on all screen sizes */}
            <div className="flex-shrink-0 h-[200px] sm:h-[240px] md:h-[280px] lg:h-[320px] xl:h-[360px] relative w-full max-w-full">
              <GameCanvas
                phase={game.phase}
                multiplier={game.multiplier}
                crashPoint={game.crashPoint}
                waitProgress={game.waitProgress}
                elapsedMs={game.elapsedMs}
                plane={game.plane}
                betMode={betMode}
                onToggleBetMode={() => handleToggleWallet(activeWallet === 'main' ? 'bonus' : 'main')}
                freebetLocked={freebetLocked}
                freebetAmount={displayFreebet}
              />
              
              {/* Cashout popup overlay */}
              {cashoutPopup && (
                <CashoutPopup
                  multiplier={cashoutPopup.multiplier}
                  amount={cashoutPopup.amount}
                  onComplete={() => setCashoutPopup(null)}
                />
              )}
            </div>

            {/* Bet panels — stacked on mobile, side by side on xl+ */}
            <div className="flex-shrink-0 flex flex-col xl:flex-row w-full gap-2 max-w-full">
              <div className="w-full max-w-full">
                <BetPanel 
                  panelId={1}
                  defaultAmount={25} 
                  currency="KSH" 
                  gamePhase={game.phase}
                  currentMultiplier={game.multiplier}
                  isLoggedIn={auth.isLoggedIn}
                  isFreebet={isFreebet}
                  maxBalance={maxBalance}
                  autoBetEnabled={autoBetPanel1}
                  onAutoBetToggle={setAutoBetPanel1}
                />
              </div>
              <div className="w-full max-w-full">
                <BetPanel 
                  panelId={2}
                  defaultAmount={18} 
                  currency="KSH"
                  gamePhase={game.phase}
                  currentMultiplier={game.multiplier}
                  isLoggedIn={auth.isLoggedIn}
                  isFreebet={isFreebet}
                  maxBalance={maxBalance}
                  autoBetEnabled={autoBetPanel2}
                  onAutoBetToggle={setAutoBetPanel2}
                />
              </div>
            </div>

            {/* Hybrid Bot Panel */}
            <div className="flex-shrink-0 w-full max-w-full">
              <HybridBotPanel
                panelId={3}
                gamePhase={game.phase}
                currentMultiplier={game.multiplier}
                isLoggedIn={auth.isLoggedIn}
                isFreebet={isFreebet}
                maxBalance={maxBalance}
                currency="KSH"
              />
            </div>

            {/* Live bets — mobile/tablet only (below lg), at bottom */}
            <div className="flex-shrink-0 min-h-[180px] lg:hidden w-full max-w-full">
              <LiveBetsSidebar 
                phase={game.phase} 
                variant="bottom" 
                multiplier={game.multiplier}
                username={auth.user?.username}
              />
            </div>
          </main>
        </div>
      </div>
    </BettingProvider>
  )
}
