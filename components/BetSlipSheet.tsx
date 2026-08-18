"use client";

import { useBetSlip } from "@/lib/betslip-context";
import { BetSlip } from "./BetSlip";

export function BetSlipSheet() {
  const { betslipOpen, setBetslipOpen } = useBetSlip();

  if (!betslipOpen) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="Close betslip"
        onClick={() => setBetslipOpen(false)}
      />
      <div className="absolute bottom-0 left-0 right-0">
        <BetSlip
          variant="sheet"
          onClose={() => setBetslipOpen(false)}
        />
      </div>
    </div>
  );
}
