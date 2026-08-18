"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BetHistoryCard } from "@/components/BetHistoryCard";
import { useBetSlip } from "@/lib/betslip-context";
import { useAuth } from "@/lib/auth-context";
import { clearSettledBets, getBetsByUser } from "@/lib/bet-store";
import { getMyBets, useBackendApi } from "@/lib/backend-client";
import { backendBetToPlacedBet } from "@/lib/backend-mappers";
import type { BetStatus, PlacedBet } from "@/lib/bet-types";

export type TicketsTab = "open-bets" | "bet-history";
export type SettledFilter = "unsettled" | "settled" | "all";
export type ResultFilter = "all" | "won" | "lost" | "void";

function isSettled(status: BetStatus) {
  return status !== "open";
}

function formatBetDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function groupByDate(bets: PlacedBet[]) {
  const groups = new Map<string, PlacedBet[]>();
  for (const bet of bets) {
    const key = formatBetDate(bet.placedAt);
    const list = groups.get(key) ?? [];
    list.push(bet);
    groups.set(key, list);
  }
  return [...groups.entries()];
}

function filterBets(
  bets: PlacedBet[],
  settledFilter: SettledFilter,
  resultFilter: ResultFilter,
) {
  return bets.filter((bet) => {
    const settled = isSettled(bet.status);
    if (settledFilter === "settled" && !settled) return false;
    if (settledFilter === "unsettled" && settled) return false;
    if (resultFilter !== "all" && bet.status !== resultFilter) return false;
    return true;
  });
}

interface FilterSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}

function FilterSelect({ label, value, onChange, options }: FilterSelectProps) {
  return (
    <label className="relative min-w-0 flex-1">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded border border-border bg-white py-2 pl-2 pr-7 text-xs font-medium outline-none focus:border-brand"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" d="M6 9l6 6 6-6" />
      </svg>
    </label>
  );
}

interface BetTicketsPanelProps {
  /** Which sub-tab is active when embedded in betslip */
  activeTab?: TicketsTab;
  onTabChange?: (tab: TicketsTab) => void;
  /** Hide outer Open Bets / Bet History tab bar (betslip provides its own) */
  hideMainTabs?: boolean;
  onRemix?: () => void;
  /** Called when user opens a ticket (e.g. close betslip sheet) */
  onOpenTicket?: () => void;
}

export function BetTicketsPanel({
  activeTab: controlledTab,
  onTabChange,
  hideMainTabs = false,
  onRemix,
  onOpenTicket,
}: BetTicketsPanelProps) {
  const backendMode = useBackendApi();
  const { user, openLogin } = useAuth();
  const { loadSlip, setSlipTab } = useBetSlip();
  const [internalTab, setInternalTab] = useState<TicketsTab>("open-bets");
  const [settledFilter, setSettledFilter] = useState<SettledFilter>("unsettled");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [refreshKey, setRefreshKey] = useState(0);
  const [remoteBets, setRemoteBets] = useState<PlacedBet[]>([]);
  const [betsLoading, setBetsLoading] = useState(false);
  const [betsError, setBetsError] = useState("");

  const loadRemoteBets = useCallback(async () => {
    if (!user || !backendMode) return;
    setBetsLoading(true);
    setBetsError("");
    try {
      const remote = await getMyBets();
      setRemoteBets(remote.map(backendBetToPlacedBet));
    } catch (err) {
      setBetsError(err instanceof Error ? err.message : "Failed to load bets");
    } finally {
      setBetsLoading(false);
    }
  }, [user, backendMode]);

  useEffect(() => {
    if (backendMode && user) {
      void loadRemoteBets();
    }
  }, [backendMode, user, loadRemoteBets, refreshKey]);

  useEffect(() => {
    function bump() {
      setRefreshKey((k) => k + 1);
    }
    window.addEventListener("betplus:bets-updated", bump);
    return () => window.removeEventListener("betplus:bets-updated", bump);
  }, []);

  const activeTab = controlledTab ?? internalTab;

  function setActiveTab(tab: TicketsTab) {
    if (onTabChange) onTabChange(tab);
    else setInternalTab(tab);
    if (tab === "open-bets") {
      setSettledFilter("unsettled");
      setResultFilter("all");
    } else {
      setSettledFilter("settled");
      setResultFilter("all");
    }
  }

  const allBets = useMemo(() => {
    if (!user) return [];
    if (backendMode) return remoteBets;
    return getBetsByUser(user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshKey forces re-read after settle/clear
  }, [user?.id, backendMode, remoteBets, refreshKey]);

  const filtered = useMemo(
    () => filterBets(allBets, settledFilter, resultFilter),
    [allBets, settledFilter, resultFilter],
  );

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);

  function handleRemix(bet: PlacedBet) {
    loadSlip(bet.selections, bet.stake);
    setSlipTab("betslip");
    onRemix?.();
  }

  function handleClearHistory() {
    if (!user) return;
    if (backendMode) return;
    if (!confirm("Clear all settled bet history?")) return;
    clearSettledBets(user.id);
    setRefreshKey((k) => k + 1);
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
        <p className="text-sm text-muted">Log in to view your bets</p>
        <button
          type="button"
          onClick={openLogin}
          className="mt-3 rounded bg-brand px-4 py-2 text-xs font-semibold text-white hover:bg-brand-dark"
        >
          Log in
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[50vh] flex-col">
      {!hideMainTabs && (
        <div className="grid grid-cols-2 border-b border-border">
          <button
            type="button"
            onClick={() => setActiveTab("open-bets")}
            className={`py-3 text-sm font-semibold ${
              activeTab === "open-bets"
                ? "bg-white text-foreground"
                : "bg-brand-light text-muted"
            }`}
          >
            Open Bets
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("bet-history")}
            className={`py-3 text-sm font-semibold ${
              activeTab === "bet-history"
                ? "bg-white text-foreground"
                : "bg-brand-light text-muted"
            }`}
          >
            Bet History
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 border-b border-border bg-white px-3 py-2">
        <FilterSelect
          label="Settled filter"
          value={settledFilter}
          onChange={(v) => setSettledFilter(v as SettledFilter)}
          options={[
            { value: "unsettled", label: "Unsettled" },
            { value: "settled", label: "Settled" },
            { value: "all", label: "All" },
          ]}
        />
        <FilterSelect
          label="Bet result filter"
          value={resultFilter}
          onChange={(v) => setResultFilter(v as ResultFilter)}
          options={[
            { value: "all", label: "Bet Result" },
            { value: "won", label: "Win" },
            { value: "lost", label: "Lost" },
            { value: "void", label: "Void" },
          ]}
        />
        {activeTab === "bet-history" && (
          <button
            type="button"
            onClick={handleClearHistory}
            className="shrink-0 rounded p-2 text-muted hover:bg-surface-elevated hover:text-live"
            aria-label="Clear bet history"
            title="Clear history"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto bg-background px-3 py-3">
        {betsLoading ? (
          <p className="py-8 text-center text-sm text-muted">Loading bets...</p>
        ) : betsError ? (
          <div className="space-y-2 py-8 text-center">
            <p className="text-sm text-live">{betsError}</p>
            <button
              type="button"
              onClick={() => void loadRemoteBets()}
              className="text-xs font-medium text-brand hover:underline"
            >
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">
            {activeTab === "open-bets"
              ? "No open bets. Add picks and place a bet."
              : "No bets match these filters."}
          </p>
        ) : (
          <div className="space-y-4">
            {grouped.map(([date, bets]) => (
              <section key={date}>
                <p className="mb-2 text-xs font-medium text-muted">{date}</p>
                <ul className="space-y-3">
                  {bets.map((bet) => (
                    <li key={bet.id}>
                      <BetHistoryCard
                        bet={bet}
                        onRemix={() => handleRemix(bet)}
                        onOpenTicket={onOpenTicket}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
