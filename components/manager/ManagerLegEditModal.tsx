"use client";

import { useEffect, useMemo, useState } from "react";
import type { BetSelection } from "@/lib/types";
import {
  managerUpdateBetLeg,
  type LegOutcomeStatus,
} from "@/lib/bet-store";
import { managerUpdateLeg, useBackendApi } from "@/lib/backend-client";
import {
  buildLegMarketCatalog,
  findLegMarketEntry,
  findPickOption,
  getPickOptionsForMarket,
  getMatchForLeg,
  marketUsesPickOptions,
  type LegMarketEntry,
  type LegPickOption,
} from "@/lib/manager-leg-markets";
import { logManagerAction } from "@/lib/manager-store";
import { normalizeTicketScoreLabel } from "@/lib/ticket-display";
import { formatOdds } from "@/lib/utils";
import {
  ManagerEditPopup,
  managerPanelInputClass,
  managerPanelLabelClass,
  managerPanelHintClass,
} from "@/components/manager/ManagerEditPopup";

const CUSTOM_PICK_ID = "__custom__";

function detectOutcomeStatus(
  legWon: boolean | null,
  voidLeg?: boolean,
): LegOutcomeStatus {
  if (voidLeg) return "void";
  if (legWon === true) return "won";
  if (legWon === false) return "lost";
  return "not_started";
}

function initialFtScores(
  selection: BetSelection,
  ftScore: string | null,
): { home: string; away: string } {
  if (selection.managerFtScore) {
    return {
      home: String(selection.managerFtScore.home),
      away: String(selection.managerFtScore.away),
    };
  }
  const parsed = ftScore ? ftScore.replace(/-/g, ":").match(/^(\d+):(\d+)$/) : null;
  if (parsed) {
    return { home: parsed[1], away: parsed[2] };
  }
  return { home: "", away: "" };
}

interface ManagerLegEditModalProps {
  open: boolean;
  legIndex: number;
  selection: BetSelection;
  legWon: boolean | null;
  voidLeg?: boolean;
  ftScore?: string | null;
  betId: string;
  onClose: () => void;
  onSaved: () => void;
}

function SegmentedRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={`min-w-[4rem] rounded-md px-2.5 py-1.5 text-[11px] font-semibold ${
            value === opt.id
              ? "bg-brand text-white"
              : "bg-gray-100 text-muted hover:bg-gray-200"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function PickField({
  manual,
  options,
  selectedId,
  customPick,
  onSelect,
  onCustomChange,
}: {
  manual: boolean;
  options: LegPickOption[];
  selectedId: string;
  customPick: string;
  onSelect: (id: string) => void;
  onCustomChange: (value: string) => void;
}) {
  const [pickSearch, setPickSearch] = useState("");

  const selectedOption = options.find((o) => o.id === selectedId);

  const pickResults = useMemo(() => {
    const q = pickSearch.trim().toLowerCase();
    if (!q) return options.slice(0, 20);
    return options.filter((o) => o.label.toLowerCase().includes(q)).slice(0, 20);
  }, [options, pickSearch]);

  if (manual) {
    return (
      <input
        type="text"
        value={customPick}
        onChange={(e) => onCustomChange(e.target.value)}
        placeholder="Type pick — e.g. 0:0, Over 2.5, Draw"
        className={managerPanelInputClass}
      />
    );
  }

  const showPickResults =
    pickSearch.trim().length > 0 ||
    selectedId === CUSTOM_PICK_ID ||
    !selectedOption;

  return (
    <div className="space-y-2">
      {selectedOption && selectedId !== CUSTOM_PICK_ID && (
        <div className="rounded-md border border-brand/25 bg-brand-light/50 px-2.5 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted">
            Selected pick
          </p>
          <p className="text-sm font-semibold text-brand-dark">
            {selectedOption.label} @ {formatOdds(selectedOption.odds)}
          </p>
        </div>
      )}

      <div className="relative">
        <input
          type="text"
          value={pickSearch}
          onChange={(e) => setPickSearch(e.target.value)}
          placeholder="Search players…"
          className={`${managerPanelInputClass} pr-9`}
        />
        {pickSearch && (
          <button
            type="button"
            onClick={() => setPickSearch("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-foreground"
            aria-label="Clear search"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {showPickResults && (
        <ul className="max-h-40 overflow-y-auto rounded-md border border-border">
          {pickResults.length === 0 ? (
            <li className="px-3 py-2 text-xs text-muted">No players found</li>
          ) : (
            pickResults.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(o.id);
                    setPickSearch(o.label);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-brand-light/40 ${
                    o.id === selectedId
                      ? "bg-brand-light/60 font-semibold text-brand-dark"
                      : "text-foreground"
                  }`}
                >
                  {o.label}{" "}
                  <span className="text-muted">@ {formatOdds(o.odds)}</span>
                </button>
              </li>
            ))
          )}
          <li>
            <button
              type="button"
              onClick={() => {
                onSelect(CUSTOM_PICK_ID);
                setPickSearch("");
              }}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-brand-light/40 ${
                selectedId === CUSTOM_PICK_ID
                  ? "bg-brand-light/60 font-semibold text-brand-dark"
                  : "text-muted"
              }`}
            >
              Custom pick…
            </button>
          </li>
        </ul>
      )}

      {selectedId === CUSTOM_PICK_ID && (
        <input
          type="text"
          value={customPick}
          onChange={(e) => onCustomChange(e.target.value)}
          placeholder="Type pick"
          className={managerPanelInputClass}
        />
      )}
    </div>
  );
}

export function ManagerLegEditModal({
  open,
  legIndex,
  selection,
  legWon,
  voidLeg,
  ftScore,
  betId,
  onClose,
  onSaved,
}: ManagerLegEditModalProps) {
  const backendMode = useBackendApi();
  const match = useMemo(() => getMatchForLeg(selection), [selection]);
  const marketCatalog = useMemo(
    () => (match ? buildLegMarketCatalog(match) : []),
    [match],
  );

  const [marketSearch, setMarketSearch] = useState("");
  const [selectedMarketKey, setSelectedMarketKey] = useState("");
  const [selectedPickId, setSelectedPickId] = useState(CUSTOM_PICK_ID);
  const [customPick, setCustomPick] = useState(selection.selectionLabel);
  const [odds, setOdds] = useState(String(selection.odds));
  const [ftHome, setFtHome] = useState("");
  const [ftAway, setFtAway] = useState("");
  const [outcomeStatus, setOutcomeStatus] = useState<LegOutcomeStatus>(() =>
    detectOutcomeStatus(legWon, voidLeg),
  );
  const [outcomeLabel, setOutcomeLabel] = useState(
    selection.outcomeLabel ?? selection.selectionLabel,
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedEntry = useMemo(
    () => marketCatalog.find((e) => e.key === selectedMarketKey) ?? null,
    [marketCatalog, selectedMarketKey],
  );

  const pickOptions = useMemo(
    () =>
      match && selectedEntry
        ? getPickOptionsForMarket(match, selectedEntry.market)
        : [],
    [match, selectedEntry],
  );

  const manualPick = selectedEntry
    ? !marketUsesPickOptions(selectedEntry.market)
    : true;

  const searchResults = useMemo(() => {
    const q = marketSearch.trim().toLowerCase();
    if (!q) return [];
    return marketCatalog
      .filter((e) => e.name.toLowerCase().includes(q))
      .slice(0, 20);
  }, [marketCatalog, marketSearch]);

  function applyMarketEntry(entry: LegMarketEntry, keepPick?: BetSelection) {
    setSelectedMarketKey(entry.key);
    setMarketSearch(entry.name);

    if (!match) return;

    const options = getPickOptionsForMarket(match, entry.market);
    const usesOptions = marketUsesPickOptions(entry.market);
    const current = keepPick ?? selection;

    if (usesOptions && options.length > 0) {
      const matched = findPickOption(options, current);
      if (matched) {
        setSelectedPickId(matched.id);
        setCustomPick(normalizeTicketScoreLabel(matched.label));
        setOdds(String(matched.odds));
      } else {
        setSelectedPickId(options[0].id);
        setCustomPick(normalizeTicketScoreLabel(options[0].label));
        setOdds(String(options[0].odds));
      }
    } else {
      setSelectedPickId(CUSTOM_PICK_ID);
      setCustomPick(normalizeTicketScoreLabel(current.selectionLabel));
    }
  }

  function handlePickSelect(id: string) {
    setSelectedPickId(id);
    if (id === CUSTOM_PICK_ID) return;

    const opt = pickOptions.find((o) => o.id === id);
    if (!opt) return;

    setCustomPick(normalizeTicketScoreLabel(opt.label));
    setOdds(String(opt.odds));
    if (outcomeStatus === "won") {
      setOutcomeLabel(normalizeTicketScoreLabel(opt.label));
    }
  }

  function clearMarketSearch() {
    setMarketSearch("");
  }

  useEffect(() => {
    if (!open) return;

    const ft = initialFtScores(selection, ftScore ?? null);
    setFtHome(ft.home);
    setFtAway(ft.away);
    setOdds(String(selection.odds));
    setOutcomeStatus(detectOutcomeStatus(legWon, voidLeg));
    setOutcomeLabel(selection.outcomeLabel ?? selection.selectionLabel);
    setCustomPick(normalizeTicketScoreLabel(selection.selectionLabel));
    setError("");

    if (match) {
      const entry = findLegMarketEntry(match, selection);
      if (entry) applyMarketEntry(entry, selection);
      else {
        setSelectedMarketKey("");
        setMarketSearch("");
      }
    } else {
      setSelectedMarketKey("");
      setMarketSearch("");
      setSelectedPickId(CUSTOM_PICK_ID);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when modal opens
  }, [open, selection, legWon, voidLeg, ftScore, match]);

  function handleOutcome(status: LegOutcomeStatus) {
    setOutcomeStatus(status);
    if (status === "won") {
      setOutcomeLabel(normalizeTicketScoreLabel(customPick.trim() || outcomeLabel));
    }
  }

  async function handleUpdate() {
    setError("");
    const oddsNum = Number.parseFloat(odds);
    const pick = normalizeTicketScoreLabel(customPick.trim());

    if (!selectedEntry) {
      setError("Select a market.");
      return;
    }
    if (!pick) {
      setError("Enter or select a pick.");
      return;
    }
    if (!Number.isFinite(oddsNum) || oddsNum < 1) {
      setError("Enter valid odds (1.00 or higher).");
      return;
    }

    const ftH = ftHome.trim() === "" ? null : Number.parseInt(ftHome, 10);
    const ftA = ftAway.trim() === "" ? null : Number.parseInt(ftAway, 10);
    if (
      (ftH != null && (!Number.isFinite(ftH) || ftH < 0)) ||
      (ftA != null && (!Number.isFinite(ftA) || ftA < 0))
    ) {
      setError("Enter a valid FT score (e.g. 2 and 1).");
      return;
    }
    if ((ftH != null) !== (ftA != null)) {
      setError("Enter both home and away FT goals.");
      return;
    }

    const selectedPick = pickOptions.find((o) => o.id === selectedPickId);
    const marketId = selectedEntry.market.id;
    const pickKey =
      selectedPickId !== CUSTOM_PICK_ID && selectedPick
        ? selectedPick.id.split("::")[1] ?? selectedPick.id
        : pick;

    setSaving(true);
    try {
      if (backendMode) {
        await managerUpdateLeg(betId, legIndex, {
          selection: pickKey,
          selection_label: pick,
          odds: oddsNum,
          market_id: marketId,
          market_name: selectedEntry.name,
          outcome_label: normalizeTicketScoreLabel(outcomeLabel.trim() || pick),
          outcome_status: outcomeStatus,
          ft_home_score: ftH,
          ft_away_score: ftA,
        });
      } else {
        const updated = managerUpdateBetLeg(betId, {
          legIndex,
          marketId,
          marketName: selectedEntry.name,
          pick,
          pickKey,
          odds: oddsNum,
          outcomeLabel: normalizeTicketScoreLabel(outcomeLabel.trim() || pick),
          outcomeStatus,
          ftHomeScore: ftH,
          ftAwayScore: ftA,
        });
        if (!updated) {
          setError("Could not update this leg.");
          return;
        }
        logManagerAction(
          "Update bet leg",
          `${selection.homeTeam} vs ${selection.awayTeam} · ${selectedEntry.name} · ${pick} @ ${formatOdds(oddsNum)}${ftH != null && ftA != null ? ` · FT ${ftH}:${ftA}` : ""} · ${outcomeStatus}`,
        );
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this leg.");
    } finally {
      setSaving(false);
    }
  }

  const showResults =
    marketSearch.trim().length > 0 &&
    searchResults.some((e) => e.key !== selectedMarketKey || marketSearch !== selectedEntry?.name);

  return (
    <ManagerEditPopup open={open} onClose={onClose}>
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

        <p className="mb-3 text-[11px] text-muted">
          {selection.homeTeam} vs {selection.awayTeam}
        </p>

        <div className="space-y-3">
          <label className="block space-y-1.5">
            <span className={managerPanelLabelClass}>Market</span>

            {selectedEntry && (
              <div className="rounded-md border border-brand/25 bg-brand-light/50 px-2.5 py-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted">
                  Selected market
                </p>
                <p className="text-sm font-semibold text-brand-dark">{selectedEntry.name}</p>
              </div>
            )}

            <div className="relative">
              <input
                type="text"
                value={marketSearch}
                onChange={(e) => setMarketSearch(e.target.value)}
                placeholder="Search all markets…"
                className={`${managerPanelInputClass} pr-9`}
              />
              {marketSearch && (
                <button
                  type="button"
                  onClick={clearMarketSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-foreground"
                  aria-label="Clear search text"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {showResults && (
              <ul className="max-h-40 overflow-y-auto rounded-md border border-border">
                {searchResults.length === 0 ? (
                  <li className="px-3 py-2 text-xs text-muted">No markets found</li>
                ) : (
                  searchResults.map((entry) => (
                    <li key={entry.key}>
                      <button
                        type="button"
                        onClick={() => applyMarketEntry(entry)}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-brand-light/40 ${
                          entry.key === selectedMarketKey
                            ? "bg-brand-light/60 font-semibold text-brand-dark"
                            : "text-foreground"
                        }`}
                      >
                        {entry.name}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}

            {!selectedEntry && !marketSearch.trim() && (
              <p className={managerPanelHintClass}>
                Search for a market — e.g. Correct Score, Over/Under, 1X2
              </p>
            )}
          </label>

          <label className="block space-y-1.5">
            <span className={managerPanelLabelClass}>Odds</span>
            <input
              type="number"
              min="1"
              step="0.01"
              value={odds}
              onChange={(e) => setOdds(e.target.value)}
              className={`${managerPanelInputClass} font-semibold tabular-nums`}
            />
          </label>

          <div className="space-y-1.5">
            <span className={managerPanelLabelClass}>Pick</span>
            {manualPick ? (
              <p className={managerPanelHintClass}>
                Type the pick — e.g. 0:0, Over 2.5, Arsenal
              </p>
            ) : (
              <p className={managerPanelHintClass}>
                Search and choose a player for this scorer market
              </p>
            )}
            <PickField
              manual={manualPick}
              options={pickOptions}
              selectedId={selectedPickId}
              customPick={customPick}
              onSelect={handlePickSelect}
              onCustomChange={setCustomPick}
            />
          </div>

          <label className="block space-y-1.5">
            <span className={managerPanelLabelClass}>FT Score</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                value={ftHome}
                onChange={(e) => setFtHome(e.target.value)}
                placeholder="Home"
                className={`${managerPanelInputClass} text-center font-semibold tabular-nums`}
              />
              <span className="text-muted">:</span>
              <input
                type="number"
                min="0"
                value={ftAway}
                onChange={(e) => setFtAway(e.target.value)}
                placeholder="Away"
                className={`${managerPanelInputClass} text-center font-semibold tabular-nums`}
              />
            </div>
            <p className={managerPanelHintClass}>
              Shown on slip as FT Score:{" "}
              {ftHome !== "" && ftAway !== "" ? `${ftHome}:${ftAway}` : "—"}
            </p>
          </label>

          <label className="block space-y-1.5">
            <span className={managerPanelLabelClass}>Outcome</span>
            <input
              type="text"
              value={outcomeLabel}
              onChange={(e) => setOutcomeLabel(e.target.value)}
              className={managerPanelInputClass}
            />
            <SegmentedRow
              options={[
                { id: "won" as const, label: "Won" },
                { id: "lost" as const, label: "Lost" },
                { id: "void" as const, label: "Void" },
                { id: "not_started" as const, label: "Not Started" },
              ]}
              value={outcomeStatus}
              onChange={handleOutcome}
            />
          </label>

          {error && (
            <p className="rounded-md bg-red-50 px-2 py-1.5 text-[11px] text-live">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleUpdate}
              disabled={saving}
              className="flex-1 rounded-md bg-brand py-2 text-xs font-bold text-white disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save leg"}
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
    </ManagerEditPopup>
  );
}
