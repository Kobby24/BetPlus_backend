"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ManagerGate } from "@/components/manager/ManagerGate";
import { ManagerStatusSelect } from "@/components/manager/ManagerStatusSelect";
import { reconcileBetsForMatch } from "@/lib/bet-store";
import {
  deleteManualMatch,
  getManagerMatchView,
  getMatchPhase,
  MANAGER_STATUS_LABELS,
  MATCH_PHASE_LABELS,
  releaseCatalogMatch,
  takeControlOfCatalogMatch,
  updateManagedMatch,
  type ManagerMatchStatus,
  type ManagerMatchView,
} from "@/lib/manager-matches-store";
import {
  managerDeleteMatch,
  managerGetMatches,
  managerReleaseControl,
  managerTakeControl,
  managerUpdateMatch,
  useBackendApi,
} from "@/lib/backend-client";
import { backendMatchToView } from "@/lib/backend-mappers";

function formatKickoff(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ManagerMatchDetailPage() {
  const params = useParams();
  const router = useRouter();
  const matchId = params.id as string;

  const backendMode = useBackendApi();
  const [match, setMatch] = useState<ManagerMatchView | null>(null);
  const [status, setStatus] = useState<ManagerMatchStatus>("not_started");
  const [homeScore, setHomeScore] = useState("0");
  const [awayScore, setAwayScore] = useState("0");
  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");
  const [league, setLeague] = useState("");
  const [kickoff, setKickoff] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    if (backendMode) {
      const remote = await managerGetMatches();
      let view = remote.map(backendMatchToView).find((m) => m.matchId === matchId) ?? null;
      if (view && !view.managed && view.source === "catalog") {
        const taken = await managerTakeControl(matchId);
        view = backendMatchToView(taken);
      }
      if (!view) return;
      setMatch(view);
      setStatus(view.status);
      setHomeScore(String(view.homeScore));
      setAwayScore(String(view.awayScore));
      setHomeTeam(view.homeTeam);
      setAwayTeam(view.awayTeam);
      setLeague(view.league);
      setKickoff(toLocalInput(view.kickoff));
      setNote(view.note ?? "");
      return;
    }
    let view = getManagerMatchView(matchId);
    if (view && !view.managed && view.source === "catalog") {
      takeControlOfCatalogMatch(matchId);
      view = getManagerMatchView(matchId);
    }
    if (!view) return;
    setMatch(view);
    setStatus(view.status);
    setHomeScore(String(view.homeScore));
    setAwayScore(String(view.awayScore));
    setHomeTeam(view.homeTeam);
    setAwayTeam(view.awayTeam);
    setLeague(view.league);
    setKickoff(toLocalInput(view.kickoff));
    setNote(view.note ?? "");
  }

  useEffect(() => {
    void load();
  }, [matchId, backendMode]);

  const phase = match ? getMatchPhase(match.kickoff) : "before_kickoff";

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!match) return;

    const kickoffIso = kickoff
      ? new Date(kickoff).toISOString()
      : match.kickoff;

    if (backendMode) {
      await managerUpdateMatch(matchId, {
        status,
        home_score: Number.parseInt(homeScore, 10) || 0,
        away_score: Number.parseInt(awayScore, 10) || 0,
        home_team: homeTeam.trim(),
        away_team: awayTeam.trim(),
        league: league.trim(),
        kickoff: kickoffIso,
        note: note.trim() || undefined,
      });
      await load();
      setMessage(
        status === "not_started"
          ? "Match saved — status set to not started."
          : `Match updated as ${MANAGER_STATUS_LABELS[status]}. Related bets reconciled.`,
      );
      return;
    }

    const updated = updateManagedMatch(matchId, {
      status,
      homeScore: Number.parseInt(homeScore, 10) || 0,
      awayScore: Number.parseInt(awayScore, 10) || 0,
      homeTeam: homeTeam.trim(),
      awayTeam: awayTeam.trim(),
      league: league.trim(),
      kickoff: kickoffIso,
      note: note.trim() || undefined,
    });

    if (!updated) {
      setMessage("Could not save match");
      return;
    }

    reconcileBetsForMatch(matchId);
    load();
    setMessage(
      status === "not_started"
        ? "Match saved — status set to not started."
        : `Match updated as ${MANAGER_STATUS_LABELS[status]}. Related bets reconciled.`,
    );
  }

  async function handleRelease() {
    if (backendMode) {
      if (match?.isManual) {
        await managerDeleteMatch(matchId);
      } else {
        await managerReleaseControl(matchId);
      }
      router.push("/manager/matches");
      return;
    }
    if (match?.isManual) {
      deleteManualMatch(matchId);
      router.push("/manager/matches");
      return;
    }
    releaseCatalogMatch(matchId);
    router.push("/manager/matches");
  }

  if (!match) {
    return (
      <ManagerGate>
        <p className="text-sm text-muted">Match not found.</p>
        <Link
          href="/manager/matches"
          className="mt-2 inline-block text-xs text-brand"
        >
          ← Back to matches
        </Link>
      </ManagerGate>
    );
  }

  return (
    <ManagerGate>
      <div className="space-y-4">
        <Link
          href="/manager/matches"
          className="text-xs text-brand hover:underline"
        >
          ← Matches
        </Link>

        <div>
          <h1 className="page-title">
            {match.homeTeam} vs {match.awayTeam}
          </h1>
          <p className="mt-0.5 text-xs text-muted">
            {match.league} · Kickoff {formatKickoff(match.kickoff)}
          </p>
          <span
            className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
              phase === "before_kickoff"
                ? "bg-brand/10 text-brand"
                : phase === "in_play"
                  ? "bg-live/10 text-live"
                  : "bg-accent/10 text-accent"
            }`}
          >
            {MATCH_PHASE_LABELS[phase]}
          </span>
        </div>

        {message && (
          <p className="rounded-md border border-brand/20 bg-brand/5 px-3 py-2 text-xs">
            {message}
          </p>
        )}

        <form onSubmit={handleSave} className="card space-y-4 p-4">
          <section>
            <h2 className="text-sm font-semibold text-brand-dark">
              Update match
            </h2>
            <p className="mt-1 text-[11px] text-muted">
              Change status before or after kickoff — pick from the dropdown and
              save.
            </p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs">
                <span className="mb-1 block text-muted">Match status</span>
                <ManagerStatusSelect value={status} onChange={setStatus} />
              </label>
              <label className="block text-xs">
                <span className="mb-1 block text-muted">Kickoff (edit anytime)</span>
                <input
                  type="datetime-local"
                  value={kickoff}
                  onChange={(e) => setKickoff(e.target.value)}
                  className="w-full rounded-md border border-border px-3 py-2.5 text-sm outline-none focus:border-brand"
                />
              </label>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs">
              <span className="text-muted">Home score</span>
              <input
                type="number"
                min={0}
                value={homeScore}
                onChange={(e) => setHomeScore(e.target.value)}
                disabled={status === "not_started"}
                className="mt-1 w-full rounded-md border border-border px-3 py-2 outline-none focus:border-brand disabled:bg-brand-light/50"
              />
            </label>
            <label className="block text-xs">
              <span className="text-muted">Away score</span>
              <input
                type="number"
                min={0}
                value={awayScore}
                onChange={(e) => setAwayScore(e.target.value)}
                disabled={status === "not_started"}
                className="mt-1 w-full rounded-md border border-border px-3 py-2 outline-none focus:border-brand disabled:bg-brand-light/50"
              />
            </label>
          </section>

          {match.isManual && (
            <section className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs">
                <span className="text-muted">Home team</span>
                <input
                  value={homeTeam}
                  onChange={(e) => setHomeTeam(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border px-3 py-2 outline-none focus:border-brand"
                />
              </label>
              <label className="block text-xs">
                <span className="text-muted">Away team</span>
                <input
                  value={awayTeam}
                  onChange={(e) => setAwayTeam(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border px-3 py-2 outline-none focus:border-brand"
                />
              </label>
              <label className="col-span-full block text-xs">
                <span className="text-muted">League</span>
                <input
                  value={league}
                  onChange={(e) => setLeague(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border px-3 py-2 outline-none focus:border-brand"
                />
              </label>
            </section>
          )}

          <label className="block text-xs">
            <span className="text-muted">Note (optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-border px-3 py-2 outline-none focus:border-brand"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="rounded-md bg-brand px-4 py-2 text-xs font-semibold text-white"
            >
              Save & apply to bets
            </button>
            <button
              type="button"
              onClick={handleRelease}
              className="rounded-md border border-live/30 px-4 py-2 text-xs text-live"
            >
              {match.isManual ? "Delete match" : "Release control"}
            </button>
          </div>
        </form>

        <section className="card p-4 text-xs text-muted">
          <h2 className="font-semibold text-brand-dark">Status options</h2>
          <ul className="mt-2 space-y-1.5">
            <li>
              <strong className="text-brand-dark">Not started</strong> — use
              before kickoff; bets stay open.
            </li>
            <li>
              <strong className="text-brand-dark">Won / Lost</strong> — use
              after the match (or anytime) to force pick outcomes.
            </li>
            <li>
              <strong className="text-brand-dark">Void</strong> — cancel the
              match; open bets with this leg are voided.
            </li>
          </ul>
        </section>
      </div>
    </ManagerGate>
  );
}
