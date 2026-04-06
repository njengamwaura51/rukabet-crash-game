import { PlayerBet } from "@/lib/gameEngine";

interface LiveBetsProps {
  playerBets: PlayerBet[];
  multiplier: number;
}

export function LiveBets({ playerBets, multiplier }: LiveBetsProps) {
  const sorted = [...playerBets].sort((a, b) => {
    if (a.cashedOut && !b.cashedOut) return -1;
    if (!a.cashedOut && b.cashedOut) return 1;
    return b.amount - a.amount;
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
        <span className="text-xs text-white/50 uppercase tracking-wider font-medium">Players</span>
        <span className="text-xs text-white/30">{playerBets.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left px-3 py-1.5 text-white/30 font-medium">Player</th>
              <th className="text-right px-3 py-1.5 text-white/30 font-medium">Bet</th>
              <th className="text-right px-3 py-1.5 text-white/30 font-medium">Cash out</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(p => (
              <tr key={p.id} className={`border-b border-white/3 transition-colors ${p.cashedOut ? "bg-[#00C74D]/5" : ""}`}>
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{p.avatar}</span>
                    <span className={`font-medium truncate max-w-[80px] ${p.cashedOut ? "text-[#00C74D]" : "text-white/70"}`}>
                      {p.name}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-1.5 text-right text-white/60">
                  {p.amount.toFixed(2)}
                </td>
                <td className="px-3 py-1.5 text-right">
                  {p.cashedOut && p.cashedOutAt ? (
                    <span className="text-[#00C74D] font-bold">
                      {(p.amount * p.cashedOutAt).toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-white/20">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
