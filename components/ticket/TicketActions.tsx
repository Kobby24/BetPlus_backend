"use client";

import type { BetStatus } from "@/lib/bet-types";

function RemixIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}

function MegaphoneIcon() {
  return (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M18 11c0-2.21-1.79-4-4-4V3L6 8v4l8 5v-4c2.21 0 4-1.79 4-4zM4 12H2v4h2v-4z" />
    </svg>
  );
}

interface TicketActionsProps {
  status: BetStatus;
  onRemix: () => void;
  onShowOff?: () => void;
}

export function TicketActions({ status, onRemix, onShowOff }: TicketActionsProps) {
  if (status === "won") {
    return (
      <div className="grid grid-cols-2">
        <button
          type="button"
          onClick={onShowOff}
          className="inline-flex items-center justify-center gap-2 bg-[#f5c842] py-3.5 text-sm font-bold text-brand-dark active:bg-[#e5b832] sm:py-4"
        >
          <MegaphoneIcon />
          Show Off
        </button>
        <button
          type="button"
          onClick={onRemix}
          className="inline-flex items-center justify-center gap-2 bg-brand-accent py-3.5 text-sm font-bold text-brand-dark active:brightness-95 sm:py-4"
        >
          <RemixIcon />
          Remix Bet
        </button>
      </div>
    );
  }

  if (status === "lost") {
    return (
      <div className="flex flex-col gap-3 bg-brand px-3 py-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <svg className="h-7 w-7 shrink-0" viewBox="0 0 48 48" fill="none" aria-hidden>
            <defs>
              <linearGradient id="remix-bot" x1="12" y1="8" x2="36" y2="40">
                <stop stopColor="#75c2d9" />
                <stop offset="1" stopColor="#1a5568" />
              </linearGradient>
            </defs>
            <rect x="12" y="14" width="24" height="22" rx="5" fill="url(#remix-bot)" stroke="#0f4658" strokeWidth="1.2" />
            <circle cx="19" cy="24" r="3" fill="#ffffff" />
            <circle cx="29" cy="24" r="3" fill="#ffffff" />
            <path d="M20 30h8" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
            <path d="M24 8v4M16 10l2 3M32 10l-2 3" stroke="#75c2d9" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <p className="text-xs leading-snug text-white/85 sm:text-sm">
            Bounce back fast — remix and retry your bet!
          </p>
        </div>
        <button
          type="button"
          onClick={onRemix}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded bg-brand-accent px-4 py-2.5 text-sm font-bold text-brand-dark active:brightness-95"
        >
          <RemixIcon />
          Remix Bet
        </button>
      </div>
    );
  }

  if (status === "open") {
    return (
      <div className="bg-brand px-3 py-3">
        <button
          type="button"
          onClick={onRemix}
          className="inline-flex w-full items-center justify-center gap-2 rounded bg-brand-accent py-3 text-sm font-bold text-brand-dark active:brightness-95"
        >
          <RemixIcon />
          Remix Bet
        </button>
      </div>
    );
  }

  return null;
}
