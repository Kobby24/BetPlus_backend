import {
  getManagedMatchRecord,
  type ManagerMatchStatus,
} from "./manager-matches-store";

/** Demo / seeded Full Time scores — home:away */
export const MATCH_FT_SCORES: Record<string, string> = {
  "m-leeds-arsenal": "0:4",
  "m-chelsea-westham": "0:3",
  "m-elche-barcelona": "2:1",
  "m-werder-bayern": "0:2",
  "m-wolfsburg-leipzig": "0:3",
  "m-hoffenheim-heidenheim": "2:0",
  /** User1 demo — all legs win */
  "m-hearts-kotoko": "2:0",
  "m-medeama-bibiani": "2:2",
  "m-arsenal-chelsea": "1:1",
};

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function getMatchFtScore(matchId: string): {
  home: number;
  away: number;
} {
  const managed = getManagedMatchRecord(matchId);
  if (managed && managed.status !== "not_started") {
    return { home: managed.homeScore, away: managed.awayScore };
  }

  const fixed = MATCH_FT_SCORES[matchId];
  if (fixed) {
    const [home, away] = fixed.split(":").map(Number);
    return { home, away };
  }
  const h = hash(matchId);
  return { home: (h % 3) + 1, away: ((h >> 3) % 3) + 1 };
}

export function getManagerStatusForMatch(
  matchId: string,
): ManagerMatchStatus | null {
  return getManagedMatchRecord(matchId)?.status ?? null;
}

export function formatFtScore(home: number, away: number): string {
  return `${home}:${away}`;
}
