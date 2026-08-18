import type { BetSelection } from "./types";
import type {
  BetLegCorrection,
  BetSupportClaim,
  PlacedBet,
  Transaction,
} from "./bet-types";
import {
  cloneSelections,
  ensureBetOriginalRecord,
  getBetOriginalSelections,
  oddsForPickLabel,
  recalcBetTotals,
} from "./bet-record";
import { canAdminEditLeg, getBetEditStatus } from "./bet-edit-rules";
import { getMatchFtScore } from "./match-results";
import { normalizeTicketScoreLabel } from "./ticket-display";
import { computeAutoSettlement, reconcileBetRecord } from "./bet-settlement";
import { getUserById, updateUserBalance } from "./auth-store";
import type { User } from "./user-types";
import {
  recordBetLost,
  recordBetPayout,
} from "./platform-store";
import {
  createDemoLostBet,
  createDemoWonBet,
  DEMO_LOST_CODE,
  DEMO_WIN_CODE,
} from "./demo-bets";

const BETS_KEY = "betplus_bets";
const TRANSACTIONS_KEY = "betplus_transactions";

function readBets(): PlacedBet[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(BETS_KEY);
    const bets: PlacedBet[] = raw ? JSON.parse(raw) : [];
    return bets.map(ensureBetOriginalRecord);
  } catch {
    return [];
  }
}

function writeBets(bets: PlacedBet[]) {
  localStorage.setItem(BETS_KEY, JSON.stringify(bets));
}

function readTransactions(): Transaction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(TRANSACTIONS_KEY);
    return raw ? (JSON.parse(raw) as Transaction[]) : [];
  } catch {
    return [];
  }
}

function writeTransactions(txs: Transaction[]) {
  localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(txs));
}

function generateBookingCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "BP";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  const existing = readBets().some((b) => b.bookingCode === code);
  return existing ? generateBookingCode() : code;
}

function generateTicketId(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function generateVerifyCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "GH";
  for (let i = 0; i < 16; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function placeBet(input: {
  userId: string;
  selections: BetSelection[];
  stake: number;
  totalOdds: number;
  potentialWin: number;
  bookingCode?: string;
  verifyCode?: string;
  ticketId?: string;
  flexCut?: number;
}): PlacedBet {
  const bonus =
    input.selections.length >= 3
      ? Math.round(input.stake * input.totalOdds * 0.04 * 100) / 100
      : 0;

  const bet: PlacedBet = {
    id: crypto.randomUUID(),
    bookingCode: input.bookingCode ?? generateBookingCode(),
    ticketId: input.ticketId ?? generateTicketId(),
    verifyCode: input.verifyCode ?? generateVerifyCode(),
    userId: input.userId,
    selections: input.selections,
    originalSelections: cloneSelections(input.selections),
    stake: input.stake,
    totalOdds: input.totalOdds,
    potentialWin: input.potentialWin,
    bonus,
    flexCut:
      input.flexCut != null && input.flexCut > 0 ? input.flexCut : undefined,
    status: "open",
    placedAt: new Date().toISOString(),
    supportClaims: [],
  };

  const bets = readBets();
  bets.unshift(bet);
  writeBets(bets);

  const txs = readTransactions();
  txs.unshift({
    id: crypto.randomUUID(),
    userId: input.userId,
    type: "bet",
    amount: -input.stake,
    description: `Bet ${bet.bookingCode}`,
    createdAt: bet.placedAt,
    betId: bet.id,
  });
  writeTransactions(txs);

  return bet;
}

/** Deduct stake from wallet, then place the bet (atomic). */
export function placeBetForUser(input: {
  userId: string;
  selections: BetSelection[];
  stake: number;
  totalOdds: number;
  potentialWin: number;
  bookingCode?: string;
  verifyCode?: string;
  ticketId?: string;
  flexCut?: number;
}): { bet: PlacedBet; user: User } | { error: string } {
  const user = getUserById(input.userId);
  if (!user) return { error: "User not found." };
  if (input.stake < 1) return { error: "Minimum stake is GH₵1." };
  if (input.stake > user.balance) return { error: "Insufficient balance." };

  const balanceResult = updateUserBalance(input.userId, -input.stake);
  if ("error" in balanceResult) return { error: balanceResult.error };

  const bet = placeBet(input);
  return { bet, user: balanceResult.user };
}

/** Inserts one won + one lost demo ticket for bet history (once per user). */
export function ensureDemoHistoryBets(userId: string): void {
  if (typeof window === "undefined") return;

  const bets = readBets();
  const hasWin = bets.some(
    (b) => b.userId === userId && b.bookingCode === DEMO_WIN_CODE,
  );
  const hasLost = bets.some(
    (b) => b.userId === userId && b.bookingCode === DEMO_LOST_CODE,
  );

  const toAdd: PlacedBet[] = [];
  if (!hasWin) toAdd.push(createDemoWonBet(userId));
  if (!hasLost) toAdd.push(createDemoLostBet(userId));
  if (toAdd.length === 0) return;

  writeBets([...toAdd, ...bets]);
}

function ensureAutoSettled(bet: PlacedBet): PlacedBet {
  const outcome = computeAutoSettlement(bet);
  if (outcome.action === "none") return bet;

  if (outcome.action === "update_legs") {
    return (
      adminUpdateBet(bet.id, { legResults: outcome.legResults }) ?? bet
    );
  }

  adminUpdateBet(bet.id, {
    legResults: outcome.legResults,
    settledAt: new Date().toISOString(),
  });

  return adminSettleBet(bet.id, outcome.status) ?? bet;
}

function reconcileBetStatusFromLegs(betId: string): PlacedBet | null {
  const bets = readBets();
  const idx = bets.findIndex((b) => b.id === betId);
  if (idx === -1) return null;

  const bet = bets[idx];
  if (bet.status === "open") {
    return ensureAutoSettled(bet);
  }

  const reconciled = reconcileBetRecord(bet);
  if (reconciled === bet) return bet;

  bets[idx] = reconciled;
  writeBets(bets);
  return reconciled;
}

function touchBetAtIndex(bets: PlacedBet[], index: number): PlacedBet {
  let bet = bets[index];

  if (bet.status === "open") {
    bet = ensureAutoSettled(bet);
  } else {
    bet = reconcileBetRecord(bet);
  }

  if (bet !== bets[index]) {
    bets[index] = bet;
    writeBets(bets);
  }

  return bet;
}

/** Re-run auto-settlement for all open bets touching a match (after manager update). */
export function reconcileBetsForMatch(matchId: string): void {
  const bets = readBets();
  let changed = false;

  for (let i = 0; i < bets.length; i++) {
    if (bets[i].status !== "open") continue;
    if (!bets[i].selections.some((s) => s.matchId === matchId)) continue;

    const settled = ensureAutoSettled(bets[i]);
    if (settled !== bets[i]) {
      bets[i] = settled;
      changed = true;
    }
  }

  if (changed) writeBets(bets);
}

export function getBetsByUser(userId: string): PlacedBet[] {
  ensureDemoHistoryBets(userId);
  const bets = readBets();
  const result: PlacedBet[] = [];

  for (let i = 0; i < bets.length; i++) {
    if (bets[i].userId !== userId) continue;
    const updated = touchBetAtIndex(bets, i);
    result.push(updated);
  }

  return result;
}

export function getBetByCode(code: string): PlacedBet | null {
  const normalized = code.trim().toUpperCase();
  const bets = readBets();
  const idx = bets.findIndex((b) => b.bookingCode === normalized);
  if (idx === -1) return null;
  return touchBetAtIndex(bets, idx);
}

export function getBetByVerifyCode(code: string): PlacedBet | null {
  const normalized = code.trim().toUpperCase();
  const bets = readBets();
  const idx = bets.findIndex(
    (b) =>
      b.verifyCode?.toUpperCase() === normalized ||
      b.bookingCode === normalized,
  );
  if (idx === -1) return null;
  return touchBetAtIndex(bets, idx);
}

export function getBetById(id: string): PlacedBet | null {
  const bets = readBets();
  const idx = bets.findIndex((b) => b.id === id);
  if (idx === -1) return null;
  return touchBetAtIndex(bets, idx);
}

export function getAllBets(): PlacedBet[] {
  const bets = readBets();
  for (let i = 0; i < bets.length; i++) {
    touchBetAtIndex(bets, i);
  }
  return bets;
}

export function getAllTransactions(): Transaction[] {
  return readTransactions();
}

export function adminUpdateBet(
  betId: string,
  updates: Partial<
    Pick<
      PlacedBet,
      | "selections"
      | "stake"
      | "totalOdds"
      | "potentialWin"
      | "bonus"
      | "ticketId"
      | "status"
      | "supportClaims"
      | "legCorrections"
      | "legResults"
      | "settledAt"
    >
  >,
): PlacedBet | null {
  const bets = readBets();
  const idx = bets.findIndex((b) => b.id === betId);
  if (idx === -1) return null;
  // Original record is never overwritten — only live ticket fields may change.
  bets[idx] = { ...bets[idx], ...updates };
  writeBets(bets);
  return bets[idx];
}

export type BetFieldMode = "auto" | "manual";

export interface ManagerBetTicketUpdate {
  ticketId?: string;
  stake?: number;
  stakeMode?: BetFieldMode;
  totalOdds?: number;
  oddsMode?: BetFieldMode;
  potentialWin?: number;
  totalMode?: BetFieldMode;
  bonus?: number;
  bonusMode?: BetFieldMode;
}

function emitBetsUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("betplus:bets-updated"));
}

/** Manager edits ticket id, stake, odds, return total, and bonus (auto or manual per field). */
export function managerUpdateBetTicket(
  betId: string,
  input: ManagerBetTicketUpdate,
): PlacedBet | null {
  const bet = getBetById(betId);
  if (!bet) return null;

  const stakeMode = input.stakeMode ?? "manual";
  const oddsMode = input.oddsMode ?? "auto";
  const totalMode = input.totalMode ?? "auto";
  const bonusMode = input.bonusMode ?? "auto";

  const stake =
    stakeMode === "manual" && input.stake != null && input.stake >= 0
      ? Math.round(input.stake * 100) / 100
      : bet.stake;

  const autoTotals = recalcBetTotals(bet.selections, stake);
  const totalOdds =
    oddsMode === "manual" && input.totalOdds != null && input.totalOdds >= 1
      ? Math.round(input.totalOdds * 100) / 100
      : autoTotals.totalOdds;

  const totalsWithOdds = recalcBetTotals(bet.selections, stake, totalOdds);
  const bonus =
    bonusMode === "manual" && input.bonus != null && input.bonus >= 0
      ? Math.round(input.bonus * 100) / 100
      : totalsWithOdds.bonus;

  const potentialWin =
    totalMode === "manual" &&
    input.potentialWin != null &&
    input.potentialWin >= 0
      ? Math.round(input.potentialWin * 100) / 100
      : Math.round((stake * totalOdds + bonus) * 100) / 100;

  const ticketId =
    input.ticketId?.trim() ||
    bet.ticketId ||
    bet.bookingCode.replace(/\D/g, "").slice(0, 6) ||
    "000000";

  const updated = adminUpdateBet(betId, {
    ticketId,
    stake,
    totalOdds,
    bonus,
    potentialWin,
  });

  if (updated) emitBetsUpdated();
  return updated;
}

export type LegOutcomeStatus = "won" | "lost" | "void" | "not_started";

export interface ManagerLegUpdate {
  legIndex: number;
  marketId: string;
  marketName: string;
  pick: string;
  pickKey?: string;
  odds: number;
  outcomeLabel: string;
  outcomeStatus: LegOutcomeStatus;
  ftHomeScore?: number | null;
  ftAwayScore?: number | null;
}

/** Manager edits a single leg — market, pick, odds, and outcome on the ticket. */
export function managerUpdateBetLeg(
  betId: string,
  input: ManagerLegUpdate,
): PlacedBet | null {
  const bet = getBetById(betId);
  if (!bet) return null;

  const selections = cloneSelections(bet.selections);
  const leg = selections[input.legIndex];
  if (!leg) return null;

  const pick = normalizeTicketScoreLabel(input.pick.trim());
  if (!pick) return null;
  if (!Number.isFinite(input.odds) || input.odds < 1) return null;

  leg.marketName = input.marketName.trim() || "1X2";
  leg.marketId = input.marketId.trim() || leg.marketId;
  leg.selectionLabel = pick;
  leg.selection = input.pickKey ?? pick;
  leg.odds = Math.round(input.odds * 100) / 100;
  leg.outcomeLabel = normalizeTicketScoreLabel(input.outcomeLabel.trim() || pick);

  const hasFt =
    input.ftHomeScore != null &&
    input.ftAwayScore != null &&
    input.ftHomeScore >= 0 &&
    input.ftAwayScore >= 0;

  if (hasFt) {
    leg.managerFtScore = {
      home: input.ftHomeScore!,
      away: input.ftAwayScore!,
    };
  } else {
    delete leg.managerFtScore;
  }

  const { totalOdds, potentialWin, bonus } = recalcBetTotals(
    selections,
    bet.stake,
  );

  let legResults = [...(bet.legResults ?? [])];
  const resultIdx = legResults.findIndex((r) => r.legIndex === input.legIndex);
  const defaultScores = getMatchFtScore(leg.matchId);
  const homeScore = hasFt ? input.ftHomeScore! : defaultScores.home;
  const awayScore = hasFt ? input.ftAwayScore! : defaultScores.away;

  if (input.outcomeStatus === "not_started") {
    if (resultIdx >= 0) legResults.splice(resultIdx, 1);
  } else {
    const legResult = {
      legIndex: input.legIndex,
      homeScore,
      awayScore,
      won: input.outcomeStatus === "won",
      void: input.outcomeStatus === "void",
    };
    if (resultIdx >= 0) legResults[resultIdx] = legResult;
    else legResults.push(legResult);
  }

  const updated = adminUpdateBet(betId, {
    selections,
    totalOdds,
    potentialWin,
    bonus,
    legResults,
  });

  if (!updated) return null;

  const reconciled = reconcileBetStatusFromLegs(betId);
  if (reconciled) emitBetsUpdated();
  return reconciled ?? updated;
}

export function addBetSupportClaim(
  betId: string,
  input: { legIndex: number; userClaim: string; adminNote?: string },
): { bet: PlacedBet; claim: BetSupportClaim } | null {
  const bet = getBetById(betId);
  if (!bet) return null;

  const leg =
    bet.selections[input.legIndex] ??
    getBetOriginalSelections(bet)[input.legIndex];
  if (!leg) return null;

  const claim: BetSupportClaim = {
    id: crypto.randomUUID(),
    legIndex: input.legIndex,
    userClaim: input.userClaim.trim(),
    recordedPick: leg.selectionLabel,
    status: "open",
    adminNote: input.adminNote?.trim(),
    createdAt: new Date().toISOString(),
  };

  const claims = [...(bet.supportClaims ?? []), claim];
  const updated = adminUpdateBet(betId, { supportClaims: claims });
  if (!updated) return null;
  return { bet: updated, claim };
}

export function updateBetSupportClaim(
  betId: string,
  claimId: string,
  patch: Pick<BetSupportClaim, "status" | "adminNote">,
): PlacedBet | null {
  const bet = getBetById(betId);
  if (!bet) return null;

  const claims = (bet.supportClaims ?? []).map((c) =>
    c.id === claimId
      ? {
          ...c,
          ...patch,
          resolvedAt:
            patch.status !== "open" ? new Date().toISOString() : c.resolvedAt,
        }
      : c,
  );

  return adminUpdateBet(betId, { supportClaims: claims });
}

/** Update picks on the user ticket — e.g. Over 2.5 → Over 1.5 after support confirms mistake. */
export function applyPickCorrection(
  betId: string,
  input: {
    legIndex: number;
    newPick: string;
    newOdds?: number;
    claimId?: string;
    note?: string;
  },
): PlacedBet | null {
  const bet = getBetById(betId);
  if (!bet) return null;
  if (!canAdminEditLeg(bet, input.legIndex)) return null;

  const selections = cloneSelections(bet.selections);
  const leg = selections[input.legIndex];
  if (!leg) return null;

  const fromPick = leg.selectionLabel;
  const newPick = input.newPick.trim();
  if (!newPick) return null;

  leg.selectionLabel = newPick;
  leg.selection = newPick;
  leg.odds = input.newOdds ?? oddsForPickLabel(newPick) ?? leg.odds;

  const { totalOdds, potentialWin, bonus } = recalcBetTotals(
    selections,
    bet.stake,
  );

  const correction: BetLegCorrection = {
    legIndex: input.legIndex,
    fromPick,
    toPick: newPick,
    correctedAt: new Date().toISOString(),
    note: input.note,
  };

  const legCorrections = [...(bet.legCorrections ?? []), correction];

  let supportClaims = bet.supportClaims ?? [];
  if (input.claimId) {
    supportClaims = supportClaims.map((c) =>
      c.id === input.claimId
        ? {
            ...c,
            status: "pick_corrected" as const,
            adminNote:
              input.note ??
              `Pick updated to "${newPick}" per support request.`,
            resolvedAt: new Date().toISOString(),
          }
        : c,
    );
  }

  return adminUpdateBet(betId, {
    selections,
    totalOdds,
    potentialWin,
    bonus,
    legCorrections,
    supportClaims,
  });
}

/** Save full slip edit from admin — updates what the user sees on their ticket. */
export function saveBetPickEdits(
  betId: string,
  input: {
    selections: BetSelection[];
    stake?: number;
    totalOdds?: number;
    potentialWin?: number;
    note?: string;
  },
): PlacedBet | null {
  const bet = getBetById(betId);
  if (!bet) return null;

  const editStatus = getBetEditStatus(bet);
  if (!editStatus.canEdit) return null;

  for (let i = 0; i < input.selections.length; i++) {
    const prev = bet.selections[i];
    const next = input.selections[i];
    if (
      prev &&
      next &&
      prev.selectionLabel !== next.selectionLabel &&
      !canAdminEditLeg(bet, i)
    ) {
      return null;
    }
  }

  const stake = input.stake ?? bet.stake;
  const calc = recalcBetTotals(input.selections, stake);
  const legCorrections = [...(bet.legCorrections ?? [])];

  input.selections.forEach((sel, i) => {
    const prev = bet.selections[i];
    if (prev && prev.selectionLabel !== sel.selectionLabel) {
      legCorrections.push({
        legIndex: i,
        fromPick: prev.selectionLabel,
        toPick: sel.selectionLabel,
        correctedAt: new Date().toISOString(),
        note: input.note,
      });
    }
  });

  return adminUpdateBet(betId, {
    selections: input.selections,
    stake,
    totalOdds: input.totalOdds ?? calc.totalOdds,
    potentialWin: input.potentialWin ?? calc.potentialWin,
    bonus: calc.bonus,
    legCorrections,
  });
}

export function getBetsWithOpenClaims(): PlacedBet[] {
  return readBets().filter((b) =>
    (b.supportClaims ?? []).some((c) => c.status === "open"),
  );
}

/** Settle bet and credit winnings when status is won. */
export function adminSettleBet(
  betId: string,
  status: PlacedBet["status"],
): PlacedBet | null {
  const bets = readBets();
  const idx = bets.findIndex((b) => b.id === betId);
  if (idx === -1) return null;
  const bet = bets[idx];
  if (bet.status !== "open") return bet;

  bets[idx] = { ...bet, status, settledAt: new Date().toISOString() };
  writeBets(bets);
  const updated = bets[idx];

  if (status === "won") {
    const payout = updated.potentialWin;
    updateUserBalance(updated.userId, payout);
    recordBetPayout(
      updated.userId,
      updated.stake,
      payout,
      updated.bookingCode,
      updated.id,
    );
    addTransaction({
      userId: updated.userId,
      type: "win",
      amount: payout,
      description: `Winnings ${updated.bookingCode}`,
      betId: updated.id,
    });
  }

  if (status === "lost") {
    recordBetLost(
      updated.userId,
      updated.stake,
      updated.bookingCode,
      updated.id,
    );
  }

  if (status === "void") {
    updateUserBalance(updated.userId, updated.stake);
    addTransaction({
      userId: updated.userId,
      type: "deposit",
      amount: updated.stake,
      description: `Void refund ${updated.bookingCode}`,
      betId: updated.id,
    });
  }

  return updated;
}

export function getTransactionsByUser(userId: string): Transaction[] {
  return readTransactions().filter((t) => t.userId === userId);
}

export function addTransaction(input: {
  userId: string;
  type: Transaction["type"];
  amount: number;
  description: string;
  betId?: string;
}): Transaction {
  const tx: Transaction = {
    id: crypto.randomUUID(),
    userId: input.userId,
    type: input.type,
    amount: input.amount,
    description: input.description,
    createdAt: new Date().toISOString(),
    betId: input.betId,
  };
  const txs = readTransactions();
  txs.unshift(tx);
  writeTransactions(txs);
  return tx;
}

export function clearSettledBets(userId: string): void {
  const bets = readBets().filter(
    (b) => b.userId !== userId || b.status === "open",
  );
  writeBets(bets);
}

export function updateBetStatus(
  betId: string,
  status: PlacedBet["status"],
): PlacedBet | null {
  const bets = readBets();
  const idx = bets.findIndex((b) => b.id === betId);
  if (idx === -1) return null;
  bets[idx] = { ...bets[idx], status };
  writeBets(bets);
  return bets[idx];
}

export function deleteBetById(betId: string): boolean {
  const bets = readBets();
  const next = bets.filter((b) => b.id !== betId);
  if (next.length === bets.length) return false;
  writeBets(next);
  return true;
}

export function generateSlipCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  if (typeof window !== "undefined") {
    const existing = loadSharedSlip(code);
    if (existing) return generateSlipCode();
  }
  return code;
}

export function saveSharedSlipCode(
  code: string,
  selections: BetSelection[],
  stake: number,
): void {
  const key = "betplus_shared_slips";
  let slips: Record<string, { selections: BetSelection[]; stake: number }> = {};
  try {
    const raw = localStorage.getItem(key);
    if (raw) slips = JSON.parse(raw);
  } catch {
    /* ignore */
  }
  slips[code.trim().toUpperCase()] = { selections, stake };
  localStorage.setItem(key, JSON.stringify(slips));
}

export function loadSharedSlip(code: string): {
  selections: BetSelection[];
  stake: number;
} | null {
  const key = "betplus_shared_slips";
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const slips = JSON.parse(raw) as Record<
      string,
      { selections: BetSelection[]; stake: number }
    >;
    return slips[code.trim().toUpperCase()] ?? null;
  } catch {
    return null;
  }
}
