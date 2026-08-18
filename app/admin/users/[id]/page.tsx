"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AdminGate } from "@/components/admin/AdminGate";
import { getUserById, setUserBalance, setUserManagerRole } from "@/lib/auth-store";
import { getBetsByUser, getTransactionsByUser } from "@/lib/bet-store";
import { logAdminAction } from "@/lib/admin-store";
import type { PlacedBet } from "@/lib/bet-types";
import type { Transaction } from "@/lib/bet-types";
import type { User } from "@/lib/user-types";
import {
  adminGetUser,
  adminGetUserBets,
  adminGetUserTransactions,
  adminPatchUser,
  useBackendApi,
} from "@/lib/backend-client";
import { backendBetToPlacedBet, backendTransactionToLocal, backendUserToLocal } from "@/lib/backend-mappers";
import { formatMoney } from "@/lib/utils";

export default function AdminUserDetailPage() {
  const params = useParams();
  const userId = params.id as string;
  const backendMode = useBackendApi();
  const [user, setUser] = useState<User | null>(null);
  const [bets, setBets] = useState<PlacedBet[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [balanceInput, setBalanceInput] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (backendMode) {
      try {
        const [remoteUser, remoteBets, remoteTx] = await Promise.all([
          adminGetUser(userId),
          adminGetUserBets(userId),
          adminGetUserTransactions(userId),
        ]);
        const mapped = backendUserToLocal(remoteUser);
        setUser(mapped);
        setBalanceInput(String(mapped.balance));
        setBets(remoteBets.map(backendBetToPlacedBet));
        setTransactions(remoteTx.map(backendTransactionToLocal));
      } catch {
        setUser(null);
      }
      return;
    }
    const u = getUserById(userId);
    setUser(u);
    if (u) {
      setBalanceInput(String(u.balance));
      setBets(getBetsByUser(userId));
      setTransactions(getTransactionsByUser(userId));
    }
  }, [backendMode, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSetBalance(e: React.FormEvent) {
    e.preventDefault();
    const balance = Number.parseFloat(balanceInput);
    if (!Number.isFinite(balance) || balance < 0) {
      setMessage("Enter a valid balance");
      return;
    }

    if (backendMode) {
      try {
        const remote = await adminPatchUser(userId, { balance });
        setUser(backendUserToLocal(remote));
        setMessage("Balance updated");
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Update failed");
      }
      return;
    }

    const result = setUserBalance(userId, balance);
    if ("error" in result) {
      setMessage(result.error);
      return;
    }

    logAdminAction(
      "Set balance",
      `${result.user.email} → ${formatMoney(balance)}`,
    );
    setUser(result.user);
    setMessage("Balance updated");
  }

  async function handleToggleManager() {
    if (!user) return;
    const next = !user.isManager;
    if (backendMode) {
      try {
        const remote = await adminPatchUser(userId, { is_manager: next });
        setUser(backendUserToLocal(remote));
        setMessage(
          next
            ? `${remote.name} is now a manager — Manager tab will show in their app.`
            : `Manager access removed for ${remote.name}.`,
        );
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Update failed");
      }
      return;
    }
    const result = setUserManagerRole(userId, next);
    if ("error" in result) {
      setMessage(result.error);
      return;
    }
    logAdminAction(
      next ? "Grant manager" : "Revoke manager",
      `${result.user.email} → ${next ? "manager" : "user only"}`,
    );
    setUser(result.user);
    setMessage(
      next
        ? `${result.user.name} is now a manager — Manager tab will show in their app.`
        : `Manager access removed for ${result.user.name}.`,
    );
  }

  if (!user) {
    return (
      <AdminGate>
        <p className="text-sm text-muted">User not found.</p>
        <Link href="/admin/users" className="mt-2 inline-block text-xs text-brand">
          ← Back to users
        </Link>
      </AdminGate>
    );
  }

  const displayTransactions = backendMode
    ? transactions
    : getTransactionsByUser(userId);

  return (
    <AdminGate>
      <div className="space-y-4">
        <Link href="/admin/users" className="text-xs text-brand hover:underline">
          ← Users
        </Link>

        <div>
          <h1 className="page-title">{user.name}</h1>
          <p className="text-xs text-muted">
            {user.email} · {user.phone}
            {user.isManager && (
              <span className="ml-2 rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand">
                Manager
              </span>
            )}
          </p>
        </div>

        {message && (
          <p className="rounded-md border border-brand/20 bg-brand/5 px-3 py-2 text-xs">
            {message}
          </p>
        )}

        <form onSubmit={handleSetBalance} className="card flex flex-wrap items-end gap-3 p-3">
          <label className="block">
            <span className="mb-1 block text-[11px] text-muted">Set balance</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={balanceInput}
              onChange={(e) => setBalanceInput(e.target.value)}
              className="w-40 rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-brand px-3 py-2 text-xs font-medium text-white"
          >
            Save balance
          </button>
        </form>

        <section className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <h2 className="text-sm font-semibold text-brand-dark">Manager role</h2>
            <p className="mt-1 text-xs text-muted">
              Managers use the same login as users. They get a Manager tab in the
              footer to update match results.
            </p>
          </div>
          <button
            type="button"
            onClick={handleToggleManager}
            className={`rounded-md px-4 py-2 text-xs font-semibold ${
              user.isManager
                ? "border border-live/40 text-live"
                : "bg-brand text-white"
            }`}
          >
            {user.isManager ? "Remove manager access" : "Register as manager"}
          </button>
        </section>

        <section className="card p-3">
          <h2 className="section-label mb-2">Bets ({bets.length})</h2>
          {bets.length === 0 ? (
            <p className="text-xs text-muted">No bets.</p>
          ) : (
            <ul className="space-y-2">
              {bets.map((bet) => (
                <li
                  key={bet.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2 text-xs last:border-0"
                >
                  <div>
                    <span className="font-medium">{bet.bookingCode}</span>
                    <span className="text-muted"> · {bet.status}</span>
                    <span className="text-muted"> · {formatMoney(bet.stake)}</span>
                  </div>
                  <Link href={`/admin/bets/${bet.id}`} className="text-brand hover:underline">
                    Edit
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-3">
          <h2 className="section-label mb-2">Transactions</h2>
          {transactions.length === 0 ? (
            <p className="text-xs text-muted">No transactions.</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {displayTransactions.slice(0, 20).map((tx) => (
                <li key={tx.id} className="flex justify-between gap-2">
                  <span>{tx.description}</span>
                  <span className={tx.amount >= 0 ? "text-accent" : "text-live"}>
                    {tx.amount >= 0 ? "+" : ""}
                    {formatMoney(tx.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AdminGate>
  );
}
