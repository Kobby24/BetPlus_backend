import type { BettingMarket, MarketCategory, MarketOutcome, Match } from "./types";

export function r(n: number) {
  return Math.round(n * 100) / 100;
}

export interface MarketCtx {
  match: Match;
  home: number;
  draw: number;
  away: number;
  homeTeam: string;
  awayTeam: string;
  homeAbbr: string;
  awayAbbr: string;
}

export function createCtx(match: Match): MarketCtx {
  const { home, draw, away } = match.odds;
  return {
    match,
    home,
    draw,
    away,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    homeAbbr: match.homeAbbr,
    awayAbbr: match.awayAbbr,
  };
}

export function mkMarket(
  id: string,
  name: string,
  category: MarketCategory,
  outcomes: MarketOutcome[],
  extraCategories?: MarketCategory[],
  opts?: Pick<BettingMarket, "layout" | "playerOddsKey">,
): BettingMarket {
  const cats = [category, ...(extraCategories ?? [])];
  return {
    id,
    name,
    category,
    categories: cats.length > 1 ? cats : undefined,
    outcomes,
    ...opts,
  };
}

export function yesNo(
  id: string,
  name: string,
  category: MarketCategory,
  yes: number,
  no: number,
  extra?: MarketCategory[],
) {
  return mkMarket(
    id,
    name,
    category,
    [
      { id: `${id}-y`, label: "Yes", odds: yes },
      { id: `${id}-n`, label: "No", odds: no },
    ],
    extra,
  );
}

export function overUnder(
  id: string,
  name: string,
  category: MarketCategory,
  line: string,
  over: number,
  under: number,
  extra?: MarketCategory[],
) {
  return mkMarket(
    id,
    name,
    category,
    [
      { id: `${id}-o`, label: `Over ${line}`, odds: over },
      { id: `${id}-u`, label: `Under ${line}`, odds: under },
    ],
    extra,
  );
}

export function oneXTwo(
  id: string,
  name: string,
  category: MarketCategory,
  ctx: MarketCtx,
  odds: { home: number; draw: number; away: number },
  extra?: MarketCategory[],
) {
  return mkMarket(
    id,
    name,
    category,
    [
      { id: `${id}-h`, label: ctx.homeTeam, odds: odds.home },
      { id: `${id}-d`, label: "Draw", odds: odds.draw },
      { id: `${id}-a`, label: ctx.awayTeam, odds: odds.away },
    ],
    extra,
  );
}

export function doubleChance(
  id: string,
  name: string,
  category: MarketCategory,
  ctx: MarketCtx,
  odds: { hd: number; ha: number; da: number },
  extra?: MarketCategory[],
) {
  return mkMarket(
    id,
    name,
    category,
    [
      { id: `${id}-hd`, label: "Home or Draw", odds: odds.hd },
      { id: `${id}-ha`, label: "Home or Away", odds: odds.ha },
      { id: `${id}-da`, label: "Draw or Away", odds: odds.da },
    ],
    extra,
  );
}

export function europeanHandicap(
  id: string,
  name: string,
  line: string,
  category: MarketCategory,
  ctx: MarketCtx,
  odds: { home: number; draw: number; away: number },
  extra?: MarketCategory[],
) {
  return mkMarket(
    id,
    name,
    category,
    [
      { id: `${id}-h`, label: `Home (${line})`, odds: odds.home },
      { id: `${id}-d`, label: `Draw (${line})`, odds: odds.draw },
      { id: `${id}-a`, label: `Away (${line})`, odds: odds.away },
    ],
    extra,
  );
}

export function asianHandicap(
  id: string,
  name: string,
  line: string,
  category: MarketCategory,
  odds: { home: number; away: number },
  extra?: MarketCategory[],
) {
  const awayLine = line.startsWith("-")
    ? `+${line.slice(1)}`
    : line.startsWith("+")
      ? `-${line.slice(1)}`
      : line;
  return mkMarket(
    id,
    name,
    category,
    [
      { id: `${id}-h`, label: `Home (${line})`, odds: odds.home },
      { id: `${id}-a`, label: `Away (${awayLine})`, odds: odds.away },
    ],
    extra,
  );
}

/** Flatten a row×col combo grid into selectable outcomes */
export function comboGrid(
  id: string,
  name: string,
  category: MarketCategory,
  rows: string[],
  cols: string[],
  odds: number[][],
  extra?: MarketCategory[],
) {
  const outcomes: MarketOutcome[] = [];
  rows.forEach((row, ri) => {
    cols.forEach((col, ci) => {
      outcomes.push({
        id: `${id}-r${ri}c${ci}`,
        label: `${row} / ${col}`,
        odds: odds[ri]?.[ci] ?? 2.0,
      });
    });
  });
  return mkMarket(id, name, category, outcomes, extra);
}

export function teamOuLines(
  prefix: string,
  teamName: string,
  category: MarketCategory,
  lines: Record<string, [number, number]>,
  extra?: MarketCategory[],
): BettingMarket[] {
  return Object.entries(lines).map(([line, [o, u]]) =>
    overUnder(`${prefix}-${line.replace(".", "")}`, `${teamName} Over/Under`, category, line, o, u, extra),
  );
}

export function ouLines(
  prefix: string,
  name: string,
  category: MarketCategory,
  lines: Record<string, [number, number]>,
  extra?: MarketCategory[],
): BettingMarket[] {
  return Object.entries(lines).map(([line, [o, u]]) =>
    overUnder(`${prefix}-${line.replace(".", "")}`, name, category, line, o, u, extra),
  );
}

export function scaleFromFavorite(ctx: MarketCtx, base: number, favBias = 1) {
  const fav = Math.min(ctx.home, ctx.away);
  const heavy = fav < 1.5;
  return r(base * (heavy ? favBias * 0.95 : 1));
}
