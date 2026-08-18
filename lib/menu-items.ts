import type { IconId } from "./icons";

export interface MenuItem {
  href: string;
  label: string;
  description: string;
  icon: IconId;
  category: "betting" | "games" | "account" | "support";
}

export const MENU_ITEMS: MenuItem[] = [
  {
    href: "/",
    label: "Sports Betting",
    description: "Pre-match odds & markets",
    icon: "sports-betting",
    category: "betting",
  },
  {
    href: "/live",
    label: "Live Betting",
    description: "In-play odds & live events",
    icon: "live",
    category: "betting",
  },
  {
    href: "/games",
    label: "Casino Games",
    description: "Slots, crash, table games",
    icon: "casino",
    category: "games",
  },
  {
    href: "/virtual",
    label: "Virtual Sports",
    description: "Simulated matches & races",
    icon: "virtual-sports",
    category: "games",
  },
  {
    href: "/jackpot",
    label: "Jackpot",
    description: "Win big with jackpot pools",
    icon: "jackpot",
    category: "betting",
  },
  {
    href: "/scores",
    label: "Live Scores",
    description: "Real-time match results",
    icon: "live-scores",
    category: "betting",
  },
  {
    href: "/wallet",
    label: "Wallet",
    description: "Deposit, withdraw & balance",
    icon: "wallet",
    category: "account",
  },
  {
    href: "/promotions",
    label: "Promotions",
    description: "Bonuses & special offers",
    icon: "promotions",
    category: "account",
  },
  {
    href: "/bet-history",
    label: "Bet History",
    description: "Past & settled bets",
    icon: "bet-history",
    category: "account",
  },
  {
    href: "/account",
    label: "Profile",
    description: "Account & settings",
    icon: "profile",
    category: "account",
  },
  {
    href: "/support",
    label: "Help / Support",
    description: "FAQ & customer service",
    icon: "support",
    category: "support",
  },
  {
    href: "/verify",
    label: "Booking Code",
    description: "Verify ticket stake, result, and winnings",
    icon: "booking-code",
    category: "support",
  },
];

export const MENU_CATEGORIES = [
  { id: "betting" as const, label: "Betting" },
  { id: "games" as const, label: "Games" },
  { id: "account" as const, label: "Account" },
  { id: "support" as const, label: "Support" },
];
