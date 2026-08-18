"use client";

import { useBetSlip } from "@/lib/betslip-context";
import type { Match } from "@/lib/types";
import { formatOdds } from "@/lib/utils";

interface PlayerOddsRowProps {
  match: Match;
  marketId: string;
  marketName: string;
  outcomeId: string;
  name: string;
  odds: number;
}

export function PlayerOddsRow({
  match,
  marketId,
  marketName,
  outcomeId,
  name,
  odds,
}: PlayerOddsRowProps) {
  const { addMarketSelection, isMarketSelected } = useBetSlip();
  const selected = isMarketSelected(match.id, marketId, outcomeId);

  return (
    <button
      type="button"
      onClick={() =>
        addMarketSelection(match, {
          marketId,
          marketName,
          outcomeId,
          outcomeLabel: name,
          odds,
        })
      }
      className={`flex w-full items-center justify-between gap-3 border-b border-brand-soft/40 px-3 py-3 text-left transition-colors last:border-b-0 ${
        selected ? "bg-brand-light/60" : "hover:bg-brand-light/30"
      }`}
    >
      <span className="min-w-0 truncate text-sm font-medium text-foreground">
        {name}
      </span>
      <span
        className={`shrink-0 rounded-md border px-3 py-1.5 text-xs font-bold tabular-nums ${
          selected
            ? "border-brand bg-brand text-white"
            : "border-brand-soft bg-gradient-to-b from-surface to-brand-light/70 text-brand-dark"
        }`}
      >
        {formatOdds(odds)}
      </span>
    </button>
  );
}
