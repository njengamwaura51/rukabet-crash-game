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

type Wallet = 'main' | 'bonus'

export default function AviatorGame() {
  const game = useGameState()
  const auth = useAuth()
  const botBets = useBotBets(game.phase, game.multiplier)

  // Merge real shared bets with bot bets. Real bets come first, then sort by stake.
  const allLiveBets = useMemo(() => {
    const real = game.liveBets ?? []
    return [...real, ...botBets].sort((a, b) => b.bet - a.bet)
  }, [game.liveBets, botBets])

  const [activeWallet, setActiveWallet] = useState<Wallet>('main')
  const [cashoutPopup, setCashoutPopup] = useState<{ multiplier: number; amount: number } | null>(null)
  const [autoBetPanel1, setAutoBetPanel1] = useState(false)
  const [autoBetPanel2, setAutoBetPanel2] = useState(false)

  // Wallet switching is always allowed; lock rules are enforced at bet time.
  const handleToggleWallet = useCallback((wallet: Wallet) => {
    if (!auth.user) return
    setActiveWallet(wallet)
  }, [auth.user])

  const handleBalanceChange = useCallback((delta: number, isFreebet: boolean) => {
    auth.updateBalance(delta, isFreebet)
    if (delta < 0 && !isFreebet) {
      auth.markPlayedWithMoney()
    }
  }, [auth])

  const handleCashoutSuccess = useCallback((wonAmount: number, multiplier: number) => {
    setCashoutPopup({ multiplier, amount: wonAmount })
  }, [])

  const isFreebet = activeWallet === 'bonus'
  const betMode = isFreebet ? 'freebet' : 'money'
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

        <div className="flex w-full flex-1 flex-col gap-2 p-2 sm:p-3 lg:flex-row lg:items-start lg:gap-3">
          {/* Live bets ledger: side column on desktop */}
          <aside className="sticky top-[4.25rem] hidden h-[calc(100dvh_-_5.5rem)] max-h-[calc(100dvh_-_5.5rem)] w-[300px] shrink-0 flex-col lg:flex xl:w-[340px]">
            <LiveBetsSidebar
              phase={game.phase}
              multiplier={game.multiplier}
              username={auth.user?.username}
              sharedBets={allLiveBets}
            />
          </aside>

          <main className="flex w-full min-w-0 max-w-full flex-1 flex-col gap-2">
            <RoundHistory history={game.roundHistory} />

            {/* Flight canvas. Dominates the phone viewport; on desktop it grows so the
                bet terminals bottom-align with the ledger column. */}
            <div className="plane-canvas-panel relative h-[clamp(200px,32dvh,380px)] w-full shrink-0 overflow-hidden rounded-lg border border-line bg-panel lg:h-[calc(100dvh_-_19.25rem)] lg:min-h-[320px]">
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

            {/* Dual bet terminals: side by side from lg, stacked on phones */}
            <div className="grid w-full max-w-full shrink-0 grid-cols-1 gap-2 lg:grid-cols-2">
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

            {/* Live bets ledger: below the terminals on phones and tablets */}
            <div className="flex h-[min(26rem,60dvh)] w-full max-w-full flex-col lg:hidden">
              <LiveBetsSidebar
                phase={game.phase}
                variant="bottom"
                multiplier={game.multiplier}
                username={auth.user?.username}
                sharedBets={allLiveBets}
              />
            </div>

            <p className="px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 text-center text-[11px] text-ink-3 lg:hidden">
              18+ only. Play responsibly.
            </p>
          </main>
        </div>
      </div>
    </BettingProvider>
  )
}
