import { MATCHES, getMatchById } from "./mock-data";
import { logManagerAction } from "./manager-store";
import type { Match, Sport } from "./types";

/** Manager-controlled match state — separate from admin. */
export type ManagerMatchStatus = "not_started" | "won" | "lost" | "void";

export interface ManagedMatchRecord {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  sport: Sport;
  kickoff: string;
  status: ManagerMatchStatus;
  homeScore: number;
  awayScore: number;
  /** True when created by manager (not from catalog). */
  isManual: boolean;
  note?: string;
  updatedAt: string;
}

export interface ManagerMatchView extends ManagedMatchRecord {
  /** Catalog match id or manual id */
  source: "catalog" | "manual" | "bet_only";
  managed: boolean;
}

const STORAGE_KEY = "betplus_manager_matches";

function readRecords(): Record<string, ManagedMatchRecord> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, ManagedMatchRecord>) : {};
  } catch {
    return {};
  }
}

function writeRecords(records: Record<string, ManagedMatchRecord>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export function getManagedMatchRecord(
  matchId: string,
): ManagedMatchRecord | null {
  return readRecords()[matchId] ?? null;
}

export function getManagerMatchStatus(
  matchId: string,
): ManagerMatchStatus | null {
  return getManagedMatchRecord(matchId)?.status ?? null;
}

export function isMatchManagerControlled(matchId: string): boolean {
  return getManagedMatchRecord(matchId) !== null;
}

function catalogToRecord(match: Match): ManagedMatchRecord {
  return {
    matchId: match.id,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    league: match.league,
    sport: match.sport,
    kickoff: match.kickoff,
    status: "not_started",
    homeScore: match.homeScore ?? 0,
    awayScore: match.awayScore ?? 0,
    isManual: false,
    updatedAt: new Date().toISOString(),
  };
}

export function listManagerMatches(): ManagerMatchView[] {
  const records = readRecords();
  const seen = new Set<string>();
  const views: ManagerMatchView[] = [];

  for (const match of MATCHES) {
    seen.add(match.id);
    const managed = records[match.id];
    if (managed) {
      views.push({ ...managed, source: "catalog", managed: true });
    } else {
      views.push({
        ...catalogToRecord(match),
        source: "catalog",
        managed: false,
      });
    }
  }

  for (const record of Object.values(records)) {
    if (seen.has(record.matchId)) continue;
    views.push({ ...record, source: "manual", managed: true });
  }

  views.sort(
    (a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime(),
  );
  return views;
}

export function getManagerMatchView(matchId: string): ManagerMatchView | null {
  return listManagerMatches().find((m) => m.matchId === matchId) ?? null;
}

export function takeControlOfCatalogMatch(matchId: string): ManagedMatchRecord | null {
  const match = getMatchById(matchId);
  if (!match) return null;

  const records = readRecords();
  if (records[matchId]) return records[matchId];

  const record: ManagedMatchRecord = {
    ...catalogToRecord(match),
    updatedAt: new Date().toISOString(),
  };
  records[matchId] = record;
  writeRecords(records);
  logManagerAction("Take control", `${match.homeTeam} vs ${match.awayTeam}`, {
    matchId,
  });
  return record;
}

export function createManualMatch(input: {
  homeTeam: string;
  awayTeam: string;
  league: string;
  sport?: Sport;
  kickoff: string;
  note?: string;
}): ManagedMatchRecord {
  const records = readRecords();
  const matchId = `mgr-${crypto.randomUUID().slice(0, 8)}`;
  const record: ManagedMatchRecord = {
    matchId,
    homeTeam: input.homeTeam.trim(),
    awayTeam: input.awayTeam.trim(),
    league: input.league.trim() || "Manual League",
    sport: input.sport ?? "football",
    kickoff: input.kickoff,
    status: "not_started",
    homeScore: 0,
    awayScore: 0,
    isManual: true,
    note: input.note,
    updatedAt: new Date().toISOString(),
  };
  records[matchId] = record;
  writeRecords(records);
  logManagerAction(
    "Create match",
    `${record.homeTeam} vs ${record.awayTeam}`,
    { matchId },
  );
  return record;
}

export function updateManagedMatch(
  matchId: string,
  patch: Partial<
    Pick<
      ManagedMatchRecord,
      | "status"
      | "homeScore"
      | "awayScore"
      | "homeTeam"
      | "awayTeam"
      | "league"
      | "kickoff"
      | "note"
    >
  >,
): ManagedMatchRecord | null {
  const records = readRecords();
  let record = records[matchId];

  if (!record) {
    const taken = takeControlOfCatalogMatch(matchId);
    if (!taken) return null;
    record = taken;
  }

  const updated: ManagedMatchRecord = {
    ...record,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  records[matchId] = updated;
  writeRecords(records);

  logManagerAction(
    "Update match",
    `${updated.homeTeam} vs ${updated.awayTeam} → ${updated.status} (${updated.homeScore}:${updated.awayScore})`,
    { matchId },
  );

  return updated;
}

export function deleteManualMatch(matchId: string): boolean {
  const records = readRecords();
  const record = records[matchId];
  if (!record?.isManual) return false;
  delete records[matchId];
  writeRecords(records);
  logManagerAction("Delete match", matchId, { matchId });
  return true;
}

export function releaseCatalogMatch(matchId: string): boolean {
  const records = readRecords();
  const record = records[matchId];
  if (!record || record.isManual) return false;
  delete records[matchId];
  writeRecords(records);
  logManagerAction("Release control", matchId, { matchId });
  return true;
}

export const MANAGER_STATUS_LABELS: Record<ManagerMatchStatus, string> = {
  not_started: "Not started",
  won: "Won (force picks win)",
  lost: "Lost (force picks lose)",
  void: "Void (cancel match)",
};

export const MANAGER_STATUS_CLASS: Record<ManagerMatchStatus, string> = {
  not_started: "text-brand",
  won: "text-accent",
  lost: "text-live",
  void: "text-muted",
};

export type MatchPhase = "before_kickoff" | "in_play" | "after_ft";

/** Whether the fixture is before kickoff, in play, or past 90 mins. */
export function getMatchPhase(kickoff: string): MatchPhase {
  const start = new Date(kickoff).getTime();
  const now = Date.now();
  const ft = start + 90 * 60 * 1000;

  if (now < start) return "before_kickoff";
  if (now < ft) return "in_play";
  return "after_ft";
}

export const MATCH_PHASE_LABELS: Record<MatchPhase, string> = {
  before_kickoff: "Before match",
  in_play: "Live / in play",
  after_ft: "After full time",
};
