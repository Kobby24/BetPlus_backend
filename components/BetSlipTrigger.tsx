"use client";

import { useBetSlip } from "@/lib/betslip-context";

interface BetSlipTriggerProps {
  className?: string;
  showLabel?: boolean;
  label?: string;
  iconSize?: "sm" | "md";
}

export function BetSlipTrigger({
  className = "",
  showLabel = false,
  label = "Betslip",
  iconSize = "md",
}: BetSlipTriggerProps) {
  const { selectionCount, setBetslipOpen } = useBetSlip();

  function openBetslip() {
    if (typeof window !== "undefined" && window.innerWidth >= 1024) {
      document.getElementById("betslip")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setBetslipOpen(true);
  }

  const size = iconSize === "sm" ? "h-5 w-5" : "h-6 w-6";

  return (
    <button
      type="button"
      onClick={openBetslip}
      className={`relative inline-flex items-center gap-1.5 text-foreground ${className}`}
      aria-label={`Betslip${selectionCount > 0 ? `, ${selectionCount} selections` : ""}`}
    >
      <span className="relative">
        <svg
          className={size}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
          />
        </svg>
        {selectionCount > 0 && (
          <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
            {selectionCount}
          </span>
        )}
      </span>
      {showLabel && (
        <span className="text-xs font-medium">{label}</span>
      )}
    </button>
  );
}
