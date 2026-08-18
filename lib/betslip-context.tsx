"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { BetSelection, Match, OddsSelection } from "./types";

export type BetSlipType = "single" | "multiple" | "system";
export type BetSlipMode = "real" | "sim";
export type BetSlipTab = "betslip" | "open-bets" | "bet-history";

interface AddMarketInput {
  marketId: string;
  marketName: string;
  outcomeId: string;
  outcomeLabel: string;
  odds: number;
}

interface BetSlipContextValue {
  selections: BetSelection[];
  activeSelections: BetSelection[];
  stake: number;
  setStake: (stake: number) => void;
  betType: BetSlipType;
  setBetType: (type: BetSlipType) => void;
  betMode: BetSlipMode;
  setBetMode: (mode: BetSlipMode) => void;
  slipTab: BetSlipTab;
  setSlipTab: (tab: BetSlipTab) => void;
  flexiEnabled: boolean;
  setFlexiEnabled: (on: boolean) => void;
  oneCutEnabled: boolean;
  setOneCutEnabled: (on: boolean) => void;
  addSelection: (match: Match, selection: OddsSelection) => void;
  addMarketSelection: (match: Match, input: AddMarketInput) => void;
  removeSelection: (id: string) => void;
  clearSlip: () => void;
  toggleSelectionEnabled: (id: string) => void;
  isSelectionEnabled: (id: string) => boolean;
  isSelected: (matchId: string, selection: OddsSelection) => boolean;
  isMarketSelected: (
    matchId: string,
    marketId: string,
    outcomeId: string,
  ) => boolean;
  totalOdds: number;
  totalStake: number;
  maxBonus: number;
  potentialWin: number;
  selectionCount: number;
  betslipOpen: boolean;
  setBetslipOpen: (open: boolean) => void;
  toggleBetslip: () => void;
  /** Open betslip sheet on Open Bets or Bet History tab (mobile-friendly). */
  openTicketsTab: (tab?: "open-bets" | "bet-history") => void;
  loadSlip: (selections: BetSelection[], stake?: number) => void;
}

const BetSlipContext = createContext<BetSlipContextValue | null>(null);

function selectionLabel(match: Match, selection: OddsSelection) {
  if (selection === "home") return match.homeTeam;
  if (selection === "away") return match.awayTeam;
  return "Draw";
}

function r(n: number) {
  return Math.round(n * 100) / 100;
}

export function BetSlipProvider({ children }: { children: ReactNode }) {
  const [selections, setSelections] = useState<BetSelection[]>([]);
  const [stake, setStake] = useState(1);
  const [disabledIds, setDisabledIds] = useState<Set<string>>(new Set());
  const [betType, setBetType] = useState<BetSlipType>("multiple");
  const [betMode, setBetMode] = useState<BetSlipMode>("real");
  const [slipTab, setSlipTab] = useState<BetSlipTab>("betslip");
  const [flexiEnabled, setFlexiEnabled] = useState(false);
  const [oneCutEnabled, setOneCutEnabled] = useState(false);
  const [betslipOpen, setBetslipOpen] = useState(false);

  const activeSelections = useMemo(
    () => selections.filter((s) => !disabledIds.has(s.id)),
    [selections, disabledIds],
  );

  const replaceMatchSelection = useCallback(
    (matchId: string, next: BetSelection) => {
      setSelections((prev) => {
        const withoutMatch = prev.filter((s) => s.matchId !== matchId);
        const existing = prev.find((s) => s.id === next.id);
        if (existing) return withoutMatch;
        return [...withoutMatch, next];
      });
      setDisabledIds((prev) => {
        const updated = new Set(prev);
        updated.delete(next.id);
        return updated;
      });
    },
    [],
  );

  const addSelection = useCallback(
    (match: Match, selection: OddsSelection) => {
      const odds = match.odds[selection];
      if (!odds) return;

      replaceMatchSelection(match.id, {
        id: `${match.id}-${selection}`,
        matchId: match.id,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        selection,
        selectionLabel: selectionLabel(match, selection),
        odds,
        league: match.league,
        marketId: "1x2",
        marketName: "1X2",
        kickoff: match.kickoff,
      });
    },
    [replaceMatchSelection],
  );

  const addMarketSelection = useCallback(
    (match: Match, input: AddMarketInput) => {
      replaceMatchSelection(match.id, {
        id: `${match.id}-${input.marketId}-${input.outcomeId}`,
        matchId: match.id,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        selection: input.outcomeId,
        selectionLabel: input.outcomeLabel,
        odds: input.odds,
        league: match.league,
        marketId: input.marketId,
        marketName: input.marketName,
        kickoff: match.kickoff,
      });
    },
    [replaceMatchSelection],
  );

  const removeSelection = useCallback((id: string) => {
    setSelections((prev) => prev.filter((s) => s.id !== id));
    setDisabledIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const clearSlip = useCallback(() => {
    setSelections([]);
    setDisabledIds(new Set());
  }, []);

  const toggleSelectionEnabled = useCallback((id: string) => {
    setDisabledIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const isSelectionEnabled = useCallback(
    (id: string) => !disabledIds.has(id),
    [disabledIds],
  );

  const isSelected = useCallback(
    (matchId: string, selection: OddsSelection) =>
      selections.some(
        (s) =>
          s.matchId === matchId &&
          s.selection === selection &&
          (s.marketId === "1x2" || !s.marketId),
      ),
    [selections],
  );

  const isMarketSelected = useCallback(
    (matchId: string, marketId: string, outcomeId: string) =>
      selections.some(
        (s) =>
          s.matchId === matchId &&
          s.marketId === marketId &&
          s.selection === outcomeId,
      ),
    [selections],
  );

  const totalOdds = useMemo(() => {
    if (activeSelections.length === 0) return 0;
    if (betType === "single") {
      return activeSelections[0]?.odds ?? 0;
    }
    return activeSelections.reduce((acc, s) => acc * s.odds, 1);
  }, [activeSelections, betType]);

  const totalStake = useMemo(() => {
    if (betType === "single") return stake * activeSelections.length;
    return stake;
  }, [betType, stake, activeSelections.length]);

  const maxBonus = useMemo(() => {
    if (betType !== "multiple" || activeSelections.length < 3) return 0;
    const base = stake * totalOdds;
    return r(base * 0.04);
  }, [betType, activeSelections.length, stake, totalOdds]);

  const potentialWin = useMemo(() => {
    if (activeSelections.length === 0) return 0;
    if (betType === "single") {
      return r(
        activeSelections.reduce((sum, s) => sum + stake * s.odds, 0) + maxBonus,
      );
    }
    return r(stake * totalOdds + maxBonus);
  }, [activeSelections, betType, stake, totalOdds, maxBonus]);

  const toggleBetslip = useCallback(() => {
    setBetslipOpen((open) => !open);
  }, []);

  const openTicketsTab = useCallback(
    (tab: "open-bets" | "bet-history" = "open-bets") => {
      setSlipTab(tab);
      setBetslipOpen(true);
    },
    [],
  );

  const loadSlip = useCallback((newSelections: BetSelection[], newStake?: number) => {
    setSelections(newSelections);
    setDisabledIds(new Set());
    if (newStake !== undefined) setStake(newStake);
    setBetslipOpen(true);
  }, []);

  const value = useMemo(
    () => ({
      selections,
      activeSelections,
      stake,
      setStake,
      betType,
      setBetType,
      betMode,
      setBetMode,
      slipTab,
      setSlipTab,
      flexiEnabled,
      setFlexiEnabled,
      oneCutEnabled,
      setOneCutEnabled,
      addSelection,
      addMarketSelection,
      removeSelection,
      clearSlip,
      toggleSelectionEnabled,
      isSelectionEnabled,
      isSelected,
      isMarketSelected,
      totalOdds,
      totalStake,
      maxBonus,
      potentialWin,
      selectionCount: selections.length,
      betslipOpen,
      setBetslipOpen,
      toggleBetslip,
      openTicketsTab,
      loadSlip,
    }),
    [
      selections,
      activeSelections,
      stake,
      betType,
      betMode,
      slipTab,
      flexiEnabled,
      oneCutEnabled,
      addSelection,
      addMarketSelection,
      removeSelection,
      clearSlip,
      toggleSelectionEnabled,
      isSelectionEnabled,
      isSelected,
      isMarketSelected,
      totalOdds,
      totalStake,
      maxBonus,
      potentialWin,
      betslipOpen,
      toggleBetslip,
      openTicketsTab,
      loadSlip,
    ],
  );

  return (
    <BetSlipContext.Provider value={value}>{children}</BetSlipContext.Provider>
  );
}

export function useBetSlip() {
  const ctx = useContext(BetSlipContext);
  if (!ctx) {
    throw new Error("useBetSlip must be used within BetSlipProvider");
  }
  return ctx;
}
