import type { IconId } from "./icons";

export interface Game {
  id: string;
  title: string;
  category: string;
  players: string;
  gradient: string;
  icon: IconId;
  featured?: boolean;
}

export const GAMES: Game[] = [
  {
    id: "aviator",
    title: "Aviator",
    category: "Crash",
    players: "12.4k playing",
    gradient: "from-red-600 to-orange-500",
    icon: "aviator",
    featured: true,
  },
  {
    id: "spin2win",
    title: "Spin2Win",
    category: "Slots",
    players: "8.2k playing",
    gradient: "from-purple-600 to-pink-500",
    icon: "spin2win",
    featured: true,
  },
  {
    id: "virtual-football",
    title: "Virtual Football",
    category: "Virtual",
    players: "5.1k playing",
    gradient: "from-emerald-600 to-teal-500",
    icon: "virtual-football",
    featured: true,
  },
  {
    id: "lucky-dice",
    title: "Lucky Dice",
    category: "Dice",
    players: "3.8k playing",
    gradient: "from-blue-600 to-cyan-500",
    icon: "lucky-dice",
  },
  {
    id: "roulette",
    title: "Roulette",
    category: "Table",
    players: "2.9k playing",
    gradient: "from-green-700 to-emerald-600",
    icon: "roulette",
  },
  {
    id: "blackjack",
    title: "Blackjack",
    category: "Cards",
    players: "1.7k playing",
    gradient: "from-slate-700 to-slate-900",
    icon: "blackjack",
  },
  {
    id: "keno",
    title: "Keno",
    category: "Numbers",
    players: "4.3k playing",
    gradient: "from-amber-600 to-yellow-500",
    icon: "keno",
  },
  {
    id: "wheel-of-fortune",
    title: "Wheel of Fortune",
    category: "Wheel",
    players: "6.0k playing",
    gradient: "from-violet-600 to-indigo-600",
    icon: "wheel-of-fortune",
  },
];

export const GAME_CATEGORIES = [
  "All",
  "Crash",
  "Slots",
  "Virtual",
  "Dice",
  "Table",
  "Cards",
] as const;

export function getFeaturedGames() {
  return GAMES.filter((g) => g.featured);
}
