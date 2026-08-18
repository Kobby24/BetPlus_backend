"use client";

import Link from "next/link";
import type { BetStatus, PlacedBet } from "@/lib/bet-types";
import { formatMoney } from "@/lib/utils";

function isSettled(status: BetStatus) {
  return status !== "open";
}

function betTypeLabel(bet: PlacedBet) {
  return bet.selections.length > 1 ? "Multiple" : "Singles";
}

function statusLabel(status: BetStatus) {
  if (status === "won") return "Won";
  if (status === "lost") return "Lost";
  if (status === "void") return "Void";
  return "Open";
}

function totalReturn(bet: PlacedBet) {
  if (bet.status === "won") return bet.potentialWin;
  if (bet.status === "void") return bet.stake;
  return 0;
}

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export interface BetHistoryCardProps {
  bet: PlacedBet;
  onRemix?: () => void;
  /** Close betslip sheet when opening ticket (mobile) */
  onOpenTicket?: () => void;
}

export function BetHistoryCard({ bet, onRemix, onOpenTicket }: BetHistoryCardProps) {
  const first = bet.selections[0];
  const extra = bet.selections.length - 1;
  const settled = isSettled(bet.status);
  const stakeText = formatMoney(bet.stake).replace("GH₵", "").trim();
  const returnText = formatMoney(totalReturn(bet)).replace("GH₵", "").trim();
  const ticketHref = `/bet/${bet.bookingCode}`;
  const showRemix = settled && !!onRemix;

  const statusColor =
    bet.status === "lost"
      ? "text-live"
      : bet.status === "won"
        ? "text-accent"
        : "text-muted";

  function openTicket() {
    onOpenTicket?.();
  }

  return (
    <article className="relative overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
      <Link
        href={ticketHref}
        onClick={openTicket}
        className="group block no-underline"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-brand-soft bg-brand-light px-3.5 py-2.5 transition-colors group-hover:bg-brand-soft/40 group-active:bg-brand-soft">
          <span className="text-[13px] font-bold text-foreground">{betTypeLabel(bet)}</span>
          <span className={`inline-flex items-center gap-0.5 text-[13px] font-bold ${statusColor}`}>
            {statusLabel(bet.status)}
            <ChevronRight className="h-3.5 w-3.5 opacity-90" />
          </span>
        </div>

        {/* Body */}
        <div className="px-3.5 py-3.5 transition-colors group-hover:bg-surface-elevated/50 group-active:bg-surface-elevated">
          <div className="flex items-start justify-between gap-8">
            <div>
              <p className="text-[11px] text-muted">Total Stake(GHS)</p>
              <p className="mt-1 text-[17px] font-bold tabular-nums leading-tight text-foreground">
                {stakeText}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-muted">Total Return</p>
              <p
                className={`mt-1 text-[17px] font-bold tabular-nums leading-tight ${
                  bet.status === "won" ? "text-accent" : "text-foreground"
                }`}
              >
                {returnText}
              </p>
            </div>
          </div>

          {first && (
            <p className={`mt-3.5 text-[13px] leading-snug text-foreground ${showRemix ? "pr-[7.5rem]" : ""}`}>
              <span className="font-semibold">
                {first.homeTeam} v {first.awayTeam}
              </span>
              {extra > 0 && (
                <span className="font-normal text-muted">
                  {" "}
                  ...(and {extra} other match{extra > 1 ? "es" : ""})
                </span>
              )}
            </p>
          )}
        </div>
      </Link>

      {showRemix && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemix();
          }}
          className="absolute bottom-3.5 right-3.5 z-10 rounded-md bg-brand-accent px-4 py-2 text-[13px] font-bold text-brand-dark shadow-sm transition-all hover:brightness-95 active:scale-[0.97]"
        >
          Remix Bet
        </button>
      )}
    </article>
  );
}
