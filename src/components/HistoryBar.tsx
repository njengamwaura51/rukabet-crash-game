import { HistoryEntry, getMultiplierBgClass } from "@/lib/gameEngine";

interface HistoryBarProps {
  history: HistoryEntry[];
}

export function HistoryBar({ history }: HistoryBarProps) {
  if (history.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 px-2">
      {history.map((h, i) => (
        <div
          key={h.timestamp}
          className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-bold border ${getMultiplierBgClass(h.multiplier)} fade-in`}
        >
          {h.multiplier.toFixed(2)}x
        </div>
      ))}
    </div>
  );
}
