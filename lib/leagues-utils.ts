import {
  getLeagueById,
  getLeaguesForCountry,
  leagueIdFromMatchName,
  type LeagueEntry,
} from "./leagues-data";
import { MATCHES } from "./mock-data";
import type { Match, Sport } from "./types";

const PLACEHOLDER_TEAMS: Record<Sport, [string, string, string, string][]> = {
  football: [
    ["City FC", "United", "CTY", "UTD"],
    ["Rovers", "Athletic", "ROV", "ATH"],
    ["Wanderers", "Town", "WAN", "TWN"],
    ["Sporting", "Rangers", "SPT", "RNG"],
  ],
  basketball: [
    ["Lakers", "Celtics", "LAL", "BOS"],
    ["Warriors", "Suns", "GSW", "PHX"],
    ["Heat", "Bulls", "MIA", "CHI"],
    ["Nets", "Knicks", "BKN", "NYK"],
  ],
  baseball: [
    ["Yankees", "Red Sox", "NYY", "BOS"],
    ["Dodgers", "Giants", "LAD", "SF"],
    ["Cubs", "Cardinals", "CHC", "STL"],
    ["Astros", "Rangers", "HOU", "TEX"],
  ],
  hockey: [
    ["Maple Leafs", "Canadiens", "TOR", "MTL"],
    ["Rangers", "Devils", "NYR", "NJD"],
    ["Blackhawks", "Red Wings", "CHI", "DET"],
    ["Bruins", "Penguins", "BOS", "PIT"],
  ],
};

function hashString(value: string) {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function hoursFromNow(h: number) {
  return new Date(Date.now() + h * 60 * 60 * 1000).toISOString();
}

function generatePlaceholderMatches(league: LeagueEntry, count = 4): Match[] {
  const teams = PLACEHOLDER_TEAMS[league.sport];
  const base = hashString(league.id);

  return Array.from({ length: count }, (_, i) => {
    const t = teams[(base + i) % teams.length];
    const hourOffset = 3 + i * 2 + (base % 3);
    return {
      id: `gen-${league.id}-${i}`,
      sport: league.sport,
      league: league.name,
      homeTeam: t[0],
      awayTeam: t[1],
      homeAbbr: t[2],
      awayAbbr: t[3],
      kickoff: hoursFromNow(hourOffset),
      odds: {
        home: 1.75 + (i % 3) * 0.35,
        draw: league.sport === "football" ? 3.2 + i * 0.1 : 0,
        away: 2.1 + (i % 2) * 0.4,
      },
    };
  });
}

export function getMatchesForLeague(leagueId: string): Match[] {
  const league = getLeagueById(leagueId);
  if (!league) return [];

  const existing = MATCHES.filter(
    (m) =>
      m.sport === league.sport &&
      (leagueIdFromMatchName(m.league) === leagueId || m.league === league.name),
  );

  if (existing.length > 0) return existing;
  return generatePlaceholderMatches(league);
}

export function countMatchesForLeague(leagueId: string): number {
  return getMatchesForLeague(leagueId).length;
}

export function getMatchesForSport(sport: Sport): Match[] {
  const fromData = MATCHES.filter((m) => m.sport === sport);
  if (fromData.length > 0) return fromData;

  const league = getLeagueById(
    sport === "basketball"
      ? "nba"
      : sport === "baseball"
        ? "mlb"
        : sport === "hockey"
          ? "nhl"
          : "premier-league",
  );
  return league ? generatePlaceholderMatches(league) : [];
}

export function countMatchesForCountry(sport: Sport, countryId: string): number {
  return getLeaguesForCountry(sport, countryId).reduce(
    (sum, league) => sum + countMatchesForLeague(league.id),
    0,
  );
}
