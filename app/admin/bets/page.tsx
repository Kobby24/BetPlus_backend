"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminGate } from "@/components/admin/AdminGate";
import { DemoSeedPanel } from "@/components/admin/DemoSeedPanel";
import { SettleBetMenu } from "@/components/admin/SettleBetMenu";
import { betWasCorrected, openSupportClaimsCount } from "@/lib/bet-record";
import { getAllUsers } from "@/lib/auth-store";
import { getAllBets } from "@/lib/bet-store";
import { seedUser1DemoSlip } from "@/lib/demo-seed";
import type { PlacedBet } from "@/lib/bet-types";
import type { User } from "@/lib/user-types";
import { adminGetBets, adminGetUsers, useBackendApi } from "@/lib/backend-client";
import { backendBetToPlacedBet, backendUserToLocal } from "@/lib/backend-mappers";
import { formatMoney } from "@/lib/utils";

const STATUS_CLASS: Record<PlacedBet["status"], string> = {
  open: "text-brand",
  won: "text-accent",
  lost: "text-live",
  void: "text-muted",
};

export default function AdminBetsPage() {
  const backendMode = useBackendApi();
  const [bets, setBets] = useState<PlacedBet[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [demo, setDemo] = useState<{
    user: User;
    bet: PlacedBet;
    created: boolean;
  } | null>(null);
  const [filter, setFilter] = useState<
    PlacedBet["status"] | "all" | "claims" | "edit"
  >("all");

  const reload = useCallback(async () => {
    if (backendMode) {
      setDemo(null);
      const [remoteBets, remoteUsers] = await Promise.all([
        adminGetBets(),
        adminGetUsers(),
      ]);
      setBets(remoteBets.map(backendBetToPlacedBet));
      setUsers(remoteUsers.map(backendUserToLocal));
      return;
    }
    setDemo(seedUser1DemoSlip());
    setBets(getAllBets());
    setUsers(getAllUsers());
  }, [backendMode]);

  useEffect(() => {
    void reload();
  }, [reload]);
  const userName = (id: string) =>
    users.find((u) => u.id === id)?.name ?? id.slice(0, 8);

  const filtered =
    filter === "all"
      ? bets
      : filter === "claims"
        ? bets.filter((b) => openSupportClaimsCount(b) > 0)
        : filter === "edit"
          ? bets.filter((b) => betWasCorrected(b))
          : bets.filter((b) => b.status === filter);

  return (
    <AdminGate>
      <div className="space-y-4">
        <div>
          <h1 className="page-title">Bets</h1>
          <p className="text-xs text-muted">
            View placement records, log support claims, and settle outcomes. Use{" "}
            <strong className="font-medium text-brand-dark">Settle ▾</strong> on
            open bets — it only appears while status is{" "}
            <span className="font-medium">open</span>.
          </p>
        </div>

        {!backendMode && <DemoSeedPanel demo={demo} onReload={() => void reload()} />}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {(["all", "claims", "open", "won", "lost", "void"] as const).map(
              (s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFilter(s)}
                  className={`rounded-full px-3 py-1 text-[11px] font-medium ${
                    filter === s
                      ? "bg-brand text-white"
                      : "border border-border text-muted"
                  }`}
                >
                  {s === "all"
                    ? "All"
                    : s === "claims"
                      ? "Open claims"
                      : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ),
            )}
          </div>
          <button
            type="button"
            onClick={() => setFilter("edit")}
            className={`rounded-full px-3 py-1 text-[11px] font-medium ${
              filter === "edit"
                ? "bg-brand text-white"
                : "border border-border text-muted"
            }`}
          >
            Edit
          </button>
        </div>

        <div className="card overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-brand-light/50 text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Code</th>
                <th className="px-3 py-2 font-medium">User</th>
                <th className="px-3 py-2 font-medium">Legs</th>
                <th className="px-3 py-2 font-medium">Stake</th>
                <th className="px-3 py-2 font-medium">Potential</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Claims</th>
                <th className="px-3 py-2 font-medium">Edit</th>
                <th className="px-3 py-2 font-medium">Settle</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-muted">
                    No bets found.
                  </td>
                </tr>
              ) : (
                filtered.map((bet) => {
                  const openClaims = openSupportClaimsCount(bet);
                  const corrected = betWasCorrected(bet);
                  return (
                    <tr key={bet.id} className="border-b border-border/60">
                      <td className="px-3 py-2 font-medium">
                        {bet.bookingCode}
                        {corrected && (
                          <span className="ml-1.5 rounded-full bg-brand/10 px-1.5 py-0.5 text-[9px] font-medium text-brand">
                            edited
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">{userName(bet.userId)}</td>
                      <td className="px-3 py-2">{bet.selections.length}</td>
                      <td className="px-3 py-2">{formatMoney(bet.stake)}</td>
                      <td className="px-3 py-2">
                        {formatMoney(bet.potentialWin)}
                      </td>
                      <td
                        className={`px-3 py-2 font-medium ${STATUS_CLASS[bet.status]}`}
                      >
                        {bet.status}
                      </td>
                      <td className="px-3 py-2">
                        {openClaims > 0 ? (
                          <span className="rounded-full bg-live/10 px-2 py-0.5 text-[10px] font-medium text-live">
                            {openClaims} open
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/admin/bets/${bet.id}`}
                          className="rounded-md border border-brand px-2 py-0.5 text-[10px] font-medium text-brand hover:bg-brand/5"
                        >
                          Edit
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <SettleBetMenu
                          bet={bet}
                          size="sm"
                          onSettled={() => reload()}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminGate>
  );
}
