import type { BetSelection } from "./types";

export type BetStatus = "open" | "won" | "lost" | "void";

/** Immutable snapshot of picks at the moment the bet was placed. */
export type BetSelectionRecord = BetSelection[];

export type SupportClaimStatus =
  | "open"
  | "record_confirmed"
  | "pick_corrected"
  | "resolved";

/** Logged when a user contacts support disputing what they picked. */
export interface BetSupportClaim {
  id: string;
  /** Index of the leg in the bet slip (0-based) */
  legIndex: number;
  /** What the user says they picked, e.g. "Over 1.5" */
  userClaim: string;
  /** What our record shows was placed on that leg */
  recordedPick: string;
  status: SupportClaimStatus;
  adminNote?: string;
  createdAt: string;
  resolvedAt?: string;
}

/** Support-approved pick change — shown on the user ticket for transparency. */
export interface BetLegCorrection {
  legIndex: number;
  fromPick: string;
  toPick: string;
  correctedAt: string;
  note?: string;
}

/** Per-leg result after Full Time — used for auto-settlement display */
export interface BetLegResult {
  legIndex: number;
  homeScore: number;
  awayScore: number;
  won: boolean;
  /** Match voided by manager — whole bet should void */
  void?: boolean;
}

export interface PlacedBet {
  id: string;
  bookingCode: string;
  /** Short numeric ticket id shown on ticket details */
  ticketId?: string;
  /** Long verification code for sharing */
  verifyCode?: string;
  userId: string;
  selections: BetSelection[];
  /** Frozen copy of selections at placement — never changed by admin edits */
  originalSelections?: BetSelectionRecord;
  stake: number;
  totalOdds: number;
  potentialWin: number;
  bonus?: number;
  status: BetStatus;
  placedAt: string;
  supportClaims?: BetSupportClaim[];
  /** Admin-only audit trail for pick changes — not shown on user ticket */
  legCorrections?: BetLegCorrection[];
  /** Leg outcomes after FT — filled automatically */
  legResults?: BetLegResult[];
  /** Allowed losing legs (flex). 0/undefined = standard — one loss loses the whole bet. */
  flexCut?: number;
  settledAt?: string;
}

export type TransactionType = "deposit" | "withdraw" | "bet" | "win";

export interface Transaction {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  description: string;
  createdAt: string;
  betId?: string;
}
