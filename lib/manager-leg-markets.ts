import type { BetSelection, BettingMarket, MarketCategory, Match } from "./types";
import { FOOTBALL_MARKET_CATEGORIES, QUALIFIER_CATEGORY } from "./types";
import { getMarketsForMatch } from "./match-markets";
import { getMatchById } from "./mock-data";
import { getMatchPlayers } from "./match-players";
import { normalizeTicketScoreLabel } from "./ticket-display";

export interface LegPickOption {
  id: string;
  label: string;
  odds: number;
  marketId: string;
  marketName: string;
}

/** One catalog market row in the manager picker. */
export interface LegMarketEntry {
  key: string;
  name: string;
  market: BettingMarket;
  category: MarketCategory;
}

export interface LegMarketGroup {
  category: MarketCategory;
  label: string;
  entries: LegMarketEntry[];
}

const CATEGORY_ORDER: MarketCategory[] = [
  "main",
  "goals",
  "half",
  "combo",
  "teams",
  "minutes",
  "bookings",
  "corners",
  "players",
  "match",
  "to-qualify",
];

export function getMatchForLeg(selection: BetSelection): Match | null {
  return getMatchById(selection.matchId) ?? null;
}

function marketById(match: Match, marketId: string): BettingMarket | undefined {
  return getMarketsForMatch(match).find((m) => m.id === marketId);
}

/** Strip O/U line suffixes (1.5, 2.5, …) — lines belong in the option field, not the market list. */
export function normalizeLegMarketName(name: string): string {
  return name
    .replace(/(\sOver\/Under)\s+\d+(?:\.\d+)?$/i, "$1")
    .replace(/(\s1st Half Over\/Under)\s+\d+(?:\.\d+)?$/i, "$1");
}

/** Unique market names only — Correct Score, Over/Under, 1X2 (not 0:0, Over 2.5, etc.). */
export function buildLegMarketCatalog(match: Match): LegMarketEntry[] {
  const byName = new Map<string, BettingMarket>();

  for (const market of getMarketsForMatch(match)) {
    const key = normalizeLegMarketName(market.name);
    if (!byName.has(key)) {
      byName.set(key, { ...market, name: key });
    }
  }

  return [...byName.entries()]
    .map(([name, market]) => ({
      key: name,
      name,
      market,
      category: market.category,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function groupLegMarketCatalog(entries: LegMarketEntry[]): LegMarketGroup[] {
  const byCat = new Map<MarketCategory, LegMarketEntry[]>();

  for (const entry of entries) {
    const list = byCat.get(entry.category) ?? [];
    list.push(entry);
    byCat.set(entry.category, list);
  }

  const labelFor = (id: MarketCategory) =>
    id === "to-qualify"
      ? QUALIFIER_CATEGORY.label
      : (FOOTBALL_MARKET_CATEGORIES.find((c) => c.id === id)?.label ?? id);

  return CATEGORY_ORDER.filter((c) => byCat.has(c)).map((category) => ({
    category,
    label: labelFor(category),
    entries: byCat.get(category) ?? [],
  }));
}

export function findLegMarketEntry(
  match: Match,
  selection: BetSelection,
): LegMarketEntry | null {
  const catalog = buildLegMarketCatalog(match);

  if (selection.marketId) {
    const source = marketById(match, selection.marketId);
    if (source) {
      const key = normalizeLegMarketName(source.name);
      const byName = catalog.find((e) => e.key === key);
      if (byName) return byName;
    }
  }

  if (selection.marketName) {
    const key = normalizeLegMarketName(selection.marketName);
    const byName = catalog.find((e) => e.key === key);
    if (byName) return byName;
  }

  return catalog.find((e) => e.key === "1X2") ?? catalog[0] ?? null;
}

/** Only player-to-score markets use pick options; everything else is manual (0:0, Over 2.5, etc.). */
export function marketUsesPickOptions(market: BettingMarket): boolean {
  return market.layout === "players" && !!market.playerOddsKey;
}

export function getPickOptionsForMarket(
  match: Match,
  market: BettingMarket,
): LegPickOption[] {
  if (!marketUsesPickOptions(market)) return [];

  if (market.layout === "players" && market.playerOddsKey) {
    const key = market.playerOddsKey;
    const fromPlayers = getMatchPlayers(match).map((player) => ({
      id: `${market.id}::${market.id}-${player.id}`,
      label: player.name,
      odds: player[key],
      marketId: market.id,
      marketName: market.name,
    }));
    const extras = market.outcomes.map((o) => ({
      id: `${market.id}::${o.id}`,
      label: o.label,
      odds: o.odds,
      marketId: market.id,
      marketName: market.name,
    }));
    return [...fromPlayers, ...extras];
  }

  return [];
}

export function parseScorePair(value: string): { home: number; away: number } | null {
  const normalized = value.trim().replace(/-/g, ":");
  const match = normalized.match(/^(\d+)\s*[:\-]\s*(\d+)$/);
  if (!match) return null;
  return { home: Number.parseInt(match[1], 10), away: Number.parseInt(match[2], 10) };
}

export function formatScorePair(home: number, away: number): string {
  return `${home}:${away}`;
}

export function findPickOption(
  options: LegPickOption[],
  selection: BetSelection,
): LegPickOption | null {
  if (options.length === 0) return null;

  const composite = selection.marketId
    ? `${selection.marketId}::${selection.selection}`
    : null;
  if (composite) {
    const byComposite = options.find((o) => o.id === composite);
    if (byComposite) return byComposite;
  }

  const byId = options.find((o) => o.id.endsWith(`::${selection.selection}`));
  if (byId) return byId;

  const label = normalizeTicketScoreLabel(
    selection.selectionLabel.trim().toLowerCase(),
  );
  return (
    options.find((o) => o.label.trim().toLowerCase() === label) ??
    options.find(
      (o) =>
        normalizeTicketScoreLabel(o.label) ===
        normalizeTicketScoreLabel(selection.selectionLabel),
    ) ??
    null
  );
}

/** @deprecated */
export type LegMarketOption = LegMarketEntry;

/** @deprecated */
export function findLegMarketOption(
  match: Match,
  selection: BetSelection,
): LegMarketEntry | null {
  return findLegMarketEntry(match, selection);
}

/** @deprecated */
export function getPickOptionsForMarketGroup(
  match: Match,
  entry: LegMarketEntry,
): LegPickOption[] {
  return getPickOptionsForMarket(match, entry.market);
}

/** @deprecated */
export function isCorrectScoreMarket(_entry: LegMarketEntry): boolean {
  return false;
}

/** @deprecated */
export function groupMarketsForLeg(match: Match): LegMarketGroup[] {
  return groupLegMarketCatalog(buildLegMarketCatalog(match));
}

/** @deprecated */
export function findMarketForSelection(
  match: Match,
  selection: BetSelection,
): BettingMarket | null {
  return findLegMarketEntry(match, selection)?.market ?? null;
}
