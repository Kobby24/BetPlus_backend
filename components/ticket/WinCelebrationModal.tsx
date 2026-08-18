"use client";

import type { PlacedBet } from "@/lib/bet-types";
import { ticketId, totalReturn } from "@/lib/ticket-display";
import { formatMoney } from "@/lib/utils";
import { WinTrophyIcon } from "./WinTrophyIcon";

interface WinCelebrationModalProps {
  bet: PlacedBet;
  open: boolean;
  onCheckDetails: () => void;
  onShowOff: () => void;
  onClose: () => void;
}

export function WinCelebrationModal({
  bet,
  open,
  onCheckDetails,
  onShowOff,
  onClose,
}: WinCelebrationModalProps) {
  if (!open) return null;

  const amount = formatMoney(totalReturn(bet));
  const id = ticketId(bet);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-5">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close"
        onClick={onClose}
      />

      <div className="relative w-full max-w-[300px]">
        {/* Cup hero — sits above and overlaps the card */}
        <div className="pointer-events-none relative z-20 flex justify-center">
          <WinTrophyIcon
            tone="accent"
            showShadow
            className="h-[120px] w-[120px] -mb-[52px] drop-shadow-[0_8px_16px_rgba(13,151,55,0.28)]"
          />
        </div>

        <div className="relative overflow-hidden rounded-2xl bg-white shadow-2xl">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-brand-light text-muted hover:bg-brand-soft hover:text-brand-dark"
            aria-label="Close"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Space for overlapping cup */}
          <div className="px-5 pb-5 pt-14">
            <div className="mb-4 flex justify-center">
              <span className="rounded-full bg-brand-dark px-5 py-1.5 text-xs font-extrabold uppercase tracking-[0.12em] text-white shadow-[0_3px_0_#0a3542]">
                You Won
              </span>
            </div>

            <p className="text-center text-[2rem] font-extrabold leading-tight tabular-nums tracking-tight text-brand-dark">
              {amount}
            </p>
            <p className="mt-2 text-center text-[11px] leading-snug text-muted">
              From Sports Betting, Ticket ID: {id}
            </p>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onCheckDetails}
                className="rounded-full bg-brand-dark py-3 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-[0_2px_0_#0a3542] transition-transform hover:bg-brand active:translate-y-px active:shadow-none"
              >
                Check Details
              </button>
              <button
                type="button"
                onClick={onShowOff}
                className="rounded-full bg-brand-accent py-3 text-[10px] font-extrabold uppercase tracking-wide text-brand-dark shadow-[0_2px_0_#5aabbf] transition-transform hover:brightness-95 active:translate-y-px active:shadow-none"
              >
                Show Off
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
