import type { BettingMarket, Match } from "./types";
import {
  comboGrid,
  createCtx,
  doubleChance,
  europeanHandicap,
  asianHandicap,
  mkMarket,
  oneXTwo,
  ouLines,
  overUnder,
  r,
  teamOuLines,
  yesNo,
  type MarketCtx,
} from "./market-factories";

const MATCH_OU: Record<string, [number, number]> = {
  "0.5": [1.02, 12.0],
  "1.5": [1.19, 4.6],
  "2.5": [1.58, 2.35],
  "3.5": [2.45, 1.53],
  "4.5": [4.25, 1.21],
  "5.5": [7.75, 1.07],
};

const MATCH_OU_INT: Record<string, [number, number]> = {
  "1": [1.03, 11.0],
  "2": [1.26, 3.75],
  "3": [1.94, 1.84],
  "4": [3.6, 1.28],
  "5": [7.1, 1.09],
};

const TEAM_OU_HOME: Record<string, [number, number]> = {
  "0.5": [1.05, 8.4],
  "1.5": [1.31, 3.25],
  "2.5": [1.95, 1.79],
  "3.5": [3.4, 1.29],
  "4.5": [6.3, 1.1],
};

const TEAM_OU_AWAY: Record<string, [number, number]> = {
  "0.5": [2.25, 1.6],
  "1.5": [7.2, 1.08],
  "2.5": [19.0, 1.01],
};

const HALF1_OU: Record<string, [number, number]> = {
  "0.5": [1.28, 3.9],
  "1.5": [2.3, 1.65],
  "2.5": [5.25, 1.18],
  "1": [1.52, 2.6],
  "2": [4.1, 1.26],
  "3": [12.0, 1.05],
};

const HALF2_OU: Record<string, [number, number]> = {
  "0.5": [1.2, 4.8],
  "1.5": [1.91, 1.94],
  "2.5": [3.8, 1.28],
  "1": [1.33, 3.4],
  "2": [2.9, 1.44],
  "3": [7.7, 1.1],
};

function firstGoal(
  id: string,
  name: string,
  category: BettingMarket["category"],
  ctx: MarketCtx,
  odds: { home: number; none: number; away: number },
  extra?: BettingMarket["category"][],
) {
  return mkMarket(
    id,
    name,
    category,
    [
      { id: `${id}-h`, label: ctx.homeTeam, odds: odds.home },
      { id: `${id}-n`, label: "None", odds: odds.none },
      { id: `${id}-a`, label: ctx.awayTeam, odds: odds.away },
    ],
    extra,
  );
}

function minute1x2(
  id: string,
  endMin: number,
  ctx: MarketCtx,
  odds: { home: number; draw: number; away: number },
) {
  const start = endMin === 10 ? 1 : 1;
  const label =
    endMin === 10
      ? "10 minutes - 1X2 from 1 to 10"
      : `1X2 from 1 to ${endMin} minute`;
  return oneXTwo(`m1x2-${endMin}`, label, "minutes", ctx, odds);
}

function minuteOu(
  endMin: number,
  line: string,
  over: number,
  under: number,
) {
  return overUnder(
    `mou-${endMin}-${line.replace(".", "")}`,
    `Total Goals Over/Under from 1 to ${endMin} minute`,
    "minutes",
    line,
    over,
    under,
  );
}

function buildMain(ctx: MarketCtx): BettingMarket[] {
  const { home, draw, away } = ctx;
  return [
    oneXTwo("1x2", "1X2", "main", ctx, { home, draw, away }),
    oneXTwo("1x2-1up", "1X2 - 1UP", "main", ctx, {
      home: r(home * 0.92),
      draw,
      away: r(away * 0.28),
    }),
    oneXTwo("1x2-2up", "1X2 - 2UP", "main", ctx, {
      home: r(home * 0.99),
      draw,
      away: r(away * 0.89),
    }),
    oneXTwo("1x2-never-down", "1X2 - Never Down", "main", ctx, {
      home: r(home * 1.08),
      draw,
      away: r(away * 1.02),
    }),
    doubleChance("double-chance", "Double Chance", "main", ctx, {
      hd: r(1 / (1 / home + 1 / draw)),
      ha: r(1 / (1 / home + 1 / away)),
      da: r(1 / (1 / draw + 1 / away)),
    }),
    doubleChance("double-chance-1up", "Double Chance - 1UP", "main", ctx, {
      hd: r(1.03),
      ha: r(1.15),
      da: r(2.77),
    }),
    mkMarket("dnb", "Draw No Bet", "main", [
      { id: "dnb-h", label: ctx.homeTeam, odds: r(home * 0.87) },
      { id: "dnb-a", label: ctx.awayTeam, odds: r(away * 0.6) },
    ]),
    mkMarket("home-no-bet", "Home No Bet", "main", [
      { id: "hnb-d", label: "Draw", odds: r(draw * 0.18) },
      { id: "hnb-a", label: ctx.awayTeam, odds: r(away * 0.17) },
    ]),
    mkMarket("away-no-bet", "Away No Bet", "main", [
      { id: "anb-h", label: ctx.homeTeam, odds: r(home * 0.92) },
      { id: "anb-d", label: "Draw", odds: r(draw * 0.7) },
    ]),
    ...ouLines("ou", "Over/Under", "main", MATCH_OU, ["goals"]),
    ...ouLines("ou-int", "Over/Under", "goals", MATCH_OU_INT),
    overUnder("ou-early-15", "Over/Under - Early Goals", "goals", "1.5", 1.17, 1.0),
    overUnder("ou-early-25", "Over/Under - Early Goals", "goals", "2.5", 1.53, 1.0),
    overUnder("ou-early-35", "Over/Under - Early Goals", "goals", "3.5", 2.28, 1.0),
    firstGoal("first-goal", "1st Goal", "main", ctx, {
      home: r(home * 0.98),
      none: 16.0,
      away: r(away * 0.27),
    }, ["goals"]),
    europeanHandicap("hcp-01", "Handicap 0:1", "0:1", "main", ctx, {
      home: 1.57,
      draw: 4.1,
      away: 4.9,
    }, ["goals"]),
    europeanHandicap("hcp-02", "Handicap 0:2", "0:2", "main", ctx, {
      home: 2.5,
      draw: 4.0,
      away: 2.35,
    }, ["goals"]),
    europeanHandicap("hcp-03", "Handicap 0:3", "0:3", "main", ctx, {
      home: 4.6,
      draw: 5.0,
      away: 1.51,
    }, ["goals"]),
    europeanHandicap("hcp-04", "Handicap 0:4", "0:4", "main", ctx, {
      home: 9.4,
      draw: 7.6,
      away: 1.19,
    }, ["goals"]),
    europeanHandicap("hcp-05", "Handicap 0:5", "0:5", "main", ctx, {
      home: 19.0,
      draw: 12.0,
      away: 1.06,
    }, ["goals"]),
    europeanHandicap("hcp-06", "Handicap 0:6", "0:6", "main", ctx, {
      home: 32.0,
      draw: 16.5,
      away: 1.01,
    }, ["goals"]),
    europeanHandicap("hcp-10", "Handicap 1:0", "1:0", "main", ctx, {
      home: r(home * 0.86),
      draw: 11.5,
      away: r(away * 2.67),
    }, ["goals"]),
    asianHandicap("ah-35", "Asian Handicap -3.5", "-3.5", "main", { home: 4.3, away: 1.19 }, ["goals"]),
    asianHandicap("ah-25", "Asian Handicap -2.5", "-2.5", "main", { home: 2.45, away: 1.51 }, ["goals"]),
    asianHandicap("ah-15", "Asian Handicap -1.5", "-1.5", "main", { home: 1.57, away: 2.3 }, ["goals"]),
    asianHandicap("ah-05", "Asian Handicap -0.5", "-0.5", "main", {
      home: r(home * 0.98),
      away: r(away * 0.28),
    }, ["goals"]),
    ...teamOuLines("team-ou-h", ctx.homeTeam, "teams", TEAM_OU_HOME, ["main", "goals"]),
    ...teamOuLines("team-ou-a", ctx.awayTeam, "teams", TEAM_OU_AWAY, ["main", "goals"]),
  ];
}

function buildGoals(ctx: MarketCtx): BettingMarket[] {
  const { home, draw, away, homeTeam, awayTeam, homeAbbr, awayAbbr } = ctx;
  return [
    yesNo("gg-ng", "GG/NG", "goals", 2.5, 1.55, ["main"]),
    yesNo("gg-ng-2plus", "GG/NG 2+", "goals", 8.23, 1.04),
    yesNo("any-score-row-2", "Any Team To Score 2 or More Goals in a Row", "goals", 1.36, 3.2),
    yesNo("any-score-row-3", "Any Team To Score 3 or More Goals in a Row", "goals", 2.28, 1.64),
    yesNo("home-score-row-2", "Home Team To Score 2 or More Goals in a Row", "goals", 1.41, 2.94),
    yesNo("home-score-row-3", "Home Team To Score 3 or More Goals in a Row", "goals", 2.31, 1.62),
    yesNo("away-score-row-2", "Away Team To Score 2 or More Goals in a Row", "goals", 11.75, 1.04),
    yesNo("away-score-row-3", "Away Team To Score 3 or More Goals in a Row", "goals", 19.74, 1.01),
    yesNo("any-lead-1", "Any Team to lead by 1 Goal at any time", "goals", 1.02, 10.91),
    yesNo("any-lead-2", "Any Team to lead by 2 Goals at any time", "goals", 1.43, 2.7),
    yesNo("any-lead-3", "Any Team to lead by 3 Goals at any time", "goals", 2.31, 1.57),
    yesNo("home-lead-1", "Home Team to lead by 1 Goal at any time", "goals", 1.11, 5.9),
    yesNo("home-lead-2", "Home Team to lead by 2 Goals at any time", "goals", 1.48, 2.53),
    yesNo("home-lead-3", "Home Team to lead by 3 Goals at any time", "goals", 2.33, 1.56),
    yesNo("away-lead-1", "Away Team to lead by 1 Goal at any time", "goals", 4.62, 1.17),
    yesNo("away-lead-2", "Away Team to lead by 2 Goals at any time", "goals", 12.66, 1.01),
    yesNo("away-lead-3", "Away Team to lead by 3 Goals at any time", "goals", 14.25, 1.01),
    mkMarket("goal-bounds", "Goal Bounds", "goals", [
      { id: "gb-01", label: "0–1", odds: 4.6 },
      { id: "gb-23", label: "2–3", odds: 2.05 },
      { id: "gb-45", label: "4–5", odds: 4.5 },
      { id: "gb-6p", label: "6+", odds: 12.0 },
    ]),
    mkMarket("goal-bounds-home", "Goal Bounds - Home", "goals", [
      { id: "gbh-0", label: "0", odds: 11.0 },
      { id: "gbh-1", label: "1", odds: 4.5 },
      { id: "gbh-2", label: "2", odds: 3.4 },
      { id: "gbh-3p", label: "3+", odds: 1.91 },
    ], ["teams"]),
    mkMarket("goal-bounds-away", "Goal Bounds - Away", "goals", [
      { id: "gba-0", label: "0", odds: 1.55 },
      { id: "gba-1", label: "1", odds: 2.75 },
      { id: "gba-2", label: "2", odds: 9.8 },
      { id: "gba-3p", label: "3+", odds: 47.0 },
    ], ["teams"]),
    mkMarket("excluded-goals", "Excluded Number of Goals", "goals", [
      { id: "exg-0", label: "0", odds: 11.0 },
      { id: "exg-1", label: "1", odds: 4.5 },
      { id: "exg-2", label: "2", odds: 3.2 },
      { id: "exg-3", label: "3", odds: 4.0 },
      { id: "exg-4", label: "4", odds: 6.5 },
    ]),
    mkMarket("excluded-goals-home", "Excluded Number of Goals - Home", "goals", [
      { id: "exgh-0", label: "0", odds: 11.0 },
      { id: "exgh-1", label: "1", odds: 4.5 },
      { id: "exgh-2", label: "2", odds: 3.4 },
      { id: "exgh-3p", label: "3+", odds: 1.78 },
    ], ["teams"]),
    mkMarket("excluded-goals-away", "Excluded Number of Goals - Away", "goals", [
      { id: "exga-0", label: "0", odds: 2.22 },
      { id: "exga-1", label: "1", odds: 1.37 },
      { id: "exga-2", label: "2", odds: 1.05 },
      { id: "exga-3p", label: "3+", odds: 3.5 },
    ], ["teams"]),
    mkMarket("correct-score", "Correct Score", "goals", [
      { id: "cs-00", label: "0-0", odds: 11.0 },
      { id: "cs-10", label: "1-0", odds: 7.5 },
      { id: "cs-20", label: "2-0", odds: 8.5 },
      { id: "cs-21", label: "2-1", odds: 9.0 },
      { id: "cs-11", label: "1-1", odds: 6.2 },
      { id: "cs-01", label: "0-1", odds: 8.5 },
      { id: "cs-02", label: "0-2", odds: 12.0 },
      { id: "cs-22", label: "2-2", odds: 14.0 },
      { id: "cs-30", label: "3-0", odds: 12.0 },
      { id: "cs-03", label: "0-3", odds: 35.0 },
    ], ["match"]),
    mkMarket("ht-ft", "Half Time/Full Time", "goals", [
      { id: "hh", label: "Home / Home", odds: 3.8 },
      { id: "hd", label: "Home / Draw", odds: 15.0 },
      { id: "ha", label: "Home / Away", odds: 81.0 },
      { id: "dh", label: "Draw / Home", odds: 5.5 },
      { id: "dd", label: "Draw / Draw", odds: 5.0 },
      { id: "da", label: "Draw / Away", odds: 17.0 },
      { id: "ah", label: "Away / Home", odds: 50.0 },
      { id: "ad", label: "Away / Draw", odds: 17.0 },
      { id: "aa", label: "Away / Away", odds: 4.5 },
    ], ["match", "combo"]),
    mkMarket("ht-ft-cs", "Half Time/Full Time Correct Score", "goals", [
      { id: "htcs-00-10", label: "0-0 / 1-0", odds: 12.0 },
      { id: "htcs-00-20", label: "0-0 / 2-0", odds: 14.0 },
      { id: "htcs-10-21", label: "1-0 / 2-1", odds: 18.0 },
      { id: "htcs-00-11", label: "0-0 / 1-1", odds: 10.0 },
    ], ["match"]),
    yesNo("both-halves-over-15", "Both Halves Over 1.5", "goals", 4.2, 1.23, ["half"]),
    yesNo("both-halves-under-15", "Both Halves Under 1.5", "goals", 3.1, 1.37, ["half"]),
    mkMarket("half-gg-ng", "1st/2nd Half GG/NG", "goals", [
      { id: "hhgg-nn", label: "No / No", odds: 1.34 },
      { id: "hhgg-yn", label: "Yes / No", odds: 6.8 },
      { id: "hhgg-yy", label: "Yes / Yes", odds: 29.0 },
      { id: "hhgg-ny", label: "No / Yes", odds: 5.1 },
    ], ["half"]),
    yesNo("home-score-both-halves", "Home Team to Score In Both Halves", "goals", 1.77, 1.91, ["teams"]),
    yesNo("away-score-both-halves", "Away Team to Score In Both Halves", "goals", 8.75, 1.02, ["teams"]),
    mkMarket("odd-even", "Odd/Even", "goals", [
      { id: "oe-o", label: "Odd", odds: 1.89 },
      { id: "oe-e", label: "Even", odds: 1.92 },
    ], ["match"]),
    mkMarket("odd-even-home", "Home Team Odd/Even", "goals", [
      { id: "oeh-o", label: "Odd", odds: 1.92 },
      { id: "oeh-e", label: "Even", odds: 1.89 },
    ], ["teams"]),
    mkMarket("odd-even-away", "Away Team Odd/Even", "goals", [
      { id: "oea-o", label: "Odd", odds: 2.85 },
      { id: "oea-e", label: "Even", odds: 1.43 },
    ], ["teams"]),
    firstGoal("last-goal", "Last Goal", "goals", ctx, {
      home: 1.21,
      none: 18.5,
      away: 5.2,
    }),
    mkMarket("winning-margin", "Winning Margin", "goals", [
      { id: "wm-h1", label: `${homeAbbr} by 1`, odds: 3.5 },
      { id: "wm-h2", label: `${homeAbbr} by 2+`, odds: 5.0 },
      { id: "wm-d", label: "Draw", odds: draw },
      { id: "wm-a1", label: `${awayAbbr} by 1`, odds: 4.0 },
      { id: "wm-a2", label: `${awayAbbr} by 2+`, odds: 6.5 },
    ], ["match"]),
    mkMarket("exact-goals", "Exact Goals", "goals", [
      { id: "eg-0", label: "0", odds: 11.0 },
      { id: "eg-1", label: "1", odds: 4.5 },
      { id: "eg-2", label: "2", odds: 3.2 },
      { id: "eg-3", label: "3", odds: 4.0 },
      { id: "eg-4", label: "4", odds: 6.5 },
      { id: "eg-5+", label: "5+", odds: 9.0 },
    ]),
    mkMarket("home-team-goals", "Home Team Goals", "goals", [
      { id: "htg-0", label: "0", odds: 11.0 },
      { id: "htg-1", label: "1", odds: 4.5 },
      { id: "htg-2", label: "2", odds: 3.4 },
      { id: "htg-3p", label: "3+", odds: 1.91 },
    ], ["teams"]),
    mkMarket("away-team-goals", "Away Team Goals", "goals", [
      { id: "atg-0", label: "0", odds: 1.55 },
      { id: "atg-1", label: "1", odds: 2.75 },
      { id: "atg-2", label: "2", odds: 9.8 },
      { id: "atg-3p", label: "3+", odds: 47.0 },
    ], ["teams"]),
    mkMarket("goal-range", "Goal Range", "goals", [
      { id: "gr-01", label: "0-1", odds: 4.6 },
      { id: "gr-23", label: "2-3", odds: 2.05 },
      { id: "gr-46", label: "4-6", odds: 2.6 },
      { id: "gr-7p", label: "7+", odds: 21.0 },
    ]),
    mkMarket("teams-to-score", "Teams to Score", "goals", [
      { id: "tts-n", label: "None", odds: 18.0 },
      { id: "tts-h", label: "Only Home", odds: 1.66 },
      { id: "tts-a", label: "Only Away", odds: 25.0 },
      { id: "tts-b", label: "Both teams", odds: 2.3 },
    ], ["teams"]),
    yesNo("clean-sheet-home", "Home Team Clean Sheet", "goals", 1.6, 2.25, ["teams"]),
    yesNo("clean-sheet-away", "Away Team Clean Sheet", "goals", 8.4, 1.05, ["teams"]),
    yesNo("win-both-halves-h", "Home Team to Win Both Halves", "goals", 2.35, 1.6, ["half"]),
    yesNo("win-either-half-h", "Home Team to Win Either Half", "goals", 1.1, 5.3, ["half"]),
    yesNo("win-either-half-a", "Away Team to Win Either Half", "goals", 4.8, 1.12, ["half"]),
    yesNo("win-nil-h", "Home Team to Win to Nil", "goals", 1.75, 2.1, ["teams"]),
    yesNo("win-nil-a", "Away Team to Win to Nil", "goals", 15.5, 1.02, ["teams"]),
    mkMarket("high-scoring-half", "Highest Scoring Half", "goals", [
      { id: "hsh-1", label: "1st half", odds: 2.9 },
      { id: "hsh-2", label: "2nd half", odds: 2.15 },
      { id: "hsh-e", label: "Equal", odds: 3.9 },
    ], ["half"]),
    mkMarket("high-scoring-half-h", "Home Team Highest Scoring Half", "goals", [
      { id: "hshh-1", label: "1st half", odds: 2.9 },
      { id: "hshh-2", label: "2nd half", odds: 2.3 },
      { id: "hshh-e", label: "Equal", odds: 3.5 },
    ], ["teams"]),
    mkMarket("high-scoring-half-a", "Away Team Highest Scoring Half", "goals", [
      { id: "hsha-1", label: "1st half", odds: 5.5 },
      { id: "hsha-2", label: "2nd half", odds: 4.4 },
      { id: "hsha-e", label: "Equal", odds: 1.51 },
    ], ["teams"]),
    yesNo("home-score-yesno", "Home Team To Score Yes/No", "goals", 1.05, 9.0, ["teams"]),
    yesNo("away-score-yesno", "Away Team To Score Yes/No", "goals", 2.5, 1.51, ["teams"]),
    yesNo("btts-both-halves", "Both Teams to Score in Both Halves Yes/No", "goals", 17.0, 1.01),
    yesNo("no-draw-btts", "No Draw Both Teams To Score Yes/No", "goals", 3.35, 1.31),
  ];
}

function buildFirstHalf(ctx: MarketCtx): BettingMarket[] {
  const { home, draw, away, homeTeam, awayTeam } = ctx;
  const prefix = "1h";
  return [
    oneXTwo(`${prefix}-1x2`, "1st Half - 1X2", "half", ctx, {
      home: r(home * 1.29),
      draw: r(draw * 0.39),
      away: r(away * 0.73),
    }),
    ...ouLines(`${prefix}-ou`, "1st Half - Over/Under", "half", HALF1_OU),
    doubleChance(`${prefix}-dc`, "1st Half - Double Chance", "half", ctx, {
      hd: 1.06,
      ha: 1.36,
      da: 2.3,
    }),
    firstGoal(`${prefix}-1st-goal`, "1st Half - 1st Goal", "half", ctx, {
      home: 1.5,
      none: 3.8,
      away: 7.0,
    }),
    europeanHandicap(`${prefix}-hcp-01`, "1st Half - Handicap", "0:1", "half", ctx, {
      home: 3.25,
      draw: 2.8,
      away: 2.45,
    }),
    europeanHandicap(`${prefix}-hcp-02`, "1st Half - Handicap", "0:2", "half", ctx, {
      home: 8.9,
      draw: 4.75,
      away: 1.34,
    }),
    europeanHandicap(`${prefix}-hcp-10`, "1st Half - Handicap", "1:0", "half", ctx, {
      home: 1.05,
      draw: 9.6,
      away: 77.0,
    }),
    asianHandicap(`${prefix}-ah-15`, "1st Half - Asian Handicap", "-1.5", "half", {
      home: 3.25,
      away: 1.35,
    }),
    asianHandicap(`${prefix}-ah-05`, "1st Half - Asian Handicap", "-0.5", "half", {
      home: 1.56,
      away: 2.45,
    }),
    ...teamOuLines(`${prefix}-team-h`, `1st half - ${homeTeam}`, "half", {
      "0.5": [1.37, 2.95],
      "1.5": [2.75, 1.42],
      "2.5": [6.4, 1.09],
    }),
    ...teamOuLines(`${prefix}-team-a`, `1st half - ${awayTeam}`, "half", {
      "0.5": [4.0, 1.22],
    }),
    yesNo(`${prefix}-gg-ng`, "1st Half - GG/NG", "half", 5.8, 1.14),
    mkMarket(`${prefix}-dnb`, "1st Half - Draw No Bet", "half", [
      { id: `${prefix}-dnb-h`, label: homeTeam, odds: 1.09 },
      { id: `${prefix}-dnb-a`, label: awayTeam, odds: 7.4 },
    ]),
    mkMarket(`${prefix}-goal-bounds`, "Goal Bounds - 1st Half", "half", [
      { id: `${prefix}-gb-0`, label: "0", odds: 3.9 },
      { id: `${prefix}-gb-1`, label: "1", odds: 2.7 },
      { id: `${prefix}-gb-2p`, label: "2+", odds: 2.5 },
    ]),
    mkMarket(`${prefix}-excluded`, "Excluded Number of Goals - First Half", "half", [
      { id: `${prefix}-ex-0`, label: "0", odds: 1.25 },
      { id: `${prefix}-ex-1`, label: "1", odds: 1.45 },
      { id: `${prefix}-ex-2`, label: "2", odds: 1.26 },
      { id: `${prefix}-ex-3p`, label: "3+", odds: 1.15 },
    ]),
    mkMarket(`${prefix}-cs`, "1st Half - Correct Score", "half", [
      { id: `${prefix}-cs-00`, label: "0-0", odds: 3.2 },
      { id: `${prefix}-cs-10`, label: "1-0", odds: 4.5 },
      { id: `${prefix}-cs-01`, label: "0-1", odds: 5.5 },
      { id: `${prefix}-cs-11`, label: "1-1", odds: 7.0 },
      { id: `${prefix}-cs-20`, label: "2-0", odds: 8.0 },
    ]),
    mkMarket(`${prefix}-exact`, "1st Half - Exact Goals", "half", [
      { id: `${prefix}-eg-0`, label: "0", odds: 3.9 },
      { id: `${prefix}-eg-1`, label: "1", odds: 2.7 },
      { id: `${prefix}-eg-2`, label: "2", odds: 3.75 },
      { id: `${prefix}-eg-3p`, label: "3+", odds: 5.4 },
    ]),
    yesNo(`${prefix}-cs-h`, "1st Half - Home Team Clean Sheet", "half", 1.22, 4.0),
    yesNo(`${prefix}-cs-a`, "1st Half - Away Team Clean Sheet", "half", 2.95, 1.37),
    comboGrid(
      `${prefix}-1x2-gg`,
      "1st Half - 1X2 & GG/NG",
      "half",
      ["Home", "Draw", "Away"],
      ["Yes", "No"],
      [
        [12.5, 1.63],
        [11.0, 3.5],
        [88.0, 12.0],
      ],
      ["combo"],
    ),
    comboGrid(
      `${prefix}-1x2-ou15`,
      "1st Half - 1X2 & Over/Under 1.5",
      "half",
      ["Home", "Draw", "Away"],
      ["Under 1.5", "Over 1.5"],
      [
        [3.0, 2.7],
        [3.6, 11.5],
        [14.5, 50.0],
      ],
      ["combo"],
    ),
    mkMarket(`${prefix}-multigoals`, "1st Half - Multigoals", "half", [
      { id: `${prefix}-mg-01`, label: "0-1", odds: 1.25 },
      { id: `${prefix}-mg-2`, label: "2", odds: 3.75 },
      { id: `${prefix}-mg-3p`, label: "3+", odds: 5.4 },
    ]),
    yesNo(`${prefix}-ht-home-score`, "Half-time Home Team To Score Yes/No", "half", 1.39, 2.95),
    yesNo(`${prefix}-ht-away-score`, "Half-time Away Team to Score Yes/No", "half", 4.75, 1.18),
    yesNo(`${prefix}-win-nil-h`, "1st Half Home Team to Win to Nil", "half", 1.7, 2.15),
    yesNo(`${prefix}-win-nil-a`, "1st Half Away Team to Win to Nil", "half", 11.0, 1.04),
    mkMarket(`${prefix}-odd-even`, "1st Half - Odd/Even", "half", [
      { id: `${prefix}-oe-o`, label: "Odd", odds: 2.0 },
      { id: `${prefix}-oe-e`, label: "Even", odds: 1.82 },
    ]),
    mkMarket(`${prefix}-oe-home`, "Half-time Home Team Total Goals Odd or Even", "half", [
      { id: `${prefix}-oeh-e`, label: "Even", odds: 1.75 },
      { id: `${prefix}-oeh-o`, label: "Odd", odds: 2.1 },
    ]),
    mkMarket(`${prefix}-oe-away`, "Half-time Away Team Total Goals Odd or Even", "half", [
      { id: `${prefix}-oea-e`, label: "Even", odds: 1.17 },
      { id: `${prefix}-oea-o`, label: "Odd", odds: 5.2 },
    ]),
  ];
}

function buildSecondHalf(ctx: MarketCtx): BettingMarket[] {
  const { home, draw, away, homeTeam, awayTeam } = ctx;
  const prefix = "2h";
  return [
    oneXTwo(`${prefix}-1x2`, "2nd Half - 1X2", "half", ctx, {
      home: r(home * 1.22),
      draw: r(draw * 0.44),
      away: r(away * 0.67),
    }),
    ...ouLines(`${prefix}-ou`, "2nd Half - Over/Under", "half", HALF2_OU),
    doubleChance(`${prefix}-dc`, "2nd Half - Double Chance", "half", ctx, {
      hd: 1.07,
      ha: 1.29,
      da: 2.5,
    }),
    firstGoal(`${prefix}-1st-goal`, "2nd Half - 1st Goal", "half", ctx, {
      home: 1.42,
      none: 4.8,
      away: 6.25,
    }),
    europeanHandicap(`${prefix}-hcp-01`, "2nd Half - Handicap 0:1", "0:1", "half", ctx, {
      home: 2.7,
      draw: 3.0,
      away: 2.7,
    }),
    europeanHandicap(`${prefix}-hcp-02`, "2nd Half - Handicap 0:2", "0:2", "half", ctx, {
      home: 6.4,
      draw: 4.4,
      away: 1.46,
    }),
    europeanHandicap(`${prefix}-hcp-10`, "2nd Half - Handicap 1:0", "1:0", "half", ctx, {
      home: 1.06,
      draw: 9.6,
      away: 55.0,
    }),
    asianHandicap(`${prefix}-ah-15`, "2nd Half - Asian Handicap", "-1.5", "half", {
      home: 2.7,
      away: 1.47,
    }),
    asianHandicap(`${prefix}-ah-05`, "2nd Half - Asian Handicap", "-0.5", "half", {
      home: 1.48,
      away: 2.7,
    }),
    ...teamOuLines(`${prefix}-team-h`, `2nd Half - ${homeTeam}`, "half", {
      "0.5": [1.28, 3.5],
      "1.5": [2.25, 1.59],
      "2.5": [4.9, 1.16],
    }),
    ...teamOuLines(`${prefix}-team-a`, `2nd Half - ${awayTeam}`, "half", {
      "0.5": [3.4, 1.28],
      "1.5": [11.5, 1.02],
    }),
    yesNo(`${prefix}-gg-ng`, "2nd Half - GG/NG", "half", 4.7, 1.19),
    mkMarket(`${prefix}-dnb`, "2nd Half - Draw No Bet", "half", [
      { id: `${prefix}-dnb-h`, label: homeTeam, odds: 1.1 },
      { id: `${prefix}-dnb-a`, label: awayTeam, odds: 7.3 },
    ]),
    mkMarket(`${prefix}-cs`, "2nd Half - Correct Score", "half", [
      { id: `${prefix}-cs-00`, label: "0-0", odds: 4.9 },
      { id: `${prefix}-cs-10`, label: "1-0", odds: 5.0 },
      { id: `${prefix}-cs-01`, label: "0-1", odds: 8.0 },
      { id: `${prefix}-cs-11`, label: "1-1", odds: 7.5 },
    ]),
    mkMarket(`${prefix}-exact`, "2nd Half - Exact Goals", "half", [
      { id: `${prefix}-eg-0`, label: "0", odds: 4.9 },
      { id: `${prefix}-eg-1`, label: "1", odds: 3.0 },
      { id: `${prefix}-eg-2p`, label: "2+", odds: 1.88 },
    ]),
    yesNo(`${prefix}-cs-h`, "2nd Half - Home Team Clean Sheet", "half", 1.28, 3.4),
    yesNo(`${prefix}-cs-a`, "2nd Half - Away Team Clean Sheet", "half", 3.5, 1.28),
    mkMarket(`${prefix}-multigoals`, "2nd Half - Multigoals", "half", [
      { id: `${prefix}-mg-01`, label: "0-1", odds: 1.3 },
      { id: `${prefix}-mg-2`, label: "2", odds: 3.5 },
      { id: `${prefix}-mg-3p`, label: "3+", odds: 4.8 },
    ]),
    yesNo(`${prefix}-home-score`, "2nd Half Home Team to Score Yes/No", "half", 1.25, 3.85),
    yesNo(`${prefix}-away-score`, "2nd Half Away Team to Score Yes/No", "half", 3.9, 1.24),
    yesNo(`${prefix}-win-nil-h`, "2nd Half Home Team to Win to Nil", "half", 1.6, 2.35),
    yesNo(`${prefix}-win-nil-a`, "2nd Half Away Team to Win to Nil", "half", 13.0, 1.03),
    mkMarket(`${prefix}-odd-even`, "2nd Half - Odd/Even", "half", [
      { id: `${prefix}-oe-o`, label: "Odd", odds: 1.97 },
      { id: `${prefix}-oe-e`, label: "Even", odds: 1.84 },
    ]),
    mkMarket(`${prefix}-oe-home`, "2nd Half Home Team Total Goals Odd or Even", "half", [
      { id: `${prefix}-oeh-e`, label: "Even", odds: 1.8 },
      { id: `${prefix}-oeh-o`, label: "Odd", odds: 2.0 },
    ]),
    mkMarket(`${prefix}-oe-away`, "2nd Half Away Team Total Goals Odd or Even", "half", [
      { id: `${prefix}-oea-e`, label: "Even", odds: 1.21 },
      { id: `${prefix}-oea-o`, label: "Odd", odds: 4.5 },
    ]),
    comboGrid(
      `${prefix}-1x2-ou15`,
      "2nd Half - 1X2 & Over/Under 1.5",
      "half",
      ["Home", "Draw", "Away"],
      ["Under 1.5", "Over 1.5"],
      [
        [3.4, 2.25],
        [4.6, 10.0],
        [14.5, 34.0],
      ],
      ["combo"],
    ),
    comboGrid(
      `${prefix}-1x2-gg`,
      "2nd Half - 1X2 & GG/NG",
      "half",
      ["Home", "Draw", "Away"],
      ["Yes", "No"],
      [
        [8.8, 1.62],
        [9.9, 4.4],
        [59.0, 12.0],
      ],
      ["combo"],
    ),
  ];
}

function buildMinutes(ctx: MarketCtx): BettingMarket[] {
  const minute1x2Data: [number, { home: number; draw: number; away: number }][] = [
    [5, { home: 6.75, draw: 1.12, away: 26.0 }],
    [10, { home: 4.4, draw: 1.22, away: 23.0 }],
    [15, { home: 3.1, draw: 1.42, away: 16.5 }],
    [20, { home: 2.55, draw: 1.6, away: 14.5 }],
    [25, { home: 2.2, draw: 1.79, away: 13.5 }],
    [30, { home: 1.95, draw: 2.0, away: 13.0 }],
    [35, { home: 1.78, draw: 2.25, away: 12.5 }],
    [40, { home: 1.66, draw: 2.45, away: 12.5 }],
    [50, { home: 1.44, draw: 3.2, away: 12.5 }],
    [55, { home: 1.39, draw: 3.4, away: 12.5 }],
    [60, { home: 1.33, draw: 3.8, away: 13.0 }],
    [65, { home: 1.3, draw: 4.1, away: 13.0 }],
    [70, { home: 1.26, draw: 4.5, away: 13.0 }],
    [75, { home: 1.23, draw: 4.9, away: 13.5 }],
    [80, { home: 1.21, draw: 5.3, away: 13.5 }],
    [85, { home: 1.19, draw: 5.7, away: 14.0 }],
  ];

  const minuteOuData: [number, [string, number, number][]][] = [
    [5, [["0.5", 6.0, 1.13], ["1.5", 19.0, 1.0]]],
    [10, [["0.5", 3.6, 1.28], ["1.5", 17.0, 1.01], ["2.5", 19.0, 1.0]]],
    [15, [["0.5", 2.7, 1.47], ["1.5", 11.0, 1.04], ["2.5", 19.0, 1.0]]],
    [20, [["0.5", 2.2, 1.67], ["1.5", 7.5, 1.09], ["2.5", 19.0, 1.0], ["3.5", 19.0, 1.0]]],
    [25, [["0.5", 1.86, 1.94], ["1.5", 5.5, 1.15], ["2.5", 17.0, 1.01], ["3.5", 19.0, 1.0]]],
    [30, [["0.5", 1.65, 2.25], ["1.5", 4.25, 1.23], ["2.5", 13.0, 1.03], ["3.5", 19.0, 1.0], ["4.5", 19.0, 1.0]]],
    [35, [["0.5", 1.52, 2.55], ["1.5", 3.4, 1.32], ["2.5", 9.0, 1.06], ["3.5", 19.0, 1.0], ["4.5", 19.0, 1.0]]],
    [40, [["0.5", 1.4, 2.95], ["1.5", 2.85, 1.43], ["2.5", 7.0, 1.1], ["3.5", 17.0, 1.01], ["4.5", 19.0, 1.0]]],
    [50, [["0.5", 1.23, 4.25], ["1.5", 2.05, 1.78], ["2.5", 4.25, 1.23], ["3.5", 9.0, 1.06], ["4.5", 17.0, 1.01], ["5.5", 19.0, 1.0]]],
    [55, [["0.5", 1.19, 4.75], ["1.5", 1.84, 1.96], ["2.5", 3.5, 1.3], ["3.5", 7.5, 1.09], ["4.5", 17.0, 1.01]]],
    [60, [["0.5", 1.15, 5.5], ["1.5", 1.7, 2.15], ["2.5", 3.05, 1.38], ["3.5", 6.25, 1.12], ["4.5", 13.0, 1.03]]],
    [65, [["0.5", 1.12, 6.25], ["1.5", 1.57, 2.4], ["2.5", 2.7, 1.47], ["3.5", 5.25, 1.16], ["4.5", 11.0, 1.04]]],
    [70, [["0.5", 1.1, 7.0], ["1.5", 1.48, 2.65], ["2.5", 2.4, 1.57], ["3.5", 4.6, 1.2], ["4.5", 9.0, 1.06]]],
    [75, [["0.5", 1.08, 8.0], ["1.5", 1.4, 2.95], ["2.5", 2.15, 1.7], ["3.5", 4.0, 1.25], ["4.5", 7.5, 1.09]]],
    [80, [["0.5", 1.06, 9.0], ["1.5", 1.34, 3.25], ["2.5", 1.96, 1.84], ["3.5", 3.4, 1.32], ["4.5", 6.25, 1.12], ["5.5", 11.0, 1.04]]],
    [85, [["1.5", 1.28, 3.6], ["2.5", 1.8, 2.0], ["3.5", 3.0, 1.39], ["4.5", 5.5, 1.15], ["5.5", 11.0, 1.04]]],
  ];

  const markets: BettingMarket[] = minute1x2Data.map(([min, odds]) =>
    minute1x2(`m1x2-${min}`, min, ctx, odds),
  );

  for (const [min, lines] of minuteOuData) {
    for (const [line, over, under] of lines) {
      markets.push(minuteOu(min, line, over, under));
    }
  }

  markets.push(
    mkMarket("1st-goal-10min", "When will the 1st goal be scored (10 min interval)", "minutes", [
      { id: "fg10-1", label: "1–10", odds: 3.6 },
      { id: "fg10-2", label: "11–20", odds: 4.5 },
      { id: "fg10-3", label: "21–30", odds: 5.0 },
      { id: "fg10-4", label: "31–40", odds: 5.5 },
      { id: "fg10-5", label: "41–50", odds: 6.0 },
      { id: "fg10-6", label: "51–60", odds: 6.5 },
      { id: "fg10-7", label: "61–70", odds: 7.0 },
      { id: "fg10-8", label: "71–80", odds: 7.5 },
      { id: "fg10-9", label: "81–90", odds: 4.0 },
      { id: "fg10-ng", label: "No Goal", odds: 11.0 },
    ], ["goals"]),
    mkMarket("1st-goal-15min", "When will the 1st goal be scored (15 min interval)", "minutes", [
      { id: "fg15-1", label: "1–15", odds: 3.5 },
      { id: "fg15-2", label: "16–30", odds: 4.0 },
      { id: "fg15-3", label: "31–45", odds: 4.2 },
      { id: "fg15-4", label: "46–60", odds: 4.5 },
      { id: "fg15-5", label: "61–75", odds: 5.0 },
      { id: "fg15-6", label: "76–90", odds: 3.8 },
      { id: "fg15-ng", label: "No Goal", odds: 11.0 },
    ], ["goals"]),
  );

  return markets;
}

function buildCombo(ctx: MarketCtx): BettingMarket[] {
  return [
    comboGrid(
      "1x2-ou15",
      "1X2 & Over/Under 1.5",
      "combo",
      ["Home", "Draw", "Away"],
      ["Under 1.5", "Over 1.5"],
      [
        [6.6, 1.31],
        [16.5, 9.4],
        [30.0, 23.0],
      ],
    ),
    comboGrid(
      "1x2-ou25",
      "1X2 & Over/Under 2.5",
      "combo",
      ["Home", "Draw", "Away"],
      ["Under 2.5", "Over 2.5"],
      [
        [3.2, 1.63],
        [7.9, 34.0],
        [26.0, 30.0],
      ],
    ),
    comboGrid(
      "1x2-ou35",
      "1X2 & Over/Under 3.5",
      "combo",
      ["Home", "Draw", "Away"],
      ["Under 3.5", "Over 3.5"],
      [
        [1.88, 2.5],
        [8.0, 35.0],
        [16.5, 94.0],
      ],
    ),
    comboGrid(
      "1x2-ou45",
      "1X2 & Over/Under 4.5",
      "combo",
      ["Home", "Draw", "Away"],
      ["Under 4.5", "Over 4.5"],
      [
        [1.46, 4.1],
        [6.5, 230.0],
        [15.0, 140.0],
      ],
    ),
    comboGrid(
      "1x2-gg",
      "1X2 & GG/NG",
      "combo",
      ["Home", "Draw", "Away"],
      ["Yes", "No"],
      [
        [3.1, 1.65],
        [10.0, 18.0],
        [31.0, 25.0],
      ],
    ),
    comboGrid(
      "ou25-gg",
      "Over/Under & GG/NG",
      "combo",
      ["Over 2.5", "Under 2.5"],
      ["Yes", "No"],
      [
        [2.7, 3.1],
        [14.0, 2.55],
      ],
    ),
    comboGrid(
      "1st-goal-1x2",
      "1st Goal & 1X2",
      "combo",
      ["Home goal", "Away goal"],
      ["Home", "Draw", "Away"],
      [
        [1.23, 17.0, 81.0],
        [9.5, 17.0, 14.0],
      ],
    ),
    ...["15", "25", "35", "45"].map((line) =>
      mkMarket(`htft-ou${line}`, `Halftime/Fulltime & Over/Under ${line === "15" ? "1.5" : line === "25" ? "2.5" : line === "35" ? "3.5" : "4.5"}`, "combo", [
        { id: `htft-ou${line}-hh`, label: "Home / Home", odds: 4.5 },
        { id: `htft-ou${line}-dd`, label: "Draw / Draw", odds: 6.0 },
        { id: `htft-ou${line}-aa`, label: "Away / Away", odds: 8.0 },
      ]),
    ),
    ...["05", "15", "25"].map((line) =>
      mkMarket(`htft-1h-ou${line}`, `Halftime/Fulltime & 1st Half Over/Under ${line === "05" ? "0.5" : line === "15" ? "1.5" : "2.5"}`, "combo", [
        { id: `htft-1h-${line}-hh`, label: "Home / Home", odds: 5.0 },
        { id: `htft-1h-${line}-dd`, label: "Draw / Draw", odds: 6.5 },
      ]),
    ),
    mkMarket("htft-exact", "Halftime/Fulltime & Exact Goals", "combo", [
      { id: "htft-eg-hh2", label: "Home/Home & 2 goals", odds: 8.0 },
      { id: "htft-eg-dd2", label: "Draw/Draw & 2 goals", odds: 12.0 },
    ]),
    comboGrid(
      "dc-ou15",
      "Double Chance & Over/Under 1.5",
      "combo",
      ["Home/Draw", "Home/Away", "Draw/Away"],
      ["Under 1.5", "Over 1.5"],
      [
        [4.7, 1.2],
        [5.3, 1.25],
        [10.5, 6.6],
      ],
    ),
    comboGrid(
      "dc-ou25",
      "Double Chance & Over/Under 2.5",
      "combo",
      ["Home/Draw", "Home/Away", "Draw/Away"],
      ["Under 2.5", "Over 2.5"],
      [
        [2.35, 1.57],
        [2.85, 1.56],
        [6.1, 16.0],
      ],
    ),
    comboGrid(
      "dc-ou35",
      "Double Chance & Over/Under 3.5",
      "combo",
      ["Home/Draw", "Home/Away", "Draw/Away"],
      ["Under 3.5", "Over 3.5"],
      [
        [1.58, 2.35],
        [1.72, 2.45],
        [5.4, 25.0],
      ],
    ),
    comboGrid(
      "dc-ou45",
      "Double Chance & Over/Under 4.5",
      "combo",
      ["Home/Draw", "Home/Away", "Draw/Away"],
      ["Under 4.5", "Over 4.5"],
      [
        [1.25, 4.0],
        [1.35, 3.9],
        [4.5, 85.0],
      ],
    ),
    comboGrid(
      "dc-gg",
      "Double Chance & GG/NG",
      "combo",
      ["Home/Draw", "Home/Away", "Draw/Away"],
      ["Yes", "No"],
      [
        [2.4, 1.54],
        [2.85, 1.57],
        [7.6, 10.5],
      ],
    ),
    comboGrid(
      "dc-1h-gg",
      "Double Chance & 1st Half GG/NG",
      "combo",
      ["Home/Draw", "Home/Away", "Draw/Away"],
      ["Yes", "No"],
      [
        [5.4, 1.16],
        [6.0, 1.22],
        [21.0, 4.9],
      ],
    ),
    comboGrid(
      "dc-2h-gg",
      "Double Chance & 2nd Half GG/NG",
      "combo",
      ["Home/Draw", "Home/Away", "Draw/Away"],
      ["Yes", "No"],
      [
        [4.4, 1.22],
        [4.9, 1.28],
        [17.0, 5.4],
      ],
    ),
    mkMarket("ht-dc-total", "Half-time Double Chance & Total Goals", "combo", [
      { id: "hdt-hd-u", label: "Home/Draw & Under 1.5", odds: 2.5 },
      { id: "hdt-ha-o", label: "Home/Away & Over 1.5", odds: 1.8 },
    ]),
    comboGrid(
      "1h-dc-gg",
      "1st Half - Double Chance & GG/NG",
      "half",
      ["Home/Draw", "Home/Away", "Draw/Away"],
      ["Yes", "No"],
      [
        [5.6, 1.2],
        [10.5, 1.45],
        [9.2, 2.7],
      ],
      ["combo"],
    ),
    mkMarket("2h-dc-total", "2nd Half Double Chance & Total Goals", "combo", [
      { id: "2hdt-hd-u", label: "Home/Draw & Under 1.5", odds: 2.8 },
      { id: "2hdt-ha-o", label: "Home/Away & Over 1.5", odds: 1.9 },
    ]),
    comboGrid(
      "2h-dc-gg",
      "2nd Half - Double Chance & GG/NG",
      "half",
      ["Home/Draw", "Home/Away", "Draw/Away"],
      ["Yes", "No"],
      [
        [4.6, 1.25],
        [7.4, 1.44],
        [8.2, 3.2],
      ],
      ["combo"],
    ),
    oneXTwo("1h-or-match", "1st Half Result or Match Result", "combo", ctx, {
      home: 1.1,
      draw: 1.97,
      away: 5.6,
    }),
    yesNo("home-or-ou25", "Home Team or Over 2.5", "combo", 1.1, 5.4),
    yesNo("home-or-u25", "Home Team or Under 2.5", "combo", 1.02, 9.0),
    yesNo("draw-or-ou25", "Draw or Over 2.5", "combo", 1.34, 2.9),
    yesNo("draw-or-u25", "Draw or Under 2.5", "combo", 2.15, 1.6),
    yesNo("away-or-ou25", "Away or Over 2.5", "combo", 1.48, 2.4),
    yesNo("away-or-u25", "Away or Under 2.5", "combo", 2.15, 1.61),
    yesNo("home-or-gg", "Home Team or GG", "combo", 1.05, 7.5),
    yesNo("draw-or-gg", "Draw or GG", "combo", 2.15, 1.61),
    yesNo("away-or-gg", "Away Team or GG", "combo", 2.2, 1.58),
    yesNo("home-or-cs", "Home Team or Any Clean Sheet", "combo", 1.07, 6.3),
    yesNo("draw-or-cs", "Draw or Any Clean Sheet", "combo", 1.34, 2.9),
    yesNo("away-or-cs", "Away Team or Any Clean Sheet", "combo", 1.45, 2.5),
    mkMarket("multigoals", "Multigoals", "combo", [
      { id: "mg-12", label: "1-2", odds: 2.0 },
      { id: "mg-23", label: "2-3", odds: 2.5 },
      { id: "mg-34", label: "3-4", odds: 4.0 },
      { id: "mg-4p", label: "4+", odds: 6.0 },
    ]),
    mkMarket("home-multigoals", "Home Multigoals", "combo", [
      { id: "hmg-1", label: "1", odds: 4.5 },
      { id: "hmg-2", label: "2", odds: 3.4 },
      { id: "hmg-3p", label: "3+", odds: 1.91 },
    ], ["teams"]),
    mkMarket("away-multigoals", "Away Multigoals", "combo", [
      { id: "amg-0", label: "0", odds: 1.55 },
      { id: "amg-1", label: "1", odds: 2.75 },
    ], ["teams"]),
    mkMarket("multiscores", "Multiscores", "combo", [
      { id: "ms-1h1", label: "1-0, 2-0, 2-1", odds: 3.5 },
      { id: "ms-1h2", label: "3-0, 3-1, 3-2", odds: 8.0 },
      { id: "ms-d", label: "Draw scores", odds: 6.0 },
    ]),
    mkMarket("correct-score-00", "Correct Score [0:0]", "combo", [
      { id: "cs00", label: "0-0", odds: 11.0 },
    ], ["match"]),
  ];
}

function buildMatchExtras(ctx: MarketCtx): BettingMarket[] {
  return [
    mkMarket("exact-score-full", "Exact Score", "match", [
      { id: "ecs-00", label: "0-0", odds: 11.0 },
      { id: "ecs-10", label: "1-0", odds: 7.5 },
      { id: "ecs-20", label: "2-0", odds: 8.5 },
      { id: "ecs-21", label: "2-1", odds: 9.0 },
      { id: "ecs-11", label: "1-1", odds: 6.2 },
      { id: "ecs-01", label: "0-1", odds: 8.5 },
      { id: "ecs-02", label: "0-2", odds: 12.0 },
      { id: "ecs-22", label: "2-2", odds: 14.0 },
    ]),
  ];
}

export function buildSportyBetCatalog(match: Match): BettingMarket[] {
  const ctx = createCtx(match);
  return [
    ...buildMain(ctx),
    ...buildGoals(ctx),
    ...buildFirstHalf(ctx),
    ...buildSecondHalf(ctx),
    ...buildMinutes(ctx),
    ...buildCombo(ctx),
    ...buildMatchExtras(ctx),
  ];
}

export function countCatalogMarkets(match: Match): number {
  return buildSportyBetCatalog(match).length;
}
