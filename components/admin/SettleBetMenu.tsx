"use client";

import { useState } from "react";
import { logAdminAction } from "@/lib/admin-store";
import { adminSettleBet } from "@/lib/bet-store";
import { adminSettleBetApi, useBackendApi } from "@/lib/backend-client";
import { backendBetToPlacedBet } from "@/lib/backend-mappers";
import type { PlacedBet } from "@/lib/bet-types";
import { formatMoney } from "@/lib/utils";

interface SettleBetMenuProps {
  bet: PlacedBet;
  onSettled?: (bet: PlacedBet, message: string) => void;
  defaultOpen?: boolean;
  size?: "sm" | "md";
}

export function SettleBetMenu({
  bet,
  onSettled,
  defaultOpen = false,
  size = "md",
}: SettleBetMenuProps) {
  const backendMode = useBackendApi();
  const [open, setOpen] = useState(defaultOpen);

  if (bet.status !== "open") {
    return <span className="text-[10px] text-muted">Settled</span>;
  }

  async function handleSettle(status: PlacedBet["status"]) {
    let updated: PlacedBet | null = null;
    if (backendMode) {
      try {
        const remote = await adminSettleBetApi(bet.id, status);
        updated = backendBetToPlacedBet(remote);
      } catch {
        onSettled?.(bet, "Could not settle bet");
        return;
      }
    } else {
      updated = adminSettleBet(bet.id, status);
    }
    if (!updated) {
      onSettled?.(bet, "Could not settle bet");
      return;
    }

    logAdminAction(
      "Settle bet",
      `${updated.bookingCode} → ${status}${
        status === "won" ? ` (${formatMoney(updated.potentialWin)})` : ""
      }`,
      { betId: updated.id, bookingCode: updated.bookingCode },
    );

    setOpen(false);
    const message =
      status === "won"
        ? `Settled as won. ${formatMoney(updated.potentialWin)} credited.`
        : status === "void"
          ? `Voided. ${formatMoney(updated.stake)} refunded to user.`
          : `Bet marked as ${status}.`;
    onSettled?.(updated, message);
  }

  const btnClass =
    size === "sm"
      ? "rounded-md bg-brand px-2 py-0.5 text-[10px] font-medium text-white"
      : "rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={btnClass}
      >
        Settle ▾
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10 cursor-default"
            aria-label="Close settle menu"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full z-20 mt-1 min-w-[140px] overflow-hidden rounded-md border border-border bg-white shadow-lg">
            <button
              type="button"
              onClick={() => handleSettle("won")}
              className="block w-full px-3 py-2 text-left text-xs font-medium text-accent hover:bg-brand-light/50"
            >
              Settle as won
            </button>
            <button
              type="button"
              onClick={() => handleSettle("lost")}
              className="block w-full border-t border-border/60 px-3 py-2 text-left text-xs font-medium text-live hover:bg-brand-light/50"
            >
              Settle as lost
            </button>
            <button
              type="button"
              onClick={() => handleSettle("void")}
              className="block w-full border-t border-border/60 px-3 py-2 text-left text-xs text-muted hover:bg-brand-light/50"
            >
              Settle as void
            </button>
          </div>
        </>
      )}
    </div>
  );
}
