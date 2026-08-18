/**
 * Platform (house) wallet — holds user deposits and pays winners.
 * User balances are liabilities shown on their wallet for staking.
 */

const PLATFORM_KEY = "betplus_platform";

export interface PlatformLedgerEntry {
  id: string;
  type: "deposit" | "withdraw" | "stake_retained" | "payout" | "admin_credit";
  amount: number;
  userId?: string;
  description: string;
  at: string;
  betId?: string;
}

interface PlatformState {
  balance: number;
  ledger: PlatformLedgerEntry[];
}

function readPlatform(): PlatformState {
  if (typeof window === "undefined") {
    return { balance: 0, ledger: [] };
  }
  try {
    const raw = localStorage.getItem(PLATFORM_KEY);
    if (!raw) return { balance: 0, ledger: [] };
    return JSON.parse(raw) as PlatformState;
  } catch {
    return { balance: 0, ledger: [] };
  }
}

function writePlatform(state: PlatformState) {
  localStorage.setItem(PLATFORM_KEY, JSON.stringify(state));
}

function pushEntry(
  state: PlatformState,
  entry: Omit<PlatformLedgerEntry, "id" | "at">,
): PlatformState {
  const full: PlatformLedgerEntry = {
    ...entry,
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
  };
  return {
    balance: Math.round(state.balance * 100) / 100,
    ledger: [full, ...state.ledger].slice(0, 500),
  };
}

export function getPlatformBalance(): number {
  return readPlatform().balance;
}

export function getPlatformLedger(): PlatformLedgerEntry[] {
  return readPlatform().ledger;
}

/** User deposited — funds enter admin pool and show on user wallet. */
export function recordUserDeposit(
  userId: string,
  amount: number,
  description: string,
): void {
  let state = readPlatform();
  state.balance = Math.round((state.balance + amount) * 100) / 100;
  state = pushEntry(state, {
    type: "deposit",
    amount,
    userId,
    description,
  });
  writePlatform(state);
}

/** User withdrew — paid from admin pool. */
export function recordUserWithdrawal(
  userId: string,
  amount: number,
  description: string,
): void {
  let state = readPlatform();
  state.balance = Math.round((state.balance - amount) * 100) / 100;
  state = pushEntry(state, {
    type: "withdraw",
    amount: -amount,
    userId,
    description,
  });
  writePlatform(state);
}

/** Admin credited user wallet — same as deposit to platform. */
export function recordAdminCredit(
  userId: string,
  amount: number,
  description: string,
): void {
  let state = readPlatform();
  state.balance = Math.round((state.balance + amount) * 100) / 100;
  state = pushEntry(state, {
    type: "admin_credit",
    amount,
    userId,
    description,
  });
  writePlatform(state);
}

/** Bet lost after FT — stake stays in admin pool (user already debited at placement). */
export function recordBetLost(
  userId: string,
  stake: number,
  bookingCode: string,
  betId: string,
): void {
  let state = readPlatform();
  state = pushEntry(state, {
    type: "stake_retained",
    amount: stake,
    userId,
    description: `Lost bet ${bookingCode} — stake retained`,
    betId,
  });
  writePlatform(state);
}

/** Bet won and settled — admin pays net profit (payout − stake) to user balance. */
export function recordBetPayout(
  userId: string,
  stake: number,
  payout: number,
  bookingCode: string,
  betId: string,
): void {
  const netProfit = Math.round((payout - stake) * 100) / 100;
  let state = readPlatform();
  if (netProfit > 0) {
    state.balance = Math.round((state.balance - netProfit) * 100) / 100;
  }
  state = pushEntry(state, {
    type: "payout",
    amount: -netProfit,
    userId,
    description: `Winnings ${bookingCode} (GH₵${payout.toFixed(2)} to user)`,
    betId,
  });
  writePlatform(state);
}

export function getPlatformStats(userLiabilities: number) {
  const balance = getPlatformBalance();
  return {
    platformBalance: balance,
    userLiabilities,
    netPosition: Math.round((balance - userLiabilities) * 100) / 100,
  };
}
