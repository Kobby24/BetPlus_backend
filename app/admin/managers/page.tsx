"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AdminGate } from "@/components/admin/AdminGate";
import {
  MANAGER_REFERRAL_SHARE,
  getAllManagersReferralOverview,
  type AdminManagerReferralRow,
} from "@/lib/referral-store";
import { adminGetReferrals, useBackendApi } from "@/lib/backend-client";
import { formatMoney } from "@/lib/utils";

export default function AdminManagersPage() {
  const router = useRouter();
  const backendMode = useBackendApi();
  const [managers, setManagers] = useState<AdminManagerReferralRow[]>([]);

  useEffect(() => {
    async function load() {
      if (backendMode) {
        const remote = await adminGetReferrals();
        setManagers(
          remote.map((row) => ({
            managerId: row.manager_id,
            name: row.name,
            email: row.email,
            referralCode: row.referral_code,
            signupCount: row.signup_count,
            totalDeposits: row.total_deposits,
            grossRevenue: row.gross_revenue,
            managerEarnings: row.manager_earnings,
            platformEarnings: row.platform_earnings,
          })),
        );
        return;
      }
      setManagers(getAllManagersReferralOverview());
    }
    void load();
  }, [backendMode]);

  const totals = managers.reduce(
    (acc, row) => ({
      signups: acc.signups + row.signupCount,
      deposits: acc.deposits + row.totalDeposits,
      gross: acc.gross + row.grossRevenue,
      managerShare: acc.managerShare + row.managerEarnings,
      platformShare: acc.platformShare + row.platformEarnings,
    }),
    { signups: 0, deposits: 0, gross: 0, managerShare: 0, platformShare: 0 },
  );

  const managerSharePct = Math.round(MANAGER_REFERRAL_SHARE * 100);
  const platformSharePct = 100 - managerSharePct;

  return (
    <AdminGate>
      <div className="space-y-4">
        <div>
          <h1 className="page-title">Managers & referrals</h1>
          <p className="text-xs text-muted">
            Each manager has a separate view. Click a row to open that
            manager&apos;s referrals and revenue only — no mixed totals.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: "Managers", value: String(managers.length) },
            { label: "Total referrals", value: String(totals.signups) },
            { label: "Referral deposits", value: formatMoney(totals.deposits) },
            { label: "Gross referral revenue", value: formatMoney(totals.gross) },
            {
              label: `Platform share (${platformSharePct}%)`,
              value: formatMoney(totals.platformShare),
            },
          ].map((item) => (
            <div key={item.label} className="card p-3">
              <p className="text-[11px] text-muted">{item.label}</p>
              <p className="mt-1 text-lg font-semibold text-brand-dark">
                {item.value}
              </p>
            </div>
          ))}
        </div>

        <div className="card overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-brand-light/50 text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Manager</th>
                <th className="px-3 py-2 font-medium">Referral code</th>
                <th className="px-3 py-2 font-medium">Referrals</th>
                <th className="px-3 py-2 font-medium">Deposits</th>
                <th className="px-3 py-2 font-medium">Gross revenue</th>
                <th className="px-3 py-2 font-medium">Manager ({managerSharePct}%)</th>
                <th className="px-3 py-2 font-medium">Platform ({platformSharePct}%)</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {managers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-muted">
                    No managers yet. Grant manager access under Users.
                  </td>
                </tr>
              ) : (
                managers.map((row) => (
                  <tr
                    key={row.managerId}
                    className="cursor-pointer border-b border-border/60 transition-colors hover:bg-brand-light/30"
                    onClick={() => router.push(`/admin/managers/${row.managerId}`)}
                  >
                    <td className="px-3 py-2">
                      <p className="font-medium text-brand-dark">{row.name}</p>
                      <p className="text-[10px] text-muted">{row.email}</p>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px]">
                      {row.referralCode || "—"}
                    </td>
                    <td className="px-3 py-2">{row.signupCount}</td>
                    <td className="px-3 py-2">{formatMoney(row.totalDeposits)}</td>
                    <td className="px-3 py-2 font-semibold text-brand-dark">
                      {formatMoney(row.grossRevenue)}
                    </td>
                    <td className="px-3 py-2 text-muted">
                      {formatMoney(row.managerEarnings)}
                    </td>
                    <td className="px-3 py-2 text-brand">
                      {formatMoney(row.platformEarnings)}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/managers/${row.managerId}`}
                        className="text-brand hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminGate>
  );
}
