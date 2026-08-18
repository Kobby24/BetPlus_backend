import type { BetLegResult, PlacedBet, Transaction } from "./bet-types";
import type { BetSelection } from "./types";
import type {
  BackendBet,
  BackendBetSelection,
  BackendManagerMatch,
  BackendReferralStats,
  BackendTransaction,
  BackendUser,
} from "./backend-client";
import type { ManagerMatchStatus, ManagerMatchView } from "./manager-matches-store";
import type { ManagerReferralStats, ReferredUserSummary } from "./referral-store";
import type { User } from "./user-types";

export function backendUserToLocal(u: BackendUser): User {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone ?? "",
    balance: u.balance,
    createdAt: u.created_at,
    isManager: u.is_manager,
    referralCode: u.referral_code ?? undefined,
    referredByManagerId: u.referred_by_manager_id ?? undefined,
  };
}

export function backendTransactionToLocal(tx: BackendTransaction): Transaction {
  return {
    id: tx.id,
    userId: tx.user_id,
    type: tx.type as Transaction["type"],
    amount: tx.amount,
    description: tx.description ?? "",
    createdAt: tx.created_at,
    betId: tx.bet_id ?? undefined,
  };
}

function backendSelectionToLocal(sel: BackendBetSelection, index: number): BetSelection {
  return {
    id: `${sel.match_id}-${sel.market_id ?? "1x2"}-${sel.selection}-${index}`,
    matchId: sel.match_id,
    homeTeam: sel.home_team,
    awayTeam: sel.away_team,
    selection: sel.selection,
    selectionLabel: sel.selection_label,
    odds: sel.odds,
    league: sel.league,
    marketId: sel.market_id ?? undefined,
    marketName: sel.market_name ?? undefined,
    outcomeLabel: sel.outcome_label ?? undefined,
    managerFtScore: sel.manager_ft_score ?? undefined,
  };
}

export function backendBetToPlacedBet(bet: BackendBet): PlacedBet {
  const selections = (bet.selections ?? []).map(backendSelectionToLocal);
  const legResults = bet.leg_results as BetLegResult[] | null | undefined;

  return {
    id: bet.id,
    bookingCode: bet.booking_code,
    ticketId: bet.ticket_id ?? undefined,
    verifyCode: bet.verify_code ?? undefined,
    userId: bet.user_id,
    selections,
    originalSelections: selections.map((s) => ({ ...s })),
    stake: bet.stake,
    totalOdds: bet.total_odds,
    potentialWin: bet.potential_win,
    bonus: bet.bonus ?? 0,
    flexCut: bet.flex_cut ?? undefined,
    status: bet.status as PlacedBet["status"],
    placedAt: bet.placed_at,
    legResults: legResults ?? undefined,
    settledAt: bet.settled_at ?? undefined,
    supportClaims: [],
  };
}

export function localSelectionToBackend(sel: BetSelection) {
  return {
    match_id: sel.matchId,
    home_team: sel.homeTeam,
    away_team: sel.awayTeam,
    selection: sel.selection,
    selection_label: sel.selectionLabel,
    odds: sel.odds,
    league: sel.league,
    market_id: sel.marketId,
    market_name: sel.marketName,
  };
}

export function backendMatchToView(m: BackendManagerMatch): ManagerMatchView {
  const status = (
    m.status === "won" || m.status === "lost" || m.status === "void"
      ? m.status
      : "not_started"
  ) as ManagerMatchStatus;
  return {
    matchId: m.match_id,
    homeTeam: m.home_team,
    awayTeam: m.away_team,
    league: m.league,
    sport: (m.sport as ManagerMatchView["sport"]) || "football",
    kickoff: m.kickoff ?? new Date().toISOString(),
    status,
    homeScore: m.home_score,
    awayScore: m.away_score,
    isManual: m.is_manual,
    note: m.note ?? undefined,
    updatedAt: m.updated_at ?? new Date().toISOString(),
    source: m.is_manual ? "manual" : "catalog",
    managed: m.managed,
  };
}

export function backendReferralStatsToLocal(
  stats: BackendReferralStats,
  audience: "manager" | "admin" = "manager",
): ManagerReferralStats {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const referrals: ReferredUserSummary[] = (stats.referrals ?? []).map((r) => ({
    userId: r.user_id,
    name: r.name,
    email: r.email,
    phone: r.phone ?? "",
    signedUpAt: r.signed_up_at,
    depositCount: r.deposit_count,
    totalDeposited: r.total_deposited,
    grossRevenue: r.gross_revenue,
    commissionEarned: r.commission_earned,
  }));
  return {
    referralCode: stats.referral_code,
    inviteLink:
      stats.invite_link ||
      (stats.referral_code
        ? `${origin}/?ref=${encodeURIComponent(stats.referral_code)}`
        : ""),
    signupCount: stats.signup_count,
    totalDeposits: stats.total_deposits,
    grossRevenue: stats.gross_revenue,
    managerEarnings: stats.manager_earnings,
    platformEarnings: stats.platform_earnings,
    totalCommission:
      audience === "admin" ? stats.gross_revenue : stats.manager_earnings,
    referrals,
  };
}
