"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminGate } from "@/components/admin/AdminGate";
import { DemoSeedPanel } from "@/components/admin/DemoSeedPanel";
import { getAdminAuditLog } from "@/lib/admin-store";
import { getAllBets } from "@/lib/bet-store";
import { getAllUsers } from "@/lib/auth-store";
import { getPlatformStats, getPlatformLedger } from "@/lib/platform-store";
import { seedUser1DemoSlip } from "@/lib/demo-seed";
import type { PlacedBet } from "@/lib/bet-types";
import type { User } from "@/lib/user-types";
import { getAllManagersReferralOverview } from "@/lib/referral-store";
import {
  adminGetAudit,
  adminGetLedger,
  adminGetReferrals,
  adminGetStats,
  useBackendApi,
} from "@/lib/backend-client";
import { formatMoney } from "@/lib/utils";

export default function AdminDashboardPage() {
  const backendMode = useBackendApi();
  const [stats, setStats] = useState({
    users: 0,
    bets: 0,
    open: 0,
    totalBalance: 0,
    platformBalance: 0,
    netPosition: 0,
  });
  const [demo, setDemo] = useState<{
    user: User;
    bet: PlacedBet;
    created: boolean;
  } | null>(null);
  const [ledger, setLedger] = useState<{ id: string; description: string; amount: number }[]>([]);
  const [audit, setAudit] = useState<{ id: string; action: string; detail: string; bookingCode?: string }[]>([]);
  const [referralSummary, setReferralSummary] = useState({
    managers: 0,
    signups: 0,
    gross: 0,
  });

  const reload = useCallback(async () => {
    if (backendMode) {
      setDemo(null);
      const [remoteStats, remoteLedger, remoteAudit, remoteRefs] = await Promise.all([
        adminGetStats(),
        adminGetLedger(),
        adminGetAudit(),
        adminGetReferrals(),
      ]);
      setStats({
        users: remoteStats.users,
        bets: remoteStats.bets,
        open: remoteStats.open_bets,
        totalBalance: remoteStats.total_user_balance,
        platformBalance: remoteStats.platform_balance,
        netPosition: remoteStats.net_position,
      });
      setLedger(
        remoteLedger.slice(0, 8).map((e) => ({
          id: e.id,
          description: e.description,
          amount: e.amount,
        })),
      );
      setAudit(
        remoteAudit.slice(0, 5).map((e) => ({
          id: e.id,
          action: e.action,
          detail: e.detail,
          bookingCode: e.booking_code ?? undefined,
        })),
      );
      setReferralSummary({
        managers: remoteRefs.length,
        signups: remoteRefs.reduce((s, r) => s + r.signup_count, 0),
        gross: remoteRefs.reduce((s, r) => s + r.gross_revenue, 0),
      });
      return;
    }

    setDemo(seedUser1DemoSlip());
    const users = getAllUsers();
    const bets = getAllBets();
    const userLiabilities = users.reduce((s, u) => s + u.balance, 0);
    const platform = getPlatformStats(userLiabilities);
    setStats({
      users: users.length,
      bets: bets.length,
      open: bets.filter((b) => b.status === "open").length,
      totalBalance: userLiabilities,
      platformBalance: platform.platformBalance,
      netPosition: platform.netPosition,
    });
    setLedger(getPlatformLedger().slice(0, 8));
    setAudit(getAdminAuditLog().slice(0, 5));
    const managerOverview = getAllManagersReferralOverview();
    setReferralSummary({
      managers: managerOverview.length,
      signups: managerOverview.reduce((s, r) => s + r.signupCount, 0),
      gross: managerOverview.reduce((s, r) => s + r.grossRevenue, 0),
    });
  }, [backendMode]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <AdminGate>
      <div className="space-y-5">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="text-xs text-muted">Platform overview</p>
        </div>

        {!backendMode && <DemoSeedPanel demo={demo} onReload={() => void reload()} />}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { label: "Platform balance (admin)", value: formatMoney(stats.platformBalance) },
            { label: "User wallets (liabilities)", value: formatMoney(stats.totalBalance) },
            { label: "Net house position", value: formatMoney(stats.netPosition) },
            { label: "Users", value: String(stats.users) },
            { label: "Total bets", value: String(stats.bets) },
            { label: "Open bets", value: String(stats.open) },
          ].map((item) => (
            <div key={item.label} className="card p-3">
              <p className="text-[11px] text-muted">{item.label}</p>
              <p className="mt-1 text-xl font-semibold text-brand-dark">
                {item.value}
              </p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card p-3">
            <h2 className="section-label mb-2">Platform ledger</h2>
            {ledger.length === 0 ? (
              <p className="text-xs text-muted">No platform movements yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {ledger.map((entry) => (
                  <li key={entry.id} className="text-[11px]">
                    <span className="font-medium">{entry.description}</span>
                    <span
                      className={
                        entry.amount >= 0 ? " text-accent" : " text-live"
                      }
                    >
                      {" "}
                      {entry.amount >= 0 ? "+" : ""}
                      {formatMoney(entry.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-3">
            <h2 className="section-label mb-2">Quick actions</h2>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/admin/users"
                className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white"
              >
                Manage users
              </Link>
              <Link
                href="/admin/managers"
                className="rounded-md border border-brand px-3 py-1.5 text-xs font-medium text-brand"
              >
                Manager referrals
              </Link>
              <Link
                href="/admin/bets"
                className="rounded-md border border-brand px-3 py-1.5 text-xs font-medium text-brand"
              >
                Manage bets
              </Link>
            </div>
          </section>

          <section className="card p-3">
            <h2 className="section-label mb-2">Manager referrals</h2>
            <p className="text-xs text-muted">
              {referralSummary.managers} manager
              {referralSummary.managers === 1 ? "" : "s"} · {referralSummary.signups}{" "}
              referral signups · {formatMoney(referralSummary.gross)} gross revenue
            </p>
            <Link
              href="/admin/managers"
              className="mt-2 inline-block text-xs font-medium text-brand hover:underline"
            >
              View all managers →
            </Link>
          </section>

          <section className="card p-3">
            <h2 className="section-label mb-2">Recent admin actions</h2>
            {audit.length === 0 ? (
              <p className="text-xs text-muted">No actions logged yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {audit.map((entry) => (
                  <li key={entry.id} className="text-[11px]">
                    <span className="font-medium text-foreground">{entry.action}</span>
                    <span className="text-muted"> — {entry.detail}</span>
                    {entry.bookingCode && (
                      <span className="text-muted"> ({entry.bookingCode})</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </AdminGate>
  );
}
