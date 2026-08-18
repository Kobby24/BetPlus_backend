"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminGate } from "@/components/admin/AdminGate";
import { DemoSeedPanel } from "@/components/admin/DemoSeedPanel";
import { logAdminAction } from "@/lib/admin-store";
import { getAllUsers, setUserManagerRole, updateUserBalance } from "@/lib/auth-store";
import { addTransaction } from "@/lib/bet-store";
import { recordAdminCredit } from "@/lib/platform-store";
import { trackReferralDeposit } from "@/lib/referral-store";
import { seedUser1DemoSlip } from "@/lib/demo-seed";
import type { PlacedBet } from "@/lib/bet-types";
import type { User } from "@/lib/user-types";
import {
  adminCreditUser,
  adminGetUsers,
  adminPatchUser,
  useBackendApi,
} from "@/lib/backend-client";
import { backendUserToLocal } from "@/lib/backend-mappers";
import { formatMoney } from "@/lib/utils";

export default function AdminUsersPage() {
  const backendMode = useBackendApi();
  const [users, setUsers] = useState<User[]>([]);
  const [demo, setDemo] = useState<{
    user: User;
    bet: PlacedBet;
    created: boolean;
  } | null>(null);
  const [creditUserId, setCreditUserId] = useState<string | null>(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditNote, setCreditNote] = useState("Admin credit");
  const [message, setMessage] = useState("");

  const reload = useCallback(async () => {
    if (backendMode) {
      setDemo(null);
      const remote = await adminGetUsers();
      setUsers(remote.map(backendUserToLocal));
      return;
    }
    setDemo(seedUser1DemoSlip());
    setUsers(getAllUsers());
  }, [backendMode]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleCredit(e: React.FormEvent) {
    e.preventDefault();
    if (!creditUserId) return;

    const amount = Number.parseFloat(creditAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage("Enter a valid amount");
      return;
    }

    if (backendMode) {
      try {
        await adminCreditUser(creditUserId, amount, creditNote.trim() || "Admin credit");
        const user = users.find((u) => u.id === creditUserId);
        setCreditUserId(null);
        setCreditAmount("");
        setCreditNote("Admin credit");
        setMessage(`Credited ${formatMoney(amount)} to ${user?.name ?? "user"}`);
        await reload();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Credit failed");
      }
      return;
    }

    const result = updateUserBalance(creditUserId, amount);
    if ("error" in result) {
      setMessage(result.error);
      return;
    }

    const tx = addTransaction({
      userId: creditUserId,
      type: "deposit",
      amount,
      description: creditNote.trim() || "Deposit",
    });
    recordAdminCredit(
      creditUserId,
      amount,
      creditNote.trim() || "Admin credit",
    );
    trackReferralDeposit(creditUserId, amount, tx.id);

    const user = result.user;
    logAdminAction(
      "Credit wallet",
      `${user.email} +${formatMoney(amount)} (${creditNote.trim() || "Deposit"})`,
    );

    setCreditUserId(null);
    setCreditAmount("");
    setCreditNote("Admin credit");
    setMessage(`Credited ${formatMoney(amount)} to ${user.name}`);
    void reload();
  }

  async function handleToggleManager(user: User) {
    const next = !user.isManager;
    if (backendMode) {
      try {
        await adminPatchUser(user.id, { is_manager: next });
        setMessage(
          next
            ? `${user.name} is now a manager.`
            : `Manager access removed for ${user.name}`,
        );
        await reload();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Update failed");
      }
      return;
    }
    const result = setUserManagerRole(user.id, next);
    if ("error" in result) {
      setMessage(result.error);
      return;
    }
    logAdminAction(
      next ? "Grant manager" : "Revoke manager",
      `${result.user.email} → ${next ? "manager" : "user only"}`,
    );
    setMessage(
      next
        ? `${result.user.name} is now a manager. They must use the main app (localhost:3000), log in as that user, then open Me → Manager tools. Admin on port 3001 uses separate browser data.`
        : `Manager access removed for ${result.user.name}`,
    );
    void reload();
  }

  return (
    <AdminGate>
      <div className="space-y-4">
        <div>
          <h1 className="page-title">Users</h1>
          <p className="text-xs text-muted">
            Credits appear in the user wallet as deposits for staking.
          </p>
        </div>

        {!backendMode && <DemoSeedPanel demo={demo} onReload={() => void reload()} />}

        {message && (
          <p className="rounded-md border border-brand/20 bg-brand/5 px-3 py-2 text-xs text-brand-dark">
            {message}
          </p>
        )}

        <div className="card overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-brand-light/50 text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Phone</th>
                <th className="px-3 py-2 font-medium">Balance</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center">
                    <p className="text-muted">No users yet.</p>
                    <button
                      type="button"
                      onClick={reload}
                      className="mt-2 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white"
                    >
                      Load User1 demo
                    </button>
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="border-b border-border/60">
                    <td className="px-3 py-2 font-medium">{user.name}</td>
                    <td className="px-3 py-2">{user.email}</td>
                    <td className="px-3 py-2">{user.phone}</td>
                    <td className="px-3 py-2">{formatMoney(user.balance)}</td>
                    <td className="px-3 py-2">
                      {user.isManager ? (
                        <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-medium text-brand">
                          Manager
                        </span>
                      ) : (
                        <span className="text-muted">User</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/admin/users/${user.id}`}
                          className="text-brand hover:underline"
                        >
                          View
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleToggleManager(user)}
                          className="text-brand hover:underline"
                        >
                          {user.isManager ? "Revoke mgr" : "Make mgr"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCreditUserId(user.id);
                            setMessage("");
                          }}
                          className="text-brand hover:underline"
                        >
                          Credit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {creditUserId && (
          <form onSubmit={handleCredit} className="card max-w-md space-y-3 p-4">
            <h2 className="text-sm font-semibold text-brand-dark">Credit wallet</h2>
            <label className="block">
              <span className="mb-1 block text-[11px] text-muted">Amount (GH₵)</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={creditAmount}
                onChange={(e) => setCreditAmount(e.target.value)}
                className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-brand"
                required
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-muted">
                Description (shown in user history)
              </span>
              <input
                type="text"
                value={creditNote}
                onChange={(e) => setCreditNote(e.target.value)}
                className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="submit"
                className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white"
              >
                Add credit
              </button>
              <button
                type="button"
                onClick={() => setCreditUserId(null)}
                className="rounded-md border border-border px-3 py-1.5 text-xs"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </AdminGate>
  );
}
