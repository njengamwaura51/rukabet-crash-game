import { useState, useCallback, useMemo } from 'react'
import { useGameState } from '@/hooks/useGameState'
import { useAuth } from '@/hooks/useAuth'
import { useBotBets } from '@/hooks/useBotBets'
import { BettingProvider } from '@/contexts/BettingContext'
import { GameCanvas } from '@/components/GameCanvas'
import { Header } from '@/components/Header'
import { RoundHistory } from '@/components/RoundHistory'
import { LiveBetsSidebar } from '@/components/LiveBetsSidebar'
import BetPanel from '@/components/BetPanel'

import { CashoutPopup } from '@/components/CashoutPopup'

export default function AviatorGame() {
  const game = useGameState()
  const auth = useAuth()
  const botBets = useBotBets(game.phase, game.multiplier)

  // Merge real shared bets with bot bets — real bets take priority
  const allLiveBets = useMemo(() => {
    const real = game.liveBets ?? []
    return [...real, ...botBets].sort((a, b) => b.bet - a.bet)
  }, [game.liveBets, botBets])
  const [activeWallet, setActiveWallet] = useState<'main' | 'bonus'>('main')
  const [cashoutPopup, setCashoutPopup] = useState<{ multiplier: number; amount: number } | null>(null)
  const [autoBetPanel1, setAutoBetPanel1] = useState(false)
  const [autoBetPanel2, setAutoBetPanel2] = useState(false)

  // Handle wallet toggle - allow switching even if locked (validation happens at bet time)
  const handleToggleWallet = useCallback((wallet: 'main' | 'bonus') => {
    if (!auth.user) return
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
      <div className="flex min-h-dvh flex-col overflow-x-clip bg-page">
        <Header
          user={auth.user}
          onLogin={auth.login}
          onRegister={auth.register}
          onLogout={auth.logout}
          onDeposit={auth.deposit}
          activeWallet={activeWallet}
        />

        <div className="flex w-full flex-1 flex-col gap-2 p-2 sm:p-3 lg:flex-row lg:items-stretch lg:gap-3 lg:h-[calc(100dvh_-_4.75rem)] lg:max-h-[calc(100dvh_-_4.75rem)] lg:overflow-hidden">
          {/* Live bets: side column on desktop */}
          <aside className="hidden h-full max-h-full w-[280px] shrink-0 flex-col overflow-hidden lg:flex xl:w-[320px]">
            <LiveBetsSidebar
              phase={game.phase}
              multiplier={game.multiplier}
              username={auth.user?.username}
              sharedBets={allLiveBets}
            />
          </aside>

          <main className="flex h-full max-h-full w-full min-w-0 max-w-full flex-1 flex-col justify-between gap-2 overflow-hidden">
            <div className="shrink-0">
              <RoundHistory history={game.roundHistory} />
            </div>

            {/* Game canvas - flexible and expansive on desktop, fits remaining vertical space */}
            <div className="relative h-[clamp(200px,32dvh,340px)] w-full shrink-0 overflow-hidden rounded-lg border border-line lg:h-auto lg:min-h-0 lg:flex-1">
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

              {cashoutPopup && (
                <CashoutPopup
                  multiplier={cashoutPopup.multiplier}
                  amount={cashoutPopup.amount}
                  onComplete={() => setCashoutPopup(null)}
                />
              )}
            </div>

            {/* Bet panels: side by side on desktop (lg+), stacked on phones */}
            <div className="grid w-full shrink-0 grid-cols-1 gap-2 lg:grid-cols-2">
              <div className="w-full min-w-0">
                <BetPanel
                  panelId={1}
                  defaultAmount={25}
                  currency="KSH"
                  gamePhase={game.phase}
                  currentMultiplier={game.multiplier}
                  isLoggedIn={auth.isLoggedIn}
                  isFreebet={isFreebet}
                  maxBalance={maxBalance}
                  freebetLocked={freebetLocked}
                  autoBetEnabled={autoBetPanel1}
                  onAutoBetToggle={setAutoBetPanel1}
                />
              </div>
              <div className="w-full min-w-0">
                <BetPanel
                  panelId={2}
                  defaultAmount={18}
                  currency="KSH"
                  gamePhase={game.phase}
                  currentMultiplier={game.multiplier}
                  isLoggedIn={auth.isLoggedIn}
                  isFreebet={isFreebet}
                  maxBalance={maxBalance}
                  freebetLocked={freebetLocked}
                  autoBetEnabled={autoBetPanel2}
                  onAutoBetToggle={setAutoBetPanel2}
                />
              </div>
            </div>

            {/* Live bets: below the panels on phones and tablets */}
            <div className="flex h-[min(26rem,60dvh)] w-full max-w-full flex-col lg:hidden">
              <LiveBetsSidebar
                phase={game.phase}
                variant="bottom"
                multiplier={game.multiplier}
                username={auth.user?.username}
                sharedBets={allLiveBets}
              />
            </div>

            <p className="shrink-0 px-1 pt-0.5 text-center text-[10px] text-ink-3">
              18+ only. Betting involves risk, so only play with money you can afford to lose.
            </p>
          </main>
        </div>
      </div>
    </BettingProvider>
  )
}
