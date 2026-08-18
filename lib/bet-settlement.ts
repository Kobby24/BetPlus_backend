import type { BetLegResult, PlacedBet } from "./bet-types";
import { isLegPastFullTime } from "./bet-edit-rules";
import {
  formatFtScore,
  getManagerStatusForMatch,
  getMatchFtScore,
} from "./match-results";
import type { BetSelection } from "./types";

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/** Returns whether the pick won at Full Time. */
export function evaluatePickResult(
  selection: BetSelection,
  homeGoals: number,
  awayGoals: number,
): boolean {
  const label = normalize(selection.selectionLabel);
  const homeTeam = normalize(selection.homeTeam);
  const awayTeam = normalize(selection.awayTeam);
  const total = homeGoals + awayGoals;

  if (label === "home" || label === homeTeam) return homeGoals > awayGoals;
  if (label === "away" || label === awayTeam) return awayGoals > homeGoals;
  if (label === "draw") return homeGoals === awayGoals;

  const overMatch = label.match(/^over\s+([\d.]+)$/);
  if (overMatch) return total > Number.parseFloat(overMatch[1]);

  const underMatch = label.match(/^under\s+([\d.]+)$/);
  if (underMatch) return total < Number.parseFloat(underMatch[1]);

  if (label === "btts yes" || (label.includes("btts") && label.includes("yes"))) {
    return homeGoals >= 1 && awayGoals >= 1;
  }
  if (label === "btts no" || (label.includes("btts") && label.includes("no"))) {
    return homeGoals === 0 || awayGoals === 0;
  }

  if (selection.selection === "home") return homeGoals > awayGoals;
  if (selection.selection === "away") return awayGoals > homeGoals;
  if (selection.selection === "draw") return homeGoals === awayGoals;

  const scoreMatch = label.match(/^(\d+)\s*[:\-]\s*(\d+)$/);
  if (scoreMatch) {
    return (
      Number.parseInt(scoreMatch[1], 10) === homeGoals &&
      Number.parseInt(scoreMatch[2], 10) === awayGoals
    );
  }

  return false;
}

export function evaluateLegAtFt(
  bet: PlacedBet,
  legIndex: number,
): BetLegResult | null {
  const selection = bet.selections[legIndex];
  if (!selection) return null;

  const stored = bet.legResults?.find((r) => r.legIndex === legIndex);
  if (stored) return stored;

  if (selection.managerFtScore) {
    const { home, away } = selection.managerFtScore;
    return {
      legIndex,
      homeScore: home,
      awayScore: away,
      won: evaluatePickResult(selection, home, away),
    };
  }

  if (!isLegPastFullTime(bet, legIndex)) return null;

  const managerStatus = getManagerStatusForMatch(selection.matchId);
  const { home, away } = getMatchFtScore(selection.matchId);

  if (managerStatus === "void") {
    return { legIndex, homeScore: home, awayScore: away, won: false, void: true };
  }

  if (managerStatus === "won") {
    return { legIndex, homeScore: home, awayScore: away, won: true };
  }

  if (managerStatus === "lost") {
    return { legIndex, homeScore: home, awayScore: away, won: false };
  }

  const won = evaluatePickResult(selection, home, away);

  return { legIndex, homeScore: home, awayScore: away, won };
}

export function flexCutForBet(bet: PlacedBet): number {
  return bet.flexCut ?? 0;
}

/** Final bet status from all leg results — null if not every leg is resolved. */
export function deriveBetStatusFromLegs(
  bet: PlacedBet,
  legResults: BetLegResult[],
): "won" | "lost" | "void" | null {
  const n = bet.selections.length;
  if (n === 0) return null;

  for (let i = 0; i < n; i++) {
    if (!legResults.some((r) => r.legIndex === i)) return null;
  }

  if (legResults.some((r) => r.void)) return "void";

  const lostCount = legResults.filter((r) => !r.won && !r.void).length;
  const flexCut = flexCutForBet(bet);

  if (flexCut > 0) {
    return lostCount <= flexCut ? "won" : "lost";
  }

  return lostCount === 0 ? "won" : "lost";
}

export type AutoSettlementOutcome =
  | { action: "none" }
  | { action: "update_legs"; legResults: BetLegResult[] }
  | { action: "settle"; status: "won" | "lost" | "void"; legResults: BetLegResult[] };

function mergeLegResult(
  legResults: BetLegResult[],
  evaluated: BetLegResult,
): boolean {
  const existingIdx = legResults.findIndex((r) => r.legIndex === evaluated.legIndex);
  if (existingIdx >= 0) {
    const prev = legResults[existingIdx];
    const same =
      prev.won === evaluated.won &&
      prev.void === evaluated.void &&
      prev.homeScore === evaluated.homeScore &&
      prev.awayScore === evaluated.awayScore;
    if (same) return false;
    legResults[existingIdx] = evaluated;
    return true;
  }
  legResults.push(evaluated);
  return true;
}

/** Decide if an open bet should update leg results or fully settle after FT. */
export function computeAutoSettlement(bet: PlacedBet): AutoSettlementOutcome {
  if (bet.status !== "open") return { action: "none" };

  const flexCut = flexCutForBet(bet);
  const legResults: BetLegResult[] = [...(bet.legResults ?? [])];
  let changed = false;

  for (let i = 0; i < bet.selections.length; i++) {
    const evaluated = evaluateLegAtFt(bet, i);
    if (!evaluated) continue;
    if (mergeLegResult(legResults, evaluated)) changed = true;
  }

  if (legResults.some((r) => r.void)) {
    return { action: "settle", status: "void", legResults };
  }

  const lostCount = legResults.filter((r) => !r.won && !r.void).length;

  // Standard multiple: one wrong pick loses the whole slip.
  if (flexCut === 0 && lostCount > 0) {
    return { action: "settle", status: "lost", legResults };
  }

  // Flex: too many wrong picks loses the slip.
  if (flexCut > 0 && lostCount > flexCut) {
    return { action: "settle", status: "lost", legResults };
  }

  const allPastFt = bet.selections.every((_, i) => isLegPastFullTime(bet, i));
  const allResolved = bet.selections.every((_, i) =>
    legResults.some((r) => r.legIndex === i),
  );

  if (allPastFt && allResolved) {
    const status = deriveBetStatusFromLegs(bet, legResults);
    if (status === "won" || status === "lost") {
      return { action: "settle", status, legResults };
    }
  }

  if (changed) {
    return { action: "update_legs", legResults };
  }

  return { action: "none" };
}

export function legResultForIndex(
  bet: PlacedBet,
  legIndex: number,
): BetLegResult | undefined {
  return bet.legResults?.find((r) => r.legIndex === legIndex);
}

export function ftScoreLabel(result: BetLegResult): string {
  return formatFtScore(result.homeScore, result.awayScore);
}

/** Resolve every leg (stored results or FT evaluation). null if any leg is still pending. */
export function resolveLegResultsForBet(bet: PlacedBet): BetLegResult[] | null {
  const results: BetLegResult[] = [];

  for (let i = 0; i < bet.selections.length; i++) {
    const evaluated = evaluateLegAtFt(bet, i);
    if (!evaluated) return null;
    results.push(evaluated);
  }

  return results;
}

/** Apply standard / flex rules and sync stored status + leg results. */
export function reconcileBetRecord(bet: PlacedBet): PlacedBet {
  if (bet.status === "open") return bet;

  const legResults = resolveLegResultsForBet(bet);
  if (!legResults) return bet;

  const derived = deriveBetStatusFromLegs(bet, legResults);
  if (!derived) return bet;

  const sameStatus = bet.status === derived;
  const sameLegs =
    JSON.stringify(bet.legResults ?? []) === JSON.stringify(legResults);

  if (sameStatus && sameLegs) return bet;

  return { ...bet, status: derived, legResults };
}
