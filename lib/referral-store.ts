/**
 * Manager referral tracking — signups via ?ref=CODE and deposits from referred users.
 */

import {
  ensureManagerReferralCode,
  getAllUsers,
  getUserById,
} from "./auth-store";
import type { User } from "./user-types";

export const REFERRAL_COMMISSION_RATE = 0.05;
/** Managers receive this share of gross referral revenue; admin/platform keeps the rest. */
export const MANAGER_REFERRAL_SHARE = 0.5;
export const PENDING_REFERRAL_KEY = "betplus_pending_ref";

const REFERRALS_KEY = "betplus_referrals";

export interface ReferralDeposit {
  id: string;
  managerId: string;
  referredUserId: string;
  amount: number;
  commission: number;
  transactionId: string;
  at: string;
}

interface ReferralLedger {
  deposits: ReferralDeposit[];
}

function readLedger(): ReferralLedger {
  if (typeof window === "undefined") return { deposits: [] };
  try {
    const raw = localStorage.getItem(REFERRALS_KEY);
    if (!raw) return { deposits: [] };
    const parsed = JSON.parse(raw) as ReferralLedger;
    return { deposits: parsed.deposits ?? [] };
  } catch {
    return { deposits: [] };
  }
}

function writeLedger(ledger: ReferralLedger) {
  if (typeof window === "undefined") return;
  localStorage.setItem(REFERRALS_KEY, JSON.stringify(ledger));
}

export function managerShareAmount(gross: number): number {
  return Math.round(gross * MANAGER_REFERRAL_SHARE * 100) / 100;
}

export function platformShareAmount(gross: number): number {
  return Math.round(gross * (1 - MANAGER_REFERRAL_SHARE) * 100) / 100;
}

export type ReferralAudience = "manager" | "admin";

export function setPendingReferralCode(code: string) {
  if (typeof window === "undefined") return;
  const normalized = code.trim().toUpperCase();
  if (!normalized) return;
  sessionStorage.setItem(PENDING_REFERRAL_KEY, normalized);
}

export function getPendingReferralCode(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(PENDING_REFERRAL_KEY);
}

export function clearPendingReferralCode() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(PENDING_REFERRAL_KEY);
}

/** Record a deposit from a referred user toward their manager's stats. */
export function trackReferralDeposit(
  referredUserId: string,
  amount: number,
  transactionId: string,
): ReferralDeposit | null {
  if (typeof window === "undefined") return null;
  if (amount <= 0) return null;

  const referred = getUserById(referredUserId);
  const managerId = referred?.referredByManagerId;
  if (!managerId) return null;

  const manager = getUserById(managerId);
  if (!manager?.isManager) return null;

  const commission =
    Math.round(amount * REFERRAL_COMMISSION_RATE * 100) / 100;

  const entry: ReferralDeposit = {
    id: crypto.randomUUID(),
    managerId,
    referredUserId,
    amount,
    commission,
    transactionId,
    at: new Date().toISOString(),
  };

  const ledger = readLedger();
  ledger.deposits.unshift(entry);
  writeLedger(ledger);

  return entry;
}

export interface ReferredUserSummary {
  userId: string;
  name: string;
  email: string;
  phone: string;
  signedUpAt: string;
  depositCount: number;
  totalDeposited: number;
  /** Gross referral revenue from this user (admin view). */
  grossRevenue: number;
  /** Manager-facing earnings (50% of gross). */
  commissionEarned: number;
}

export interface ManagerReferralStats {
  referralCode: string;
  inviteLink: string;
  signupCount: number;
  totalDeposits: number;
  /** Full referral revenue — admin sees this. */
  grossRevenue: number;
  /** Manager's 50% share. */
  managerEarnings: number;
  /** Platform's 50% share. */
  platformEarnings: number;
  /** Primary earnings figure for the current audience. */
  totalCommission: number;
  referrals: ReferredUserSummary[];
}

export interface AdminManagerReferralRow {
  managerId: string;
  name: string;
  email: string;
  referralCode: string;
  signupCount: number;
  totalDeposits: number;
  grossRevenue: number;
  managerEarnings: number;
  platformEarnings: number;
}

export function getManagerReferralDeposits(managerId: string): ReferralDeposit[] {
  return readLedger()
    .deposits.filter((entry) => entry.managerId === managerId)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export function getManagerReferralStats(
  managerId: string,
  origin = "",
  audience: ReferralAudience = "manager",
): ManagerReferralStats {
  const referralCode = ensureManagerReferralCode(managerId) ?? "";
  const baseOrigin =
    origin ||
    (typeof window !== "undefined" ? window.location.origin : "");
  const inviteLink = referralCode
    ? `${baseOrigin}/?ref=${encodeURIComponent(referralCode)}`
    : "";

  const referredUsers = getAllUsers().filter(
    (user) => user.referredByManagerId === managerId,
  );

  const deposits = readLedger().deposits.filter(
    (entry) => entry.managerId === managerId,
  );

  const referrals: ReferredUserSummary[] = referredUsers.map((user) => {
    const userDeposits = deposits.filter(
      (entry) => entry.referredUserId === user.id,
    );
    const grossRevenue = userDeposits.reduce(
      (sum, entry) => sum + entry.commission,
      0,
    );
    return {
      userId: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      signedUpAt: user.createdAt,
      depositCount: userDeposits.length,
      totalDeposited: userDeposits.reduce((sum, entry) => sum + entry.amount, 0),
      grossRevenue,
      commissionEarned: managerShareAmount(grossRevenue),
    };
  });

  referrals.sort(
    (a, b) =>
      new Date(b.signedUpAt).getTime() - new Date(a.signedUpAt).getTime(),
  );

  const totalDeposits = deposits.reduce((sum, entry) => sum + entry.amount, 0);
  const grossRevenue = deposits.reduce(
    (sum, entry) => sum + entry.commission,
    0,
  );
  const managerEarnings = managerShareAmount(grossRevenue);
  const platformEarnings = platformShareAmount(grossRevenue);

  return {
    referralCode,
    inviteLink,
    signupCount: referredUsers.length,
    totalDeposits,
    grossRevenue,
    managerEarnings,
    platformEarnings,
    totalCommission:
      audience === "admin" ? grossRevenue : managerEarnings,
    referrals,
  };
}

export function getAllManagersReferralOverview(): AdminManagerReferralRow[] {
  const managers = getAllUsers().filter((user) => user.isManager === true);

  return managers
    .map((manager) => {
      const stats = getManagerReferralStats(manager.id, "", "admin");
      return {
        managerId: manager.id,
        name: manager.name,
        email: manager.email,
        referralCode: stats.referralCode,
        signupCount: stats.signupCount,
        totalDeposits: stats.totalDeposits,
        grossRevenue: stats.grossRevenue,
        managerEarnings: stats.managerEarnings,
        platformEarnings: stats.platformEarnings,
      };
    })
    .sort((a, b) => b.grossRevenue - a.grossRevenue);
}

export { findManagerByReferralCode } from "./auth-store";
