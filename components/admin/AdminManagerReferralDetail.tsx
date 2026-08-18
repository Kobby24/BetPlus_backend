"use client";

import { useEffect, useState } from "react";
import {
  MANAGER_REFERRAL_SHARE,
  REFERRAL_COMMISSION_RATE,
  getManagerReferralDeposits,
  getManagerReferralStats,
  managerShareAmount,
  platformShareAmount,
  type ManagerReferralStats,
  type ReferralDeposit,
} from "@/lib/referral-store";
import type { User } from "@/lib/user-types";
import { adminGetReferralDetail, useBackendApi } from "@/lib/backend-client";
import { backendReferralStatsToLocal } from "@/lib/backend-mappers";
import { formatMoney } from "@/lib/utils";

interface AdminManagerReferralDetailProps {
  manager: User;
}

function CopyLinkButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-md border border-brand px-2.5 py-1 text-[10px] font-semibold text-brand hover:bg-brand-light/40"
    >
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}

/** Isolated referral dashboard for one manager — stats never mix with other managers. */
export function AdminManagerReferralDetail({
  manager,
}: AdminManagerReferralDetailProps) {
  const backendMode = useBackendApi();
  const [stats, setStats] = useState<ManagerReferralStats | null>(null);
  const [deposits, setDeposits] = useState<ReferralDeposit[]>([]);

  useEffect(() => {
    async function load() {
      if (backendMode) {
        const remote = await adminGetReferralDetail(manager.id);
        setStats(backendReferralStatsToLocal(remote, "admin"));
        setDeposits([]);
        return;
      }
      setStats(getManagerReferralStats(manager.id, "", "admin"));
      setDeposits(getManagerReferralDeposits(manager.id));
    }
    void load();
  }, [backendMode, manager.id]);

  if (!stats) {
    return <p className="text-sm text-muted">Loading manager data…</p>;
  }

  const managerSharePct = Math.round(MANAGER_REFERRAL_SHARE * 100);
  const platformSharePct = 100 - managerSharePct;
  const commissionPct = Math.round(REFERRAL_COMMISSION_RATE * 100);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-brand/20 bg-brand/5 px-4 py-3">
        <p className="text-xs font-medium text-brand-dark">
          Separate account for {manager.name}
        </p>
        <p className="mt-1 text-[11px] text-muted">
          All numbers below belong only to this manager. Referrals, deposits, and
          revenue from other managers are not included.
        </p>
      </div>

      <div className="card p-4">
        <p className="text-[11px] font-medium text-muted">Invitation link</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-surface-elevated px-3 py-2 text-[11px] text-brand-dark">
            {stats.inviteLink || "—"}
          </code>
          {stats.inviteLink && <CopyLinkButton value={stats.inviteLink} />}
        </div>
        <p className="mt-2 text-[10px] text-muted">
          Code: <span className="font-mono font-semibold">{stats.referralCode}</span>
          {" · "}
          Only signups with this code count here
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="card p-3">
          <p className="text-[11px] text-muted">People referred</p>
          <p className="mt-1 text-xl font-semibold">{stats.signupCount}</p>
        </div>
        <div className="card p-3">
          <p className="text-[11px] text-muted">Referral deposits</p>
          <p className="mt-1 text-xl font-semibold">
            {formatMoney(stats.totalDeposits)}
          </p>
        </div>
        <div className="card p-3">
          <p className="text-[11px] text-muted">
            Gross revenue ({commissionPct}%)
          </p>
          <p className="mt-1 text-xl font-semibold text-brand-dark">
            {formatMoney(stats.grossRevenue)}
          </p>
        </div>
        <div className="card p-3">
          <p className="text-[11px] text-muted">Manager share ({managerSharePct}%)</p>
          <p className="mt-1 text-xl font-semibold text-muted">
            {formatMoney(stats.managerEarnings)}
          </p>
        </div>
        <div className="card p-3">
          <p className="text-[11px] text-muted">Platform share ({platformSharePct}%)</p>
          <p className="mt-1 text-xl font-semibold text-brand">
            {formatMoney(stats.platformEarnings)}
          </p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-border bg-brand-light/40 px-3 py-2">
          <h2 className="text-sm font-semibold text-brand-dark">
            Referred users ({manager.name} only)
          </h2>
        </div>
        {stats.referrals.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted">
            No one has registered with this manager&apos;s link yet.
          </p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Phone</th>
                <th className="px-3 py-2 font-medium">Joined</th>
                <th className="px-3 py-2 font-medium">Deposits</th>
                <th className="px-3 py-2 font-medium">Gross revenue</th>
                <th className="px-3 py-2 font-medium">Manager share</th>
              </tr>
            </thead>
            <tbody>
              {stats.referrals.map((referral) => (
                <tr key={referral.userId} className="border-b border-border/60">
                  <td className="px-3 py-2 font-medium">{referral.name}</td>
                  <td className="px-3 py-2">{referral.email}</td>
                  <td className="px-3 py-2">{referral.phone}</td>
                  <td className="px-3 py-2 text-muted">
                    {new Date(referral.signedUpAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-3 py-2">
                    {formatMoney(referral.totalDeposited)}
                  </td>
                  <td className="px-3 py-2 font-semibold">
                    {formatMoney(referral.grossRevenue)}
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {formatMoney(referral.commissionEarned)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-border bg-brand-light/40 px-3 py-2">
          <h2 className="text-sm font-semibold text-brand-dark">
            Deposit ledger ({manager.name} only)
          </h2>
          <p className="text-[10px] text-muted">
            Each row is tied to this manager — no shared pool with other managers
          </p>
        </div>
        {deposits.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted">
            No referral deposits recorded yet.
          </p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Referred user</th>
                <th className="px-3 py-2 font-medium">Deposit</th>
                <th className="px-3 py-2 font-medium">Gross revenue</th>
                <th className="px-3 py-2 font-medium">Manager share</th>
                <th className="px-3 py-2 font-medium">Platform share</th>
              </tr>
            </thead>
            <tbody>
              {deposits.map((entry) => {
                const referred = stats.referrals.find(
                  (r) => r.userId === entry.referredUserId,
                );
                return (
                  <tr key={entry.id} className="border-b border-border/60">
                    <td className="px-3 py-2 text-muted">
                      {new Date(entry.at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-3 py-2">
                      {referred?.name ?? entry.referredUserId.slice(0, 8)}
                    </td>
                    <td className="px-3 py-2">{formatMoney(entry.amount)}</td>
                    <td className="px-3 py-2 font-semibold">
                      {formatMoney(entry.commission)}
                    </td>
                    <td className="px-3 py-2 text-muted">
                      {formatMoney(managerShareAmount(entry.commission))}
                    </td>
                    <td className="px-3 py-2 text-brand">
                      {formatMoney(platformShareAmount(entry.commission))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
