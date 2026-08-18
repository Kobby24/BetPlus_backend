"use client";

import { useBetSlip } from "@/lib/betslip-context";
import { formatMoney, formatOdds } from "@/lib/utils";

export function BetSlipBar() {
  const {
    selectionCount,
    totalOdds,
    potentialWin,
    betslipOpen,
    toggleBetslip,
  } = useBetSlip();

  if (selectionCount === 0 || betslipOpen) return null;

  return (
    <button
      type="button"
      onClick={toggleBetslip}
      className="fixed bottom-[calc(52px+env(safe-area-inset-bottom))] left-0 right-0 z-30 flex items-center justify-between gap-3 border-t border-brand-soft/40 bg-brand-dark px-4 py-2.5 text-white shadow-lg lg:hidden"
    >
      <div className="text-left">
        <p className="text-xs font-medium opacity-90">
          Betslip ({selectionCount})
        </p>
        <p className="text-sm font-bold tabular-nums">
          Odds {formatOdds(totalOdds)}
        </p>
      </div>
      <div className="rounded bg-white px-4 py-1.5 text-sm font-bold text-brand">
        Win {formatMoney(potentialWin)}
      </div>
    </button>
  );
}
