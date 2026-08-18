import { getBetByCode, loadSharedSlip } from "./bet-store";
import { GAMES } from "./games-data";

export const GAME_BOOKING_CODES: Record<string, string[]> = {
  BETPLUS: ["aviator", "spin2win", "virtual-football"],
  AVIATOR: ["aviator"],
  SPIN2WIN: ["spin2win"],
  VIRTUAL: ["virtual-football"],
  LUCKY7: ["lucky-dice", "roulette", "blackjack"],
};

export type BookingCodeResult =
  | { type: "games"; code: string; games: (typeof GAMES)[number][] }
  | { type: "betslip"; code: string; selections: import("./types").BetSelection[]; stake: number }
  | { type: "placed-bet"; code: string; betId: string };

export function resolveBookingCode(code: string): BookingCodeResult | null {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;

  const placedBet = getBetByCode(normalized);
  if (placedBet) {
    return { type: "placed-bet", code: normalized, betId: placedBet.id };
  }

  const sharedSlip = loadSharedSlip(normalized);
  if (sharedSlip) {
    return {
      type: "betslip",
      code: normalized,
      selections: sharedSlip.selections,
      stake: sharedSlip.stake,
    };
  }

  const gameIds = GAME_BOOKING_CODES[normalized];
  if (!gameIds) return null;

  const games = gameIds
    .map((id) => GAMES.find((g) => g.id === id))
    .filter((g): g is (typeof GAMES)[number] => Boolean(g));

  return games.length > 0 ? { type: "games", code: normalized, games } : null;
}
