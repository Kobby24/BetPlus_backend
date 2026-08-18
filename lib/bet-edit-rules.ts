import type { PlacedBet } from "./bet-types";
import { getManagerMatchStatus } from "./manager-matches-store";

/** Standard match length before picks lock (minutes). */
export const MATCH_FT_MINUTES = 90;

export function getLegKickoffDate(bet: PlacedBet, legIndex: number): Date {
  const sel = bet.selections[legIndex];
  if (sel?.kickoff) return new Date(sel.kickoff);

  const d = new Date(bet.placedAt);
  d.setDate(d.getDate() + legIndex + 1);
  d.setHours(15, 0, 0, 0);
  return d;
}

export function getLegFullTimeDate(bet: PlacedBet, legIndex: number): Date {
  const kickoff = getLegKickoffDate(bet, legIndex);
  return new Date(kickoff.getTime() + MATCH_FT_MINUTES * 60 * 1000);
}

export function isLegPastFullTime(bet: PlacedBet, legIndex: number): boolean {
  const sel = bet.selections[legIndex];
  const managerStatus = sel ? getManagerMatchStatus(sel.matchId) : null;

  if (managerStatus === "not_started") return false;
  if (
    managerStatus === "won" ||
    managerStatus === "lost" ||
    managerStatus === "void"
  ) {
    return true;
  }

  return Date.now() >= getLegFullTimeDate(bet, legIndex).getTime();
}

export function canAdminEditLeg(bet: PlacedBet, legIndex: number): boolean {
  if (bet.status !== "open") return false;
  return !isLegPastFullTime(bet, legIndex);
}

export function getEditableLegIndices(bet: PlacedBet): number[] {
  return bet.selections
    .map((_, i) => i)
    .filter((i) => canAdminEditLeg(bet, i));
}

export function getBetEditStatus(bet: PlacedBet): {
  canEdit: boolean;
  reason?: string;
  editableLegs: number[];
} {
  if (bet.status !== "open") {
    return {
      canEdit: false,
      reason: "This bet is settled — picks cannot be changed.",
      editableLegs: [],
    };
  }

  const editableLegs = getEditableLegIndices(bet);
  if (editableLegs.length === 0) {
    return {
      canEdit: false,
      reason:
        "All matches have reached Full Time (90 mins) — picks are locked.",
      editableLegs: [],
    };
  }

  return { canEdit: true, editableLegs };
}

export function formatLegKickoff(bet: PlacedBet, legIndex: number): string {
  return getLegKickoffDate(bet, legIndex).toLocaleString();
}

export function formatLegFtTime(bet: PlacedBet, legIndex: number): string {
  return getLegFullTimeDate(bet, legIndex).toLocaleString();
}

export function legEditLockReason(
  bet: PlacedBet,
  legIndex: number,
): string | null {
  if (bet.status !== "open") return "Bet settled";
  if (isLegPastFullTime(bet, legIndex)) return "Full Time reached";
  return null;
}
