export type IconId =
  | "sports-betting"
  | "live"
  | "casino"
  | "virtual-sports"
  | "jackpot"
  | "live-scores"
  | "wallet"
  | "promotions"
  | "bet-history"
  | "profile"
  | "support"
  | "booking-code"
  | "football"
  | "basketball"
  | "baseball"
  | "hockey"
  | "aviator"
  | "spin2win"
  | "virtual-football"
  | "lucky-dice"
  | "roulette"
  | "blackjack"
  | "keno"
  | "wheel-of-fortune"
  | "settings"
  | "logout"
  | "success";

export const ICON_PATHS: Record<IconId, string> = {
  "sports-betting": "/icons/sports-betting.svg",
  live: "/icons/live.svg",
  casino: "/icons/casino.svg",
  "virtual-sports": "/icons/virtual-sports.svg",
  jackpot: "/icons/jackpot.svg",
  "live-scores": "/icons/live-scores.svg",
  wallet: "/icons/wallet.svg",
  promotions: "/icons/promotions.svg",
  "bet-history": "/icons/bet-history.svg",
  profile: "/icons/profile.svg",
  support: "/icons/support.svg",
  "booking-code": "/icons/booking-code.svg",
  football: "/icons/football.svg",
  basketball: "/icons/basketball.svg",
  baseball: "/icons/baseball.svg",
  hockey: "/icons/hockey.svg",
  aviator: "/icons/games/aviator.svg",
  spin2win: "/icons/games/spin2win.svg",
  "virtual-football": "/icons/games/virtual-football.svg",
  "lucky-dice": "/icons/games/lucky-dice.svg",
  roulette: "/icons/games/roulette.svg",
  blackjack: "/icons/games/blackjack.svg",
  keno: "/icons/games/keno.svg",
  "wheel-of-fortune": "/icons/games/wheel-of-fortune.svg",
  settings: "/icons/settings.svg",
  logout: "/icons/logout.svg",
  success: "/icons/success.svg",
};

export function getIconPath(id: IconId): string {
  return ICON_PATHS[id];
}
