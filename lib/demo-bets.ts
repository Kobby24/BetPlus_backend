import type { BetSelection } from "./types";
import type { PlacedBet } from "./bet-types";
import { cloneSelections } from "./bet-record";

export const DEMO_WIN_CODE = "BPDEM01";
export const DEMO_LOST_CODE = "BPDEM02";

function sel(
  id: string,
  matchId: string,
  home: string,
  away: string,
  label: string,
  odds: number,
  marketName: string,
  league: string,
): BetSelection {
  return {
    id,
    matchId,
    homeTeam: home,
    awayTeam: away,
    selection: id,
    selectionLabel: label,
    odds,
    league,
    marketId: marketName.toLowerCase().replace(/\s+/g, "-"),
    marketName,
  };
}

export function createDemoWonBet(userId: string): PlacedBet {
  const selections: BetSelection[] = [
    sel(
      "dw-1",
      "m-werder-bayern",
      "Werder Bremen",
      "Bayern Munich",
      "Away",
      1.32,
      "1X2 - 2UP",
      "Bundesliga",
    ),
    sel(
      "dw-2",
      "m-wolfsburg-leipzig",
      "VfL Wolfsburg",
      "RB Leipzig",
      "Away",
      1.32,
      "1X2 - 2UP",
      "Bundesliga",
    ),
    sel(
      "dw-3",
      "m-hoffenheim-heidenheim",
      "Hoffenheim",
      "FC Heidenheim",
      "Home",
      1.32,
      "1X2 - 2UP",
      "Bundesliga",
    ),
  ];

  const stake = 13;
  const totalOdds = 11.05;
  const bonus = 24.98;
  const potentialWin = Math.round((stake * totalOdds + bonus) * 100) / 100;

  return {
    id: "demo-bet-won",
    bookingCode: DEMO_WIN_CODE,
    ticketId: "864109",
    verifyCode: "GHE714ZASK10BF6JK",
    userId,
    selections,
    originalSelections: cloneSelections(selections),
    stake,
    totalOdds,
    potentialWin,
    bonus,
    status: "won",
    placedAt: "2026-02-14T11:35:00.000Z",
  };
}

export function createDemoLostBet(userId: string): PlacedBet {
  const selections: BetSelection[] = [
    sel(
      "dl-1",
      "m-leeds-arsenal",
      "Leeds United",
      "Arsenal",
      "Away",
      1.32,
      "1X2 - 1UP",
      "Premier League",
    ),
    sel(
      "dl-2",
      "m-chelsea-westham",
      "Chelsea",
      "West Ham",
      "Away",
      1.32,
      "1X2 - 2UP",
      "Premier League",
    ),
    sel(
      "dl-3",
      "m-elche-barcelona",
      "Elche CF",
      "Barcelona",
      "Away",
      1.32,
      "1X2 - 2UP",
      "La Liga",
    ),
  ];

  const stake = 6;
  const totalOdds = 12.22;

  return {
    id: "demo-bet-lost",
    bookingCode: DEMO_LOST_CODE,
    ticketId: "727029",
    verifyCode: "GHE629LOST10BF6JK",
    userId,
    selections,
    originalSelections: cloneSelections(selections),
    stake,
    totalOdds,
    potentialWin: Math.round(stake * totalOdds * 100) / 100,
    bonus: 0,
    status: "lost",
    placedAt: "2026-01-30T18:55:00.000Z",
  };
}

export function isDemoBetCode(code: string) {
  const c = code.toUpperCase();
  return c === DEMO_WIN_CODE || c === DEMO_LOST_CODE;
}
