"use client";

import { formatOdds } from "@/lib/utils";

interface OddsCellProps {
  label: string;
  odds: number;
  selected: boolean;
  onClick: () => void;
  className?: string;
}

export function OddsCell({
  label,
  odds,
  selected,
  onClick,
  className = "",
}: OddsCellProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center rounded-md px-2 py-2.5 transition-all active:scale-[0.98] ${
        selected
          ? "border border-brand bg-brand text-white shadow-sm"
          : "border border-brand-soft bg-gradient-to-b from-surface to-brand-light/70 hover:border-brand/25 hover:from-brand-light/30 hover:to-brand-light"
      } ${className}`}
    >
      <span
        className={`max-w-full truncate text-[11px] font-medium leading-tight ${
          selected ? "text-white/90" : "text-muted"
        }`}
      >
        {label}
      </span>
      <span
        className={`mt-1 text-sm font-bold tabular-nums leading-none ${
          selected ? "text-white" : "text-brand-dark"
        }`}
      >
        {formatOdds(odds)}
      </span>
    </button>
  );
}
