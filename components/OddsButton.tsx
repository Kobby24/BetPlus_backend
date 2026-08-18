"use client";

import { useBetSlip } from "@/lib/betslip-context";
import type { Match, OddsSelection } from "@/lib/types";
import { OddsCell } from "./OddsCell";

interface OddsButtonProps {
  match: Match;
  selection: OddsSelection;
  label: string;
}

export function OddsButton({ match, selection, label }: OddsButtonProps) {
  const { addSelection, isSelected } = useBetSlip();
  const odds = match.odds[selection];
  const selected = isSelected(match.id, selection);

  if (!odds) return null;

  return (
    <OddsCell
      label={label}
      odds={odds}
      selected={selected}
      className="min-h-[44px] py-1.5"
      onClick={() => addSelection(match, selection)}
    />
  );
}
