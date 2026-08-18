"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { TicketVerification } from "@/lib/ticket-verify";

function statusColor(status: string) {
  if (status === "Won") return "text-accent";
  if (status === "Lost") return "text-live";
  if (status === "Open") return "text-brand";
  return "text-muted";
}

interface VerifyResultProps {
  result: TicketVerification;
  onClear: () => void;
}

export function VerifyResult({ result, onClear }: VerifyResultProps) {
  const { bet } = result;

  return (
    <div className="space-y-3">
      <div className="card overflow-hidden">
        <div className="bg-brand-dark px-4 py-3 text-center text-white">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-accent">
            Verified ticket
          </p>
          <p className="mt-1 text-lg font-bold">Authentic BetPlus Slip</p>
        </div>

        <div className="divide-y divide-border/60">
          <Row label="Status">
            <span className={`font-bold ${statusColor(result.statusLabel)}`}>
              {result.statusLabel}
            </span>
          </Row>
          <Row label="Ticket ID">{result.ticketId}</Row>
          <Row label="Verify code">
            <span className="font-mono text-[11px] tracking-wide">
              {result.verifyCode}
            </span>
          </Row>
          <Row label="Bet type">{result.betType}</Row>
          <Row label="Selections">{result.legCount}</Row>
          <Row label="Stake">{result.stake}</Row>
          <Row label="Total odds">{result.totalOdds}</Row>
          <Row label="Potential win">{result.potentialWin}</Row>
          {bet.bonus != null && bet.bonus > 0 && (
            <Row label="Bonus">{result.bonus}</Row>
          )}
          <Row label={bet.status === "won" ? "Amount won" : "Return"}>
            <span className={`font-bold ${statusColor(result.statusLabel)}`}>
              {result.returnAmount}
            </span>
          </Row>
          <Row label="Placed">{result.placedAt}</Row>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Link
          href={`/bet/${result.bookingCode}`}
          className="rounded-md bg-brand py-2.5 text-center text-xs font-semibold text-white hover:bg-brand-dark"
        >
          View full ticket
        </Link>
        <button
          type="button"
          onClick={onClear}
          className="rounded-md border border-border bg-surface py-2.5 text-xs font-semibold text-foreground hover:bg-surface-elevated"
        >
          Verify another
        </button>
      </div>

      <p className="text-center text-[10px] leading-snug text-muted">
        This code confirms the ticket was placed on BetPlus with the stake and
        status shown above.
      </p>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5 text-xs">
      <span className="text-muted">{label}</span>
      <span className="text-right font-medium text-foreground">{children}</span>
    </div>
  );
}
