export type GamePhase = "waiting" | "flying" | "crashed";

export interface Bet {
  id: string;
  amount: number;
  autoCashOut: number | null;
  cashedOut: boolean;
  cashedOutAt: number | null;
  profit: number;
}

export interface PlayerBet {
  id: string;
  name: string;
  avatar: string;
  amount: number;
  cashedOut: boolean;
  cashedOutAt: number | null;
}

export interface HistoryEntry {
  multiplier: number;
  timestamp: number;
}

export function generateCrashPoint(): number {
  const rand = Math.random();
  if (rand < 0.01) return 1.0;
  const crashPoint = Math.max(1.0, 0.99 / (1 - rand));
  return Math.round(crashPoint * 100) / 100;
}

export function getMultiplierColor(multiplier: number): string {
  if (multiplier < 1.5) return "#ef4444";
  if (multiplier < 2.0) return "#f97316";
  if (multiplier < 5.0) return "#22c55e";
  if (multiplier < 10.0) return "#3b82f6";
  return "#a855f7";
}

export function getMultiplierBgClass(multiplier: number): string {
  if (multiplier < 1.5) return "bg-red-500/20 text-red-400 border-red-500/30";
  if (multiplier < 2.0) return "bg-orange-500/20 text-orange-400 border-orange-500/30";
  if (multiplier < 5.0) return "bg-[#00C74D]/20 text-[#00C74D] border-[#00C74D]/30";
  if (multiplier < 10.0) return "bg-blue-500/20 text-blue-400 border-blue-500/30";
  return "bg-purple-500/20 text-purple-400 border-purple-500/30";
}

const PLAYER_NAMES = [
  "Akpos", "Maria", "John", "Fatima", "James", "Amara", "David", "Chioma",
  "Emmanuel", "Adaeze", "Michael", "Blessing", "Samuel", "Grace", "Daniel",
  "Victoria", "Peter", "Faith", "Joseph", "Mercy", "Paul", "Joy", "Philip",
  "Esther", "Patrick", "Comfort", "Sunday", "Peace", "Monday", "Praise"
];

const AVATARS = ["🎮", "🎯", "🚀", "💎", "⚡", "🔥", "🌟", "💰", "🎲", "🏆"];

export function generateSimulatedPlayers(count: number): PlayerBet[] {
  const players: PlayerBet[] = [];
  for (let i = 0; i < count; i++) {
    const name = PLAYER_NAMES[Math.floor(Math.random() * PLAYER_NAMES.length)];
    players.push({
      id: `player-${i}-${Date.now()}`,
      name: `${name}${Math.floor(Math.random() * 99) + 1}`,
      avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
      amount: parseFloat((Math.random() * 4800 + 200).toFixed(2)),
      cashedOut: false,
      cashedOutAt: null,
    });
  }
  return players;
}

export function computeMultiplier(elapsedMs: number): number {
  const t = elapsedMs / 1000;
  const raw = Math.pow(Math.E, 0.06 * t);
  return Math.round(raw * 100) / 100;
}
