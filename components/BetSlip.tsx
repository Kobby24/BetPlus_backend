"use client";

import { useBetSlip } from "@/lib/betslip-context";
import { useAuth } from "@/lib/auth-context";
import {
  generateSlipCode,
  placeBetForUser,
  saveSharedSlipCode,
} from "@/lib/bet-store";
import { ApiError, placeBet as apiPlaceBet, useBackendApi } from "@/lib/backend-client";
import { backendBetToPlacedBet, localSelectionToBackend } from "@/lib/backend-mappers";
import type { PlacedBet } from "@/lib/bet-types";
import { formatMoney, formatOdds } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { BookingCodeDisplay } from "./BookingCodeDisplay";
import { BetTicketsPanel } from "./BetTicketsPanel";

interface BetSlipProps {
  variant?: "sidebar" | "sheet";
  onClose?: () => void;
}

export function BetSlip({ variant = "sidebar", onClose }: BetSlipProps) {
  const router = useRouter();
  const backendMode = useBackendApi();
  const slipRef = useRef<HTMLElement>(null);
  const { user, openLogin, refreshUser } = useAuth();
  const {
    selections,
    activeSelections,
    stake,
    setStake,
    betType,
    setBetType,
    betMode,
    setBetMode,
    slipTab,
    setSlipTab,
    flexiEnabled,
    setFlexiEnabled,
    removeSelection,
    clearSlip,
    totalOdds,
    totalStake,
    maxBonus,
    potentialWin,
    selectionCount,
  } = useBetSlip();

  const [error, setError] = useState("");
  const [placing, setPlacing] = useState(false);
  const [bookedCode, setBookedCode] = useState<string | null>(null);
  const [insureDismissed, setInsureDismissed] = useState(false);

  const isSheet = variant === "sheet";
  const ticketsTab = slipTab === "bet-history" ? "bet-history" : "open-bets";
  const showingTickets = slipTab === "open-bets" || slipTab === "bet-history";

  const balanceShortfall =
    user && betMode === "real" && totalStake > user.balance
      ? totalStake - user.balance
      : 0;

  const canPlaceBet =
    betMode === "real" &&
    activeSelections.length > 0 &&
    stake >= 1 &&
    !!user &&
    totalStake <= user.balance;

  async function handlePlaceBet() {
    setError("");
    if (placing) return;
    if (betMode === "sim") {
      setError("Switch to REAL mode to place a bet");
      return;
    }
    if (!user) {
      openLogin();
      return;
    }
    if (activeSelections.length === 0) {
      setError("Select at least one active pick");
      return;
    }
    if (stake < 1) {
      setError("Minimum stake is GH₵1");
      return;
    }
    if (totalStake > user.balance) {
      setError("Insufficient balance");
      return;
    }

    setPlacing(true);
    try {
      if (backendMode) {
        let placedBet: PlacedBet;

        if (betType === "single" && activeSelections.length > 1) {
          let lastBet: PlacedBet | null = null;
          for (const sel of activeSelections) {
            const remote = await apiPlaceBet({
              stake,
              selections: [localSelectionToBackend(sel)],
            });
            lastBet = backendBetToPlacedBet(remote);
          }
          if (!lastBet) {
            setError("Failed to place bet");
            return;
          }
          placedBet = lastBet;
        } else {
          const remote = await apiPlaceBet({
            stake: betType === "single" ? stake : totalStake,
            selections: activeSelections.map(localSelectionToBackend),
            flex_cut: flexiEnabled ? 1 : undefined,
          });
          placedBet = backendBetToPlacedBet(remote);
        }

        await refreshUser();
        clearSlip();
        window.dispatchEvent(new CustomEvent("betplus:bets-updated"));
        if (onClose) onClose();
        router.push(`/bet/${placedBet.bookingCode}`);
        return;
      }

      const result = placeBetForUser({
        userId: user.id,
        selections: [...activeSelections],
        stake: totalStake,
        totalOdds,
        potentialWin,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }

      refreshUser();
      const { bet } = result;
      clearSlip();
      window.dispatchEvent(new CustomEvent("betplus:bets-updated"));
      if (onClose) onClose();
      router.push(`/bet/${bet.bookingCode}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to place bet");
    } finally {
      setPlacing(false);
    }
  }

  function handleBookBet() {
    if (activeSelections.length === 0) {
      setError("Add selections before booking");
      return;
    }
    const code = generateSlipCode();
    saveSharedSlipCode(code, activeSelections, stake);
    setBookedCode(code);
    setError("");
  }

  function handlePrint() {
    window.print();
  }

  return (
    <aside
      ref={slipRef}
      id="betslip"
      className={`betslip-panel flex flex-col overflow-hidden bg-surface ${
        isSheet
          ? showingTickets
            ? "h-[min(90vh,720px)] min-h-[70vh] rounded-t-lg shadow-xl"
            : "max-h-[90vh] rounded-t-lg shadow-xl"
          : showingTickets
            ? "sticky top-[3.25rem] min-h-[28rem] max-h-[calc(100vh-4.5rem)] rounded border border-border shadow-sm"
            : "sticky top-[3.25rem] max-h-[calc(100vh-4.5rem)] rounded border border-border shadow-sm"
      }`}
    >
      {isSheet && (
        <div className="flex justify-center bg-brand-dark pt-2">
          <div className="h-1 w-10 rounded-full bg-white/40" />
        </div>
      )}

      {/* Header tabs */}
      <div className="bg-brand-dark text-white">
        <div className="flex">
          {(
            [
              { id: "betslip" as const, label: "Betslip", count: selectionCount },
              { id: "open-bets" as const, label: "Open Bets" },
              { id: "bet-history" as const, label: "Bet History" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSlipTab(tab.id)}
              className={`relative flex flex-1 items-center justify-center gap-1 py-2 text-[11px] font-medium ${
                slipTab === tab.id ? "text-white" : "text-white/60"
              }`}
            >
              {tab.label}
              {"count" in tab && tab.count > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-white/20 px-1 text-[10px]">
                  {tab.count}
                </span>
              )}
              {slipTab === tab.id && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-brand-accent" />
              )}
            </button>
          ))}
        </div>

        {slipTab === "betslip" && (
          <div className="relative flex items-center justify-center px-3 pb-2 pt-0.5">
            <div className="flex rounded-full bg-brand p-0.5 text-[10px] font-semibold">
              <button
                type="button"
                onClick={() => setBetMode("real")}
                className={`rounded-full px-4 py-1 transition-colors ${
                  betMode === "real" ? "bg-brand-accent text-brand-dark" : "text-white/70"
                }`}
              >
                REAL
              </button>
              <button
                type="button"
                onClick={() => setBetMode("sim")}
                className={`rounded-full px-4 py-1 transition-colors ${
                  betMode === "sim" ? "bg-brand-accent text-brand-dark" : "text-white/70"
                }`}
              >
                SIM
              </button>
            </div>
            {selectionCount > 0 && (
              <button
                type="button"
                onClick={clearSlip}
                className="absolute right-3 text-[10px] font-semibold text-white/75 hover:text-white"
              >
                Remove All
              </button>
            )}
          </div>
        )}
      </div>

      {showingTickets ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <BetTicketsPanel
            activeTab={ticketsTab}
            onTabChange={(tab) => setSlipTab(tab)}
            hideMainTabs
            onRemix={onClose}
            onOpenTicket={onClose}
          />
        </div>
      ) : (
        <>
          {selections.length > 0 && (
            <div className="flex bg-[#353a45]">
              {(["single", "multiple", "system"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setBetType(type)}
                  className={`flex-1 py-1.5 text-center text-[11px] font-semibold capitalize transition-colors ${
                    betType === type
                      ? "bg-white text-foreground"
                      : "text-white/70 hover:text-white"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-y-auto bg-white">
            {selections.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
                <p className="text-sm font-medium text-foreground">
                  Your betslip is empty
                </p>
                <p className="mt-1 text-xs text-muted">
                  Click on odds to add selections
                </p>
                <Link
                  href="/verify"
                  className="mt-4 text-xs font-medium text-brand hover:underline"
                  onClick={onClose}
                >
                  Have a booking code? Load it here
                </Link>
              </div>
            ) : (
              <ul>
                {selections.map((sel) => (
                  <li
                    key={sel.id}
                    className="flex items-center gap-1.5 border-b border-border/70 px-2 py-1.5"
                  >
                    <button
                      type="button"
                      onClick={() => removeSelection(sel.id)}
                      className="shrink-0 text-muted hover:text-foreground"
                      aria-label="Remove selection"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>

                    <div className="min-w-0 flex-1 leading-tight">
                      <p className="truncate text-xs font-bold text-foreground">
                        {sel.selectionLabel}
                      </p>
                      <p className="truncate text-[10px] text-muted">
                        {sel.homeTeam} vs {sel.awayTeam} · {sel.marketName ?? "1X2"}
                      </p>
                    </div>

                    <span className="shrink-0 text-xs font-bold tabular-nums text-foreground">
                      {formatOdds(sel.odds)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {selections.length > 0 && (
            <div className="shrink-0 border-t border-brand-soft bg-white pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <div className="flex justify-end px-2 py-1">
                <div className="w-20 text-right">
                  <input
                    type="number"
                    min={1}
                    value={stake}
                    onChange={(e) => setStake(Number(e.target.value) || 0)}
                    className={`w-full rounded border px-1.5 py-1 text-right text-xs font-semibold tabular-nums outline-none ${
                      balanceShortfall > 0
                        ? "border-live focus:border-live"
                        : "border-brand-soft focus:border-brand"
                    }`}
                  />
                  {balanceShortfall > 0 && (
                    <p className="mt-1 text-left text-[10px] leading-snug text-live">
                      You need a balance of {formatMoney(totalStake)} to place this bet.
                      Please deposit an additional {formatMoney(balanceShortfall)}.
                    </p>
                  )}
                  {!user && betMode === "real" && (
                    <p className="mt-1 text-left text-[10px] leading-snug text-live">
                      Log in to place a bet
                    </p>
                  )}
                </div>
              </div>

              {/* Insure banner */}
              {!insureDismissed && (
                <div className="flex items-center gap-1.5 bg-brand-accent px-2.5 py-1.5 text-white">
                  <p className="min-w-0 flex-1 text-[10px] leading-tight">
                    Unsure about your selections? Insure your bet and still get paid!
                  </p>
                  <button
                    type="button"
                    onClick={() => setInsureDismissed(true)}
                    className="shrink-0 text-white/80 hover:text-white"
                    aria-label="Dismiss"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}

              {/* Summary rows */}
              <div className="border-t border-brand-soft/80 text-xs">
                {user && betMode === "real" && (
                  <div className="flex items-center justify-between border-b border-brand-soft/60 bg-surface px-2.5 py-1.5">
                    <span className="text-muted">Balance</span>
                    <span className="font-semibold tabular-nums text-brand-dark">
                      {formatMoney(user.balance)}
                      {totalStake > 0 && totalStake <= user.balance && (
                        <span className="ml-1.5 font-normal text-muted">
                          → {formatMoney(user.balance - totalStake)} after stake
                        </span>
                      )}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between border-b border-brand-soft/60 bg-surface px-2.5 py-1.5">
                  <span className="text-muted">Total Odds</span>
                  <span className="font-semibold tabular-nums text-brand-dark">
                    {formatOdds(totalOdds)}
                  </span>
                </div>
                {maxBonus > 0 && (
                  <div className="flex items-center justify-between border-b border-brand-soft/60 bg-brand-light/40 px-2.5 py-1.5">
                    <span className="text-muted">Max Bonus</span>
                    <span className="font-semibold tabular-nums text-brand-dark">
                      {formatMoney(maxBonus)}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between bg-gradient-to-r from-brand-light/70 to-brand-soft/50 px-2.5 py-2">
                  <span className="font-semibold text-brand-dark">Potential Win</span>
                  <span className="text-sm font-bold tabular-nums text-brand">
                    {formatMoney(potentialWin)}
                  </span>
                </div>
              </div>

              {error && (
                <p className="px-3 pt-2 text-center text-xs text-live">{error}</p>
              )}

              {bookedCode && (
                <div className="mx-3 mt-2 rounded border border-brand-soft bg-brand-light/50 px-3 py-3 text-center">
                  <p className="text-xs text-muted">Booking code</p>
                  <div className="mt-1 flex justify-center">
                    <BookingCodeDisplay code={bookedCode} size="lg" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setBookedCode(null)}
                    className="mt-1 text-xs text-muted underline"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {/* Action buttons */}
              <div className="grid grid-cols-2 overflow-hidden">
                <button
                  type="button"
                  onClick={handleBookBet}
                  className="bg-brand-dark py-2.5 text-xs font-bold text-white transition-colors hover:bg-brand active:brightness-95"
                >
                  Book Bet
                </button>
                <button
                  type="button"
                  onClick={handlePlaceBet}
                  disabled={placing || !canPlaceBet}
                  className={`py-2.5 text-xs font-bold transition-colors disabled:opacity-100 ${
                    canPlaceBet
                      ? "bg-brand-accent text-brand-dark hover:brightness-95 active:brightness-90"
                      : "cursor-not-allowed bg-brand-soft text-brand-dark/40"
                  }`}
                >
                  {placing ? "Placing..." : "Place Bet"}
                </button>
              </div>
              <p className="py-1 text-center text-[10px] text-muted">
                Amount to pay: {totalStake.toFixed(2)}
              </p>

              <div className="flex items-center justify-end border-t border-border/40 px-2 py-1">
                <button
                  type="button"
                  onClick={handlePrint}
                  className="text-xs font-medium text-brand hover:text-brand-dark hover:underline"
                >
                  Print
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </aside>
  );
}
