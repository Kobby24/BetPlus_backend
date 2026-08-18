"use client";

import { useEffect, useMemo, useState } from "react";
import type { PlacedBet } from "@/lib/bet-types";
import {
  managerUpdateBetTicket,
  type BetFieldMode,
} from "@/lib/bet-store";
import { logManagerAction } from "@/lib/manager-store";
import { recalcBetTotals } from "@/lib/bet-record";
import { formatAmountPlain, ticketBonus, ticketId } from "@/lib/ticket-display";
import { formatOdds } from "@/lib/utils";
import {
  managerPanelInputClass,
  managerPanelLabelClass,
  managerPanelHintClass,
} from "@/components/manager/ManagerEditPopup";

interface ManagerTicketEditPanelProps {
  bet: PlacedBet;
  onSaved: (bet: PlacedBet) => void;
  onClose: () => void;
}

function ModeToggle({
  value,
  onChange,
  label,
}: {
  value: BetFieldMode;
  onChange: (mode: BetFieldMode) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="sr-only">{label} mode</span>
      {(["auto", "manual"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          className={`rounded px-2 py-0.5 text-[10px] font-semibold capitalize ${
            value === mode
              ? "bg-brand text-white"
              : "bg-gray-100 text-muted hover:bg-gray-200"
          }`}
        >
          {mode}
        </button>
      ))}
    </div>
  );
}

function FieldInput({
  label,
  mode,
  onModeChange,
  value,
  onChange,
  preview,
  step = "0.01",
  min = "0",
}: {
  label: string;
  mode: BetFieldMode;
  onModeChange: (mode: BetFieldMode) => void;
  value: string;
  onChange: (value: string) => void;
  preview?: string;
  step?: string;
  min?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className={managerPanelLabelClass}>{label}</span>
        <ModeToggle value={mode} onChange={onModeChange} label={label} />
      </div>
      {mode === "manual" ? (
        <input
          type="number"
          min={min}
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${managerPanelInputClass} font-semibold tabular-nums`}
        />
      ) : (
        <p className="rounded-md border border-border bg-gray-50 px-2.5 py-2 text-sm font-semibold tabular-nums text-foreground">
          {preview}
        </p>
      )}
    </div>
  );
}

export function ManagerTicketEditPanel({
  bet,
  onSaved,
  onClose,
}: ManagerTicketEditPanelProps) {
  const [ticketIdValue, setTicketIdValue] = useState(ticketId(bet));
  const [stakeMode, setStakeMode] = useState<BetFieldMode>("auto");
  const [stakeValue, setStakeValue] = useState(String(bet.stake));
  const [oddsMode, setOddsMode] = useState<BetFieldMode>("auto");
  const [oddsValue, setOddsValue] = useState(String(bet.totalOdds));
  const [totalMode, setTotalMode] = useState<BetFieldMode>("auto");
  const [totalValue, setTotalValue] = useState(String(bet.potentialWin));
  const [bonusMode, setBonusMode] = useState<BetFieldMode>("auto");
  const [bonusValue, setBonusValue] = useState(String(ticketBonus(bet)));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTicketIdValue(ticketId(bet));
    setStakeValue(String(bet.stake));
    setOddsValue(String(bet.totalOdds));
    setTotalValue(String(bet.potentialWin));
    setBonusValue(String(ticketBonus(bet)));
  }, [bet]);

  const previewStake =
    stakeMode === "auto" ? bet.stake : Number.parseFloat(stakeValue) || 0;

  const autoPreview = useMemo(
    () => recalcBetTotals(bet.selections, previewStake),
    [bet.selections, previewStake],
  );

  const previewOdds =
    oddsMode === "auto"
      ? autoPreview.totalOdds
      : Number.parseFloat(oddsValue) || bet.totalOdds;

  const oddsPreview = useMemo(
    () => recalcBetTotals(bet.selections, previewStake, previewOdds),
    [bet.selections, previewStake, previewOdds],
  );

  const previewBonus =
    bonusMode === "auto" ? oddsPreview.bonus : Number.parseFloat(bonusValue) || 0;

  const previewTotal =
    totalMode === "auto"
      ? Math.round((previewStake * previewOdds + previewBonus) * 100) / 100
      : Number.parseFloat(totalValue) || 0;

  function handleSave() {
    setError("");
    const stake = Number.parseFloat(stakeValue);
    const totalOdds = Number.parseFloat(oddsValue);
    const potentialWin = Number.parseFloat(totalValue);
    const bonus = Number.parseFloat(bonusValue);

    if (stakeMode === "manual" && (!Number.isFinite(stake) || stake < 0)) {
      setError("Enter a valid stake.");
      return;
    }
    if (oddsMode === "manual" && (!Number.isFinite(totalOdds) || totalOdds < 1)) {
      setError("Enter valid odds (1.00 or higher).");
      return;
    }
    if (totalMode === "manual" && (!Number.isFinite(potentialWin) || potentialWin < 0)) {
      setError("Enter a valid total return.");
      return;
    }
    if (bonusMode === "manual" && (!Number.isFinite(bonus) || bonus < 0)) {
      setError("Enter a valid bonus.");
      return;
    }
    if (!ticketIdValue.trim()) {
      setError("Ticket ID is required.");
      return;
    }

    setSaving(true);
    const updated = managerUpdateBetTicket(bet.id, {
      ticketId: ticketIdValue.trim(),
      stake: stakeMode === "manual" ? stake : undefined,
      stakeMode,
      totalOdds: oddsMode === "manual" ? totalOdds : undefined,
      oddsMode,
      potentialWin: totalMode === "manual" ? potentialWin : undefined,
      totalMode,
      bonus: bonusMode === "manual" ? bonus : undefined,
      bonusMode,
    });
    setSaving(false);

    if (!updated) {
      setError("Could not save ticket changes.");
      return;
    }

    logManagerAction(
      "Edit ticket",
      `${ticketId(updated)} · stake ${formatAmountPlain(updated.stake)} · odds ${formatOdds(updated.totalOdds)} · return ${formatAmountPlain(updated.potentialWin)} · bonus ${formatAmountPlain(updated.bonus ?? 0)}`,
    );
    onSaved(updated);
    onClose();
  }

  return (
    <div className="px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold text-brand">Manager edit</p>
        <button
          type="button"
          onClick={onClose}
          className="text-[10px] text-muted hover:text-foreground"
        >
          Close
        </button>
      </div>

      <div className="space-y-3">
        <label className="block space-y-1.5">
          <span className={managerPanelLabelClass}>Ticket ID</span>
          <input
            type="text"
            inputMode="numeric"
            value={ticketIdValue}
            onChange={(e) => setTicketIdValue(e.target.value)}
            className={`${managerPanelInputClass} font-semibold tabular-nums`}
          />
        </label>

        <FieldInput
          label="Stake"
          mode={stakeMode}
          onModeChange={setStakeMode}
          value={stakeValue}
          onChange={setStakeValue}
          preview={formatAmountPlain(bet.stake)}
        />

        <FieldInput
          label="Total odds"
          mode={oddsMode}
          onModeChange={setOddsMode}
          value={oddsValue}
          onChange={setOddsValue}
          preview={formatOdds(autoPreview.totalOdds)}
          step="0.01"
          min="1"
        />

        <FieldInput
          label="Bonus"
          mode={bonusMode}
          onModeChange={setBonusMode}
          value={bonusValue}
          onChange={setBonusValue}
          preview={formatAmountPlain(oddsPreview.bonus)}
        />

        <FieldInput
          label={bet.status === "open" ? "Potential return (total)" : "Total return"}
          mode={totalMode}
          onModeChange={setTotalMode}
          value={totalValue}
          onChange={setTotalValue}
          preview={formatAmountPlain(previewTotal)}
        />

        <p className={managerPanelHintClass}>
          Auto odds multiply leg prices on the slip. Manual lets you set the ticket
          total odds directly. Bonus and return follow the same auto/manual rules.
        </p>

        {error && (
          <p className="rounded-md bg-red-50 px-2 py-1.5 text-[11px] text-live">
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-md bg-brand py-2 text-xs font-bold text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save ticket"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-2 text-xs font-medium text-muted"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
