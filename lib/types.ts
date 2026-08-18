export type Sport = "football" | "basketball" | "baseball" | "hockey";

export type OddsSelection = "home" | "draw" | "away";

export interface Match {
  id: string;
  sport: Sport;
  league: string;
  homeTeam: string;
  awayTeam: string;
  homeAbbr: string;
  awayAbbr: string;
  kickoff: string;
  isLive?: boolean;
  liveMinute?: number;
  homeScore?: number;
  awayScore?: number;
  isQualifier?: boolean;
  legInfo?: string;
  aggregateScore?: string;
  odds: {
    home: number;
    draw: number;
    away: number;
  };
}

export interface BetSelection {
  id: string;
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  selection: string;
  selectionLabel: string;
  odds: number;
  league: string;
  marketId?: string;
  marketName?: string;
  /** Manager-set result label shown as Outcome on ticket */
  outcomeLabel?: string;
  /** Manager-set FT score shown on ticket before auto settlement */
  managerFtScore?: { home: number; away: number };
  /** ISO kickoff — used to lock admin edits after Full Time */
  kickoff?: string;
}

export type MarketCategory =
  | "all"
  | "main"
  | "goals"
  | "half"
  | "bookings"
  | "corners"
  | "combo"
  | "players"
  | "teams"
  | "minutes"
  | "match"
  | "to-qualify";

export interface MarketOutcome {
  id: string;
  label: string;
  odds: number;
  team?: "home" | "away";
}

export interface BettingMarket {
  id: string;
  name: string;
  /** Primary category; market also appears in `categories` when listed under multiple tabs */
  category: MarketCategory;
  categories?: MarketCategory[];
  outcomes: MarketOutcome[];
  /** players = both teams listed with name + odds rows */
  layout?: "grid" | "players";
  playerOddsKey?:
    | "anytimeOdds"
    | "firstOdds"
    | "lastOdds"
    | "score2Odds"
    | "score3Odds"
    | "cardOdds";
}

export const FOOTBALL_MARKET_CATEGORIES: {
  id: MarketCategory;
  label: string;
}[] = [
  { id: "all", label: "All" },
  { id: "main", label: "Main" },
  { id: "goals", label: "Goals" },
  { id: "half", label: "Half" },
  { id: "bookings", label: "Bookings" },
  { id: "corners", label: "Corners" },
  { id: "combo", label: "Combo" },
  { id: "players", label: "Players" },
  { id: "teams", label: "Teams" },
  { id: "minutes", label: "Minutes" },
  { id: "match", label: "Match" },
];

export const QUALIFIER_CATEGORY = {
  id: "to-qualify" as const,
  label: "To Qualify",
};
