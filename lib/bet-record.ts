import type { BetSelection } from "./types";
import type { BetLegCorrection, BetSupportClaim, PlacedBet } from "./bet-types";

export function cloneSelections(selections: BetSelection[]): BetSelection[] {
  return selections.map((s) => ({ ...s }));
}

/** Human-readable one-line summary of a leg for support records. */
export function formatLegSummary(sel: BetSelection): string {
  const market = sel.marketName ? `${sel.marketName}: ` : "";
  return `${sel.homeTeam} vs ${sel.awayTeam} — ${market}${sel.selectionLabel} @ ${sel.odds.toFixed(2)}`;
}

export function getBetOriginalSelections(bet: PlacedBet): BetSelection[] {
  return bet.originalSelections?.length
    ? bet.originalSelections
    : bet.selections;
}

export function ensureBetOriginalRecord(bet: PlacedBet): PlacedBet {
  if (bet.originalSelections?.length) return bet;
  return { ...bet, originalSelections: cloneSelections(bet.selections) };
}

export function openSupportClaimsCount(bet: PlacedBet): number {
  return (bet.supportClaims ?? []).filter((c) => c.status === "open").length;
}

/** True when admin applied a technical correction after placement. */
export function betWasCorrected(bet: PlacedBet): boolean {
  const original = getBetOriginalSelections(bet);
  return JSON.stringify(bet.selections) !== JSON.stringify(original);
}

export const SUPPORT_CLAIM_STATUS_LABEL: Record<
  BetSupportClaim["status"],
  string
> = {
  open: "Open",
  record_confirmed: "Record confirmed",
  pick_corrected: "Pick corrected",
  resolved: "Resolved",
};

/** Common goal-market picks for quick admin correction */
export const GOALS_PICK_PRESETS: { label: string; odds: number }[] = [
  { label: "Over 1.5", odds: 1.35 },
  { label: "Over 2.5", odds: 1.85 },
  { label: "Over 3.5", odds: 2.45 },
  { label: "Under 1.5", odds: 2.75 },
  { label: "Under 2.5", odds: 1.95 },
  { label: "Under 3.5", odds: 1.42 },
  { label: "BTTS Yes", odds: 1.72 },
  { label: "BTTS No", odds: 2.05 },
  { label: "Home", odds: 2.15 },
  { label: "Draw", odds: 3.2 },
  { label: "Away", odds: 2.8 },
];

export function oddsForPickLabel(label: string): number | undefined {
  const normalized = label.trim().toLowerCase();
  return GOALS_PICK_PRESETS.find(
    (p) => p.label.toLowerCase() === normalized,
  )?.odds;
}

export function legWasCorrected(bet: PlacedBet, legIndex: number): BetLegCorrection | undefined {
  return (bet.legCorrections ?? []).findLast((c) => c.legIndex === legIndex);
}

export function recalcBetTotals(
  selections: BetSelection[],
  stake: number,
  totalOddsOverride?: number,
): { totalOdds: number; potentialWin: number; bonus: number } {
  const fromSelections =
    Math.round(selections.reduce((acc, s) => acc * s.odds, 1) * 100) / 100;
  const totalOdds = totalOddsOverride ?? fromSelections;
  const bonus =
    selections.length >= 3
      ? Math.round(stake * totalOdds * 0.04 * 100) / 100
      : 0;
  const potentialWin =
    Math.round((stake * totalOdds + bonus) * 100) / 100;
  return { totalOdds, potentialWin, bonus };
}
