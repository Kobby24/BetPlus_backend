import type { PlacedBet } from "./bet-types";
import {
  createDemoLostBet,
  createDemoWonBet,
  DEMO_LOST_CODE,
  DEMO_WIN_CODE,
} from "./demo-bets";
import { getBetByCode, getBetByVerifyCode } from "./bet-store";
import {
  getBetByCode as apiGetBetByCode,
  getBetByVerifyCode as apiGetBetByVerifyCode,
  isBackendEnabled,
} from "./backend-client";
import { backendBetToPlacedBet } from "./backend-mappers";
import {
  betTypeLabel,
  statusHeadline,
  ticketBonus,
  ticketId,
  totalReturn,
  verifyCode,
} from "./ticket-display";
import { formatMoney } from "./utils";

export interface TicketVerification {
  bet: PlacedBet;
  ticketId: string;
  verifyCode: string;
  bookingCode: string;
  statusLabel: string;
  betType: string;
  stake: string;
  totalOdds: string;
  potentialWin: string;
  bonus: string;
  returnAmount: string;
  placedAt: string;
  legCount: number;
  isAuthentic: true;
}

function findDemoBet(code: string): PlacedBet | null {
  const normalized = code.trim().toUpperCase();
  if (
    normalized === DEMO_WIN_CODE ||
    normalized === "GHE714ZASK10BF6JK"
  ) {
    return createDemoWonBet("verify-guest");
  }
  if (
    normalized === DEMO_LOST_CODE ||
    normalized === "GHE629LOST10BF6JK"
  ) {
    return createDemoLostBet("verify-guest");
  }
  return null;
}

export function lookupTicketVerification(code: string): PlacedBet | null {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;

  return (
    getBetByVerifyCode(normalized) ??
    getBetByCode(normalized) ??
    findDemoBet(normalized)
  );
}

export async function lookupTicketVerificationAsync(
  code: string,
): Promise<PlacedBet | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;

  if (isBackendEnabled()) {
    try {
      const byVerify = await apiGetBetByVerifyCode(normalized);
      return backendBetToPlacedBet(byVerify);
    } catch {
      try {
        const byCode = await apiGetBetByCode(normalized);
        return backendBetToPlacedBet(byCode);
      } catch {
        return findDemoBet(normalized);
      }
    }
  }

  return lookupTicketVerification(normalized);
}

export function buildTicketVerification(bet: PlacedBet): TicketVerification {
  const placed = new Date(bet.placedAt);
  const placedAt = placed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return {
    bet,
    ticketId: ticketId(bet),
    verifyCode: verifyCode(bet),
    bookingCode: bet.bookingCode,
    statusLabel: statusHeadline(bet.status),
    betType: betTypeLabel(bet),
    stake: formatMoney(bet.stake),
    totalOdds: bet.totalOdds.toFixed(2),
    potentialWin: formatMoney(bet.potentialWin),
    bonus: formatMoney(ticketBonus(bet)),
    returnAmount: formatMoney(totalReturn(bet)),
    placedAt,
    legCount: bet.selections.length,
    isAuthentic: true,
  };
}
