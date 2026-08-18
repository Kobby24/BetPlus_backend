"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PlacedBet } from "@/lib/bet-types";
import { deleteBetById } from "@/lib/bet-store";

interface TicketFooterProps {
  bet: PlacedBet;
}

export function TicketFooter({ bet }: TicketFooterProps) {
  const router = useRouter();

  function handleDelete() {
    if (!confirm("Delete this ticket from your history?")) return;
    if (deleteBetById(bet.id)) {
      router.push("/my-bets");
    }
  }

  return (
    <footer className="border-t border-brand-soft bg-brand-light">
      <div className="flex items-center justify-between px-3 py-3 text-xs sm:text-sm">
        <span className="text-muted">
          Number of Bets: <span className="font-semibold text-foreground">1</span>
        </span>
        <Link href={`/bet/${bet.bookingCode}`} className="font-semibold text-accent hover:underline">
          Bet Details
        </Link>
      </div>

      <Link
        href="/wallet"
        className="flex items-center justify-between border-t border-ticket-sea-soft px-3 py-3 text-sm text-foreground hover:bg-ticket-sea-soft/40"
      >
        <span>Check Transaction History</span>
        <svg className="h-4 w-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" d="M9 6l6 6-6 6" />
        </svg>
      </Link>

      <div className="border-t border-ticket-sea-soft px-3 py-4 text-center">
        <button
          type="button"
          onClick={handleDelete}
          className="text-sm font-semibold text-live hover:underline"
        >
          Delete Ticket
        </button>
      </div>
    </footer>
  );
}
