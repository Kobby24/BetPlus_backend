"use client";

import Link from "next/link";
import { BetTicketsPanel } from "@/components/BetTicketsPanel";
import { useBetSlip } from "@/lib/betslip-context";
import { useAuth } from "@/lib/auth-context";

export default function MyBetsPage() {
  const { user, openLogin } = useAuth();
  const { selections, setSlipTab, setBetslipOpen } = useBetSlip();

  return (
    <div className="-mx-3 flex min-h-[calc(100vh-8rem)] flex-col md:mx-0 md:min-h-[calc(100vh-6rem)]">
      <div className="border-b border-border bg-surface px-3 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">My Bets</h1>
            <p className="mt-0.5 text-xs text-muted">Open bets & bet history</p>
          </div>
          <Link href="/verify" className="text-[11px] font-medium text-brand">
            Verify code
          </Link>
        </div>

        {selections.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setSlipTab("betslip");
              setBetslipOpen(true);
            }}
            className="mt-3 w-full rounded-md bg-brand py-2 text-xs font-semibold text-white"
          >
            Open betslip ({selections.length} pick{selections.length > 1 ? "s" : ""})
          </button>
        )}
      </div>

      {!user ? (
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center">
          <p className="text-sm text-muted">Log in to view your bets</p>
          <button
            type="button"
            onClick={openLogin}
            className="mt-3 rounded-md bg-brand px-4 py-2 text-xs font-semibold text-white"
          >
            Log in
          </button>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden">
          <BetTicketsPanel />
        </div>
      )}
    </div>
  );
}
