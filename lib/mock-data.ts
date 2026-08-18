import type { Match } from "./types";
import type { IconId } from "./icons";

export const SPORTS: { id: Match["sport"]; label: string; icon: IconId }[] = [
  { id: "football", label: "Football", icon: "football" },
  { id: "basketball", label: "Basketball", icon: "basketball" },
  { id: "baseball", label: "Baseball", icon: "baseball" },
  { id: "hockey", label: "Hockey", icon: "hockey" },
];

export const NAV_TABS = [
  { href: "/", label: "Sports" },
  { href: "/live", label: "Live" },
  { href: "/leagues", label: "Leagues" },
  { href: "/games", label: "Games" },
];

const now = Date.now();

function hoursFromNow(h: number) {
  return new Date(now + h * 60 * 60 * 1000).toISOString();
}

function daysFromNow(d: number, hour = 19) {
  const date = new Date(now + d * 24 * 60 * 60 * 1000);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

export const MATCHES: Match[] = [
  {
    id: "m1",
    sport: "football",
    league: "Premier League",
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    homeAbbr: "ARS",
    awayAbbr: "CHE",
    kickoff: hoursFromNow(2),
    odds: { home: 2.15, draw: 3.40, away: 3.20 },
  },
  {
    id: "m2",
    sport: "football",
    league: "Premier League",
    homeTeam: "Liverpool",
    awayTeam: "Manchester City",
    homeAbbr: "LIV",
    awayAbbr: "MCI",
    kickoff: hoursFromNow(4),
    odds: { home: 2.80, draw: 3.50, away: 2.45 },
  },
  {
    id: "m3",
    sport: "football",
    league: "La Liga",
    homeTeam: "Real Madrid",
    awayTeam: "Barcelona",
    homeAbbr: "RMA",
    awayAbbr: "BAR",
    kickoff: hoursFromNow(6),
    odds: { home: 2.10, draw: 3.60, away: 3.30 },
  },
  {
    id: "m4",
    sport: "football",
    league: "Serie A",
    homeTeam: "Inter Milan",
    awayTeam: "AC Milan",
    homeAbbr: "INT",
    awayAbbr: "MIL",
    kickoff: hoursFromNow(8),
    odds: { home: 1.95, draw: 3.50, away: 3.80 },
  },
  {
    id: "m5",
    sport: "football",
    league: "Bundesliga",
    homeTeam: "Bayern Munich",
    awayTeam: "Borussia Dortmund",
    homeAbbr: "BAY",
    awayAbbr: "BVB",
    kickoff: hoursFromNow(10),
    odds: { home: 1.72, draw: 4.00, away: 4.50 },
  },
  {
    id: "m6",
    sport: "football",
    league: "FIFA World Cup",
    homeTeam: "Nigeria",
    awayTeam: "Ghana",
    homeAbbr: "NGA",
    awayAbbr: "GHA",
    kickoff: daysFromNow(5),
    odds: { home: 2.20, draw: 3.10, away: 3.40 },
  },
  {
    id: "m7",
    sport: "football",
    league: "FIFA World Cup",
    homeTeam: "Senegal",
    awayTeam: "Cameroon",
    homeAbbr: "SEN",
    awayAbbr: "CMR",
    kickoff: daysFromNow(6),
    odds: { home: 2.50, draw: 3.00, away: 2.90 },
  },
  {
    id: "m8",
    sport: "football",
    league: "J League",
    homeTeam: "FC Tokyo",
    awayTeam: "Cerezo Osaka",
    homeAbbr: "TOK",
    awayAbbr: "CER",
    kickoff: hoursFromNow(3),
    odds: { home: 1.85, draw: 3.60, away: 3.80 },
  },
  {
    id: "live1",
    sport: "football",
    league: "Premier League",
    homeTeam: "Manchester United",
    awayTeam: "Tottenham",
    homeAbbr: "MUN",
    awayAbbr: "TOT",
    kickoff: hoursFromNow(-1),
    isLive: true,
    liveMinute: 67,
    homeScore: 1,
    awayScore: 1,
    odds: { home: 2.40, draw: 2.80, away: 3.10 },
  },
  {
    id: "live2",
    sport: "football",
    league: "La Liga",
    homeTeam: "Atletico Madrid",
    awayTeam: "Sevilla",
    homeAbbr: "ATM",
    awayAbbr: "SEV",
    kickoff: hoursFromNow(-0.5),
    isLive: true,
    liveMinute: 34,
    homeScore: 2,
    awayScore: 0,
    odds: { home: 1.30, draw: 5.00, away: 9.00 },
  },
  {
    id: "q1",
    sport: "football",
    league: "UEFA Champions League",
    homeTeam: "Benfica",
    awayTeam: "Nice",
    homeAbbr: "BEN",
    awayAbbr: "NIC",
    kickoff: hoursFromNow(5),
    isQualifier: true,
    legInfo: "2nd Leg",
    aggregateScore: "1-1",
    odds: { home: 1.75, draw: 3.60, away: 4.50 },
  },
  {
    id: "q2",
    sport: "football",
    league: "CAF World Cup Qualifiers",
    homeTeam: "Ghana",
    awayTeam: "Angola",
    homeAbbr: "GHA",
    awayAbbr: "ANG",
    kickoff: hoursFromNow(7),
    isQualifier: true,
    legInfo: "1st Leg",
    odds: { home: 1.55, draw: 3.80, away: 5.50 },
  },
  {
    id: "b1",
    sport: "basketball",
    league: "NBA",
    homeTeam: "Los Angeles Lakers",
    awayTeam: "Boston Celtics",
    homeAbbr: "LAL",
    awayAbbr: "BOS",
    kickoff: hoursFromNow(12),
    odds: { home: 1.90, draw: 0, away: 1.95 },
  },
  {
    id: "b2",
    sport: "basketball",
    league: "NBA",
    homeTeam: "Golden State Warriors",
    awayTeam: "Phoenix Suns",
    homeAbbr: "GSW",
    awayAbbr: "PHX",
    kickoff: hoursFromNow(14),
    odds: { home: 2.05, draw: 0, away: 1.80 },
  },
  {
    id: "bb1",
    sport: "baseball",
    league: "MLB",
    homeTeam: "New York Yankees",
    awayTeam: "Boston Red Sox",
    homeAbbr: "NYY",
    awayAbbr: "BOS",
    kickoff: hoursFromNow(16),
    odds: { home: 1.85, draw: 0, away: 1.95 },
  },
  {
    id: "hk1",
    sport: "hockey",
    league: "NHL",
    homeTeam: "Toronto Maple Leafs",
    awayTeam: "Montreal Canadiens",
    homeAbbr: "TOR",
    awayAbbr: "MTL",
    kickoff: hoursFromNow(18),
    odds: { home: 2.10, draw: 0, away: 1.75 },
  },
  {
    id: "eng2",
    sport: "football",
    league: "Championship",
    homeTeam: "Leeds United",
    awayTeam: "Sheffield United",
    homeAbbr: "LEE",
    awayAbbr: "SHU",
    kickoff: hoursFromNow(20),
    odds: { home: 2.00, draw: 3.30, away: 3.60 },
  },
  {
    id: "eng3",
    sport: "football",
    league: "League One",
    homeTeam: "Bolton Wanderers",
    awayTeam: "Derby County",
    homeAbbr: "BOL",
    awayAbbr: "DER",
    kickoff: hoursFromNow(22),
    odds: { home: 2.25, draw: 3.20, away: 3.10 },
  },
];

export function getTopMatches(limit = 6) {
  return MATCHES.filter((m) => !m.isLive && m.sport === "football").slice(0, limit);
}

export function getUpcomingMatches(sport?: string) {
  return MATCHES.filter((m) => {
    if (m.isLive) return false;
    if (sport && m.sport !== sport) return false;
    return true;
  });
}

export function getLiveMatches() {
  return MATCHES.filter((m) => m.isLive);
}

export function getMatchById(id: string) {
  return MATCHES.find((m) => m.id === id) ?? null;
}
