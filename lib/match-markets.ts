import type { BettingMarket, MarketCategory, MarketOutcome, Match } from "./types";
import { buildSportyBetCatalog } from "./football-market-catalog";
import { mkMarket, overUnder, r, yesNo } from "./market-factories";

export function getMarketCategoriesForMatch(match: Match) {
  if (match.sport !== "football") {
    return [
      { id: "all" as const, label: "All" },
      { id: "main" as const, label: "Main" },
      { id: "match" as const, label: "Match" },
    ];
  }

  const cats: { id: MarketCategory; label: string }[] = [
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

  if (match.isQualifier) {
    cats.push({ id: "to-qualify", label: "To Qualify" });
  }

  return cats;
}

export function getMarketsForMatch(match: Match): BettingMarket[] {
  if (match.sport === "football") {
    return buildFootballMarkets(match);
  }
  return buildOtherSportMarkets(match);
}

function buildFootballMarkets(match: Match): BettingMarket[] {
  const { homeTeam, awayTeam, homeAbbr, awayAbbr, home, draw, away } = {
    ...match,
    ...match.odds,
  };

  const markets: BettingMarket[] = [
    ...buildSportyBetCatalog(match),

    // ── BOOKINGS ──
    overUnder("total-cards", "Total Cards", "bookings", "3.5", 1.85, 1.9),
    overUnder("total-cards-45", "Total Cards", "bookings", "4.5", 2.4, 1.55),
    mkMarket("card-handicap", "Card Handicap", "bookings", [
      { id: "ch-h", label: `${homeAbbr} -0.5`, odds: 1.9 },
      { id: "ch-a", label: `${awayAbbr} +0.5`, odds: 1.85 },
    ]),
    mkMarket("first-card", "First Card", "bookings", [
      { id: "fc-h", label: homeTeam, odds: 1.95 },
      { id: "fc-n", label: "No Card", odds: 15.0 },
      { id: "fc-a", label: awayTeam, odds: 2.05 },
    ]),
    overUnder("team-cards-h", `${homeTeam} Cards`, "bookings", "1.5", 1.75, 2.0),
    overUnder("team-cards-a", `${awayTeam} Cards`, "bookings", "1.5", 1.8, 1.95),
    overUnder("booking-points", "Booking Points", "bookings", "35.5", 1.88, 1.88),
    mkMarket("card-interval", "Card Interval", "bookings", [
      { id: "cai-1-15", label: "1–15", odds: 4.5 },
      { id: "cai-16-30", label: "16–30", odds: 3.8 },
    ]),

    // ── CORNERS ──
    overUnder("total-corners", "Total Corners", "corners", "9.5", 1.88, 1.86),
    overUnder("total-corners-85", "Total Corners", "corners", "8.5", 1.65, 2.15),
    mkMarket("corner-handicap", "Corner Handicap", "corners", [
      { id: "cnh-h", label: `${homeAbbr} -1.5`, odds: 1.95 },
      { id: "cnh-a", label: `${awayAbbr} +1.5`, odds: 1.82 },
    ]),
    mkMarket("first-corner", "First Corner", "corners", [
      { id: "fcnr-h", label: homeTeam, odds: 1.85 },
      { id: "fcnr-a", label: awayTeam, odds: 2.0 },
    ]),
    mkMarket("last-corner", "Last Corner", "corners", [
      { id: "lcnr-h", label: homeTeam, odds: 1.9 },
      { id: "lcnr-a", label: awayTeam, odds: 1.95 },
    ]),
    mkMarket("next-corner", "Next Corner", "corners", [
      { id: "ncnr-h", label: homeTeam, odds: 1.88 },
      { id: "ncnr-a", label: awayTeam, odds: 1.92 },
    ]),
    mkMarket("race-corners", "Race to Corners", "corners", [
      { id: "rc-h5", label: `${homeAbbr} to 5`, odds: 2.1 },
      { id: "rc-a5", label: `${awayAbbr} to 5`, odds: 2.3 },
      { id: "rc-n", label: "Neither", odds: 4.0 },
    ]),
    overUnder("team-corners-h", `${homeTeam} Corners`, "corners", "4.5", 1.8, 1.95, ["teams"]),
    overUnder("team-corners-a", `${awayTeam} Corners`, "corners", "4.5", 1.85, 1.9, ["teams"]),
    mkMarket("corners-odd-even", "Odd/Even Corners", "corners", [
      { id: "cno", label: "Odd", odds: 1.9 },
      { id: "cne", label: "Even", odds: 1.9 },
    ]),
    overUnder("1h-corners", "1st Half Corners", "corners", "4.5", 1.75, 1.98),
    mkMarket("exact-corners", "Exact Corners", "corners", [
      { id: "ec-6-8", label: "6–8", odds: 3.5 },
      { id: "ec-9-11", label: "9–11", odds: 3.0 },
      { id: "ec-12+", label: "12+", odds: 4.5 },
    ]),
    mkMarket("corner-interval", "Corner Interval", "corners", [
      { id: "ci-1-15", label: "1–15", odds: 2.8 },
      { id: "ci-16-30", label: "16–30", odds: 3.0 },
    ]),

    // ── PLAYER SCORER MARKETS (both squads) ──
    ...buildPlayerMarkets(),

    // ── OTHER PLAYER STATS ──
    overUnder("player-assists", "Player Assists", "players", "0.5", 2.8, 1.4),
    overUnder("player-shots", "Player Shots", "players", "1.5", 1.85, 1.9),
    overUnder("player-sot", "Shots on Target", "players", "0.5", 1.72, 2.05),
    overUnder("player-tackles", "Player Tackles", "players", "2.5", 1.9, 1.85),
    overUnder("player-passes", "Player Passes", "players", "49.5", 1.88, 1.88),
    overUnder("player-fouls", "Player Fouls", "players", "1.5", 1.95, 1.82),
    yesNo("score-each-half", "Player to Score in Each Half", "players", 12.0, 1.02),
  ];

  if (match.isQualifier) {
    markets.push(
      mkMarket("to-qualify", "To Qualify", "to-qualify", [
        { id: "tq-h", label: homeTeam, odds: r(home * 0.88) },
        { id: "tq-a", label: awayTeam, odds: r(away * 0.88) },
      ]),
      mkMarket("to-qualify-90", "To Qualify in 90 Minutes", "to-qualify", [
        { id: "tq90-h", label: homeTeam, odds: r(home * 1.05) },
        { id: "tq90-a", label: awayTeam, odds: r(away * 1.05) },
      ]),
      mkMarket("to-qualify-et", "To Qualify After Extra Time", "to-qualify", [
        { id: "tqet-h", label: homeTeam, odds: r(home * 0.95) },
        { id: "tqet-a", label: awayTeam, odds: r(away * 0.95) },
      ]),
    );
  }

  return markets;
}

function buildPlayerMarkets(): BettingMarket[] {
  type Key = NonNullable<BettingMarket["playerOddsKey"]>;

  const defs: {
    id: string;
    name: string;
    category: MarketCategory;
    key: Key;
    extra?: MarketCategory[];
    extraOutcomes?: MarketOutcome[];
  }[] = [
    {
      id: "anytime-scorer",
      name: "Anytime Goalscorer",
      category: "players",
      key: "anytimeOdds",
    },
    {
      id: "first-scorer",
      name: "First Goalscorer",
      category: "players",
      key: "firstOdds",
      extraOutcomes: [{ id: "no-gs", label: "No Goalscorer", odds: 12.0 }],
    },
    {
      id: "last-scorer",
      name: "Last Goalscorer",
      category: "players",
      key: "lastOdds",
      extraOutcomes: [{ id: "no-gs", label: "No Goalscorer", odds: 12.0 }],
    },
    {
      id: "score-2plus",
      name: "Player to Score 2+",
      category: "players",
      key: "score2Odds",
    },
    {
      id: "score-3plus",
      name: "Player to Score 3+",
      category: "players",
      key: "score3Odds",
    },
    {
      id: "player-booked",
      name: "Player to Be Booked",
      category: "bookings",
      key: "cardOdds",
      extra: ["players"],
    },
  ];

  return defs.map((d) =>
    mkMarket(d.id, d.name, d.category, d.extraOutcomes ?? [], d.extra, {
      layout: "players",
      playerOddsKey: d.key,
    }),
  );
}

function buildOtherSportMarkets(match: Match): BettingMarket[] {
  return [
    mkMarket("winner", "Match Winner", "main", [
      { id: "home", label: match.homeTeam, odds: match.odds.home },
      { id: "away", label: match.awayTeam, odds: match.odds.away },
    ]),
    mkMarket("handicap", "Handicap", "match", [
      { id: "hcp-h", label: `${match.homeAbbr} -2.5`, odds: 1.9 },
      { id: "hcp-a", label: `${match.awayAbbr} +2.5`, odds: 1.9 },
    ]),
  ];
}

export function filterMarketsByCategory(
  markets: BettingMarket[],
  category: MarketCategory,
) {
  if (category === "all") return markets;
  return markets.filter(
    (m) =>
      m.category === category ||
      m.categories?.includes(category),
  );
}

export function countMarketsByCategory(
  markets: BettingMarket[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const m of markets) {
    const cats = m.categories ?? [m.category];
    for (const c of cats) {
      if (c !== "all") counts[c] = (counts[c] ?? 0) + 1;
    }
  }
  return counts;
}
