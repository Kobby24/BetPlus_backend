import type { Sport } from "./types";

export interface LeagueEntry {
  id: string;
  name: string;
  sport: Sport;
  countryId: string;
  tier?: number;
}

export interface CountryEntry {
  id: string;
  name: string;
  flagCode: string;
}

export const COUNTRY_META: Record<string, CountryEntry> = {
  england: { id: "england", name: "England", flagCode: "gb-eng" },
  spain: { id: "spain", name: "Spain", flagCode: "es" },
  germany: { id: "germany", name: "Germany", flagCode: "de" },
  italy: { id: "italy", name: "Italy", flagCode: "it" },
  france: { id: "france", name: "France", flagCode: "fr" },
  netherlands: { id: "netherlands", name: "Netherlands", flagCode: "nl" },
  portugal: { id: "portugal", name: "Portugal", flagCode: "pt" },
  ghana: { id: "ghana", name: "Ghana", flagCode: "gh" },
  usa: { id: "usa", name: "United States", flagCode: "us" },
  japan: { id: "japan", name: "Japan", flagCode: "jp" },
  europe: { id: "europe", name: "Europe", flagCode: "eu" },
  international: { id: "international", name: "International", flagCode: "un" },
  korea: { id: "korea", name: "South Korea", flagCode: "kr" },
  sweden: { id: "sweden", name: "Sweden", flagCode: "se" },
  russia: { id: "russia", name: "Russia", flagCode: "ru" },
  finland: { id: "finland", name: "Finland", flagCode: "fi" },
};

export const LEAGUE_SPORTS: {
  id: Sport;
  label: string;
}[] = [
  { id: "football", label: "Football" },
  { id: "basketball", label: "Basketball" },
  { id: "baseball", label: "Baseball" },
  { id: "hockey", label: "Hockey" },
];

const footballLeagues: LeagueEntry[] = [
  { id: "premier-league", name: "Premier League", sport: "football", countryId: "england", tier: 1 },
  { id: "la-liga", name: "La Liga", sport: "football", countryId: "spain", tier: 1 },
  { id: "serie-a", name: "Serie A", sport: "football", countryId: "italy", tier: 1 },
  { id: "bundesliga", name: "Bundesliga", sport: "football", countryId: "germany", tier: 1 },
  { id: "ligue-1", name: "Ligue 1", sport: "football", countryId: "france", tier: 1 },
  { id: "champions-league", name: "UEFA Champions League", sport: "football", countryId: "europe", tier: 0 },
  { id: "europa-league", name: "UEFA Europa League", sport: "football", countryId: "europe", tier: 0 },
  { id: "conference-league", name: "UEFA Conference League", sport: "football", countryId: "europe", tier: 0 },
  { id: "eredivisie", name: "Eredivisie", sport: "football", countryId: "netherlands", tier: 1 },
  { id: "primeira-liga", name: "Primeira Liga", sport: "football", countryId: "portugal", tier: 1 },
  { id: "championship", name: "Championship", sport: "football", countryId: "england", tier: 2 },
  { id: "league-one", name: "League One", sport: "football", countryId: "england", tier: 3 },
  { id: "league-two", name: "League Two", sport: "football", countryId: "england", tier: 4 },
  { id: "national-league", name: "National League", sport: "football", countryId: "england", tier: 5 },
  { id: "fa-cup", name: "FA Cup", sport: "football", countryId: "england", tier: 0 },
  { id: "la-liga-2", name: "La Liga 2", sport: "football", countryId: "spain", tier: 2 },
  { id: "copa-del-rey", name: "Copa del Rey", sport: "football", countryId: "spain", tier: 0 },
  { id: "bundesliga-2", name: "2. Bundesliga", sport: "football", countryId: "germany", tier: 2 },
  { id: "dfb-pokal", name: "DFB-Pokal", sport: "football", countryId: "germany", tier: 0 },
  { id: "serie-b", name: "Serie B", sport: "football", countryId: "italy", tier: 2 },
  { id: "coppa-italia", name: "Coppa Italia", sport: "football", countryId: "italy", tier: 0 },
  { id: "ligue-2", name: "Ligue 2", sport: "football", countryId: "france", tier: 2 },
  { id: "coupe-de-france", name: "Coupe de France", sport: "football", countryId: "france", tier: 0 },
  { id: "mls", name: "MLS", sport: "football", countryId: "usa", tier: 1 },
  { id: "ghana-premier", name: "Ghana Premier League", sport: "football", countryId: "ghana", tier: 1 },
  { id: "j-league", name: "J League", sport: "football", countryId: "japan", tier: 1 },
  { id: "fifa-world-cup", name: "FIFA World Cup", sport: "football", countryId: "international", tier: 0 },
  { id: "caf-qualifiers", name: "CAF World Cup Qualifiers", sport: "football", countryId: "international", tier: 0 },
];

const basketballLeagues: LeagueEntry[] = [
  { id: "nba", name: "NBA", sport: "basketball", countryId: "usa", tier: 1 },
  { id: "g-league", name: "G League", sport: "basketball", countryId: "usa", tier: 2 },
  { id: "acb", name: "ACB", sport: "basketball", countryId: "spain", tier: 1 },
  { id: "euroleague", name: "EuroLeague", sport: "basketball", countryId: "europe", tier: 0 },
  { id: "bbl", name: "BBL", sport: "basketball", countryId: "england", tier: 1 },
];

const baseballLeagues: LeagueEntry[] = [
  { id: "mlb", name: "MLB", sport: "baseball", countryId: "usa", tier: 1 },
  { id: "npb", name: "NPB", sport: "baseball", countryId: "japan", tier: 1 },
  { id: "kbo", name: "KBO", sport: "baseball", countryId: "korea", tier: 1 },
  { id: "caribbean-series", name: "Caribbean Series", sport: "baseball", countryId: "international", tier: 0 },
];

const hockeyLeagues: LeagueEntry[] = [
  { id: "nhl", name: "NHL", sport: "hockey", countryId: "usa", tier: 1 },
  { id: "ahl", name: "AHL", sport: "hockey", countryId: "usa", tier: 2 },
  { id: "shl", name: "SHL", sport: "hockey", countryId: "sweden", tier: 1 },
  { id: "khl", name: "KHL", sport: "hockey", countryId: "russia", tier: 1 },
  { id: "liiga", name: "Liiga", sport: "hockey", countryId: "finland", tier: 1 },
];

export const ALL_LEAGUES: LeagueEntry[] = [
  ...footballLeagues,
  ...basketballLeagues,
  ...baseballLeagues,
  ...hockeyLeagues,
];

export const COUNTRIES: CountryEntry[] = Object.values(COUNTRY_META);

/** Top featured leagues per sport (shown first when sport is opened). */
export const TOP_LEAGUE_IDS: Record<Sport, string[]> = {
  football: [
    "premier-league",
    "la-liga",
    "serie-a",
    "bundesliga",
    "ligue-1",
    "champions-league",
    "europa-league",
    "conference-league",
    "eredivisie",
    "primeira-liga",
  ],
  basketball: ["nba", "euroleague", "acb", "bbl", "g-league"],
  baseball: ["mlb", "npb", "kbo", "caribbean-series"],
  hockey: ["nhl", "khl", "shl", "liiga", "ahl"],
};

/** Maps league display names in match data to league ids. */
export const LEAGUE_NAME_TO_ID: Record<string, string> = {
  "Premier League": "premier-league",
  "La Liga": "la-liga",
  "Serie A": "serie-a",
  Bundesliga: "bundesliga",
  "Ligue 1": "ligue-1",
  "UEFA Champions League": "champions-league",
  "UEFA Europa League": "europa-league",
  "UEFA Conference League": "conference-league",
  Eredivisie: "eredivisie",
  "Primeira Liga": "primeira-liga",
  Championship: "championship",
  "League One": "league-one",
  "League Two": "league-two",
  "National League": "national-league",
  "FA Cup": "fa-cup",
  "La Liga 2": "la-liga-2",
  "Copa del Rey": "copa-del-rey",
  "2. Bundesliga": "bundesliga-2",
  "DFB-Pokal": "dfb-pokal",
  "Serie B": "serie-b",
  "Coppa Italia": "coppa-italia",
  "Ligue 2": "ligue-2",
  "Coupe de France": "coupe-de-france",
  MLS: "mls",
  "Ghana Premier League": "ghana-premier",
  "J League": "j-league",
  "FIFA World Cup": "fifa-world-cup",
  "CAF World Cup Qualifiers": "caf-qualifiers",
  NBA: "nba",
  "G League": "g-league",
  MLB: "mlb",
  NHL: "nhl",
};

export function getLeagueById(id: string): LeagueEntry | undefined {
  return ALL_LEAGUES.find((l) => l.id === id);
}

export function getCountryById(id: string): CountryEntry | undefined {
  return COUNTRY_META[id];
}

export function getLeaguesForSport(sport: Sport): LeagueEntry[] {
  return ALL_LEAGUES.filter((l) => l.sport === sport);
}

export function getTopLeaguesForSport(sport: Sport): LeagueEntry[] {
  return TOP_LEAGUE_IDS[sport]
    .map((id) => getLeagueById(id))
    .filter((l): l is LeagueEntry => Boolean(l));
}

export function getCountriesForSport(sport: Sport): CountryEntry[] {
  const countryIds = [
    ...new Set(getLeaguesForSport(sport).map((l) => l.countryId)),
  ];

  return countryIds
    .map((id) => COUNTRY_META[id])
    .filter((c): c is CountryEntry => Boolean(c))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getLeaguesForCountry(
  sport: Sport,
  countryId: string,
): LeagueEntry[] {
  return getLeaguesForSport(sport)
    .filter((l) => l.countryId === countryId)
    .sort((a, b) => (a.tier ?? 99) - (b.tier ?? 99));
}

export function leagueIdFromMatchName(name: string): string | undefined {
  return LEAGUE_NAME_TO_ID[name];
}

export function isValidSport(value: string): value is Sport {
  return LEAGUE_SPORTS.some((s) => s.id === value);
}

export function sportLabel(sport: Sport) {
  return LEAGUE_SPORTS.find((s) => s.id === sport)?.label ?? sport;
}
