import type { BetSelection } from "./types";
import type { BetStatus, PlacedBet } from "./bet-types";
import { isLegPastFullTime } from "./bet-edit-rules";
import { evaluateLegAtFt, ftScoreLabel, legResultForIndex } from "./bet-settlement";
import { formatFtScore, getMatchFtScore } from "./match-results";

export interface TicketLegDisplay {
  selection: BetSelection;
  kickoffLabel: string;
  ftScore: string | null;
  /** null = pending / not settled */
  legWon: boolean | null;
  voidLeg?: boolean;
}

function formatTicketDate(iso: string) {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd}, ${hh}:${min}`;
}

function legKickoffLabel(bet: PlacedBet, index: number) {
  const demoKickoffs: Record<string, string[]> = {
    BPDEM02: ["01/31, 15:00", "01/31, 17:30", "02/01, 15:00"],
    BPDEM01: ["02/14, 14:30", "02/14, 16:30", "02/14, 18:30"],
  };
  const code = bet.bookingCode.toUpperCase();
  if (demoKickoffs[code]?.[index]) return demoKickoffs[code][index];

  const sel = bet.selections[index];
  if (sel?.kickoff) return formatTicketDate(sel.kickoff);

  const d = new Date(bet.placedAt);
  d.setDate(d.getDate() + index + 1);
  d.setHours(15, 0, 0, 0);
  return formatTicketDate(d.toISOString());
}

export function betTypeLabel(bet: PlacedBet) {
  if (bet.flexCut && bet.flexCut > 0) {
    return bet.selections.length > 1 ? `Flex ${bet.flexCut}` : "Singles";
  }
  return bet.selections.length > 1 ? "Multiple" : "Singles";
}

export function statusHeadline(status: BetStatus) {
  if (status === "won") return "Won";
  if (status === "lost") return "Lost";
  if (status === "void") return "Void";
  return "Open";
}

export function totalReturn(bet: PlacedBet) {
  if (bet.status === "won") return bet.potentialWin;
  if (bet.status === "void") return bet.stake;
  return 0;
}

export function ticketBonus(bet: PlacedBet) {
  if (bet.bonus != null && bet.bonus > 0) return bet.bonus;
  if (bet.selections.length >= 3 && bet.status === "won") {
    return Math.round(bet.stake * bet.totalOdds * 0.04 * 100) / 100;
  }
  return 0;
}

export function ticketId(bet: PlacedBet) {
  return bet.ticketId ?? (bet.bookingCode.replace(/\D/g, "").slice(0, 6) || "000000");
}

export function verifyCode(bet: PlacedBet) {
  return bet.verifyCode ?? bet.bookingCode;
}

export function getLegDisplays(bet: PlacedBet): TicketLegDisplay[] {
  return bet.selections.map((sel, i) => {
    const stored = legResultForIndex(bet, i);
    const managerFt = sel.managerFtScore
      ? formatFtScore(sel.managerFtScore.home, sel.managerFtScore.away)
      : null;

    if (stored) {
      return {
        selection: sel,
        kickoffLabel: legKickoffLabel(bet, i),
        ftScore: ftScoreLabel(stored),
        legWon: stored.void ? null : stored.won,
        voidLeg: stored.void,
      };
    }

    if (managerFt) {
      const evaluated = evaluateLegAtFt(bet, i);
      return {
        selection: sel,
        kickoffLabel: legKickoffLabel(bet, i),
        ftScore: managerFt,
        legWon: evaluated ? (evaluated.void ? null : evaluated.won) : null,
        voidLeg: evaluated?.void,
      };
    }

    if (bet.status === "open" && isLegPastFullTime(bet, i)) {
      const evaluated = evaluateLegAtFt(bet, i);
      if (evaluated) {
        return {
          selection: sel,
          kickoffLabel: legKickoffLabel(bet, i),
          ftScore: ftScoreLabel(evaluated),
          legWon: evaluated.void ? null : evaluated.won,
          voidLeg: evaluated.void,
        };
      }
    }

    if (bet.status !== "open") {
      const evaluated = evaluateLegAtFt(bet, i);
      if (evaluated) {
        return {
          selection: sel,
          kickoffLabel: legKickoffLabel(bet, i),
          ftScore: ftScoreLabel(evaluated),
          legWon: evaluated.void ? null : evaluated.won,
          voidLeg: evaluated.void,
        };
      }

      const { home, away } = getMatchFtScore(sel.matchId);
      return {
        selection: sel,
        kickoffLabel: legKickoffLabel(bet, i),
        ftScore: formatFtScore(home, away),
        legWon: null,
      };
    }

    return {
      selection: sel,
      kickoffLabel: legKickoffLabel(bet, i),
      ftScore: null,
      legWon: null,
    };
  });
}

export function formatAmountPlain(amount: number) {
  return amount.toFixed(2);
}

/** Ticket scores use colons (2:1) — never dashes (2-1). */
export function normalizeTicketScoreLabel(label: string): string {
  return label.replace(/(\d+)\s*-\s*(\d+)/g, "$1:$2");
}
