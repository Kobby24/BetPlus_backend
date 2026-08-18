"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ManagerGate } from "@/components/manager/ManagerGate";
import { ManagerStatusSelect } from "@/components/manager/ManagerStatusSelect";
import { reconcileBetsForMatch } from "@/lib/bet-store";
import {
  createManualMatch,
  getMatchPhase,
  listManagerMatches,
  MANAGER_STATUS_LABELS,
  MATCH_PHASE_LABELS,
  takeControlOfCatalogMatch,
  updateManagedMatch,
  type ManagerMatchStatus,
  type ManagerMatchView,
} from "@/lib/manager-matches-store";
import {
  managerCreateMatch,
  managerGetMatches,
  managerTakeControl,
  managerUpdateMatch,
  useBackendApi,
} from "@/lib/backend-client";
import { backendMatchToView } from "@/lib/backend-mappers";

function formatKickoff(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MatchesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const showNew = searchParams.get("new") === "1";

  const backendMode = useBackendApi();
  const [matches, setMatches] = useState<ManagerMatchView[]>([]);
  const [filter, setFilter] = useState<"all" | "managed" | "not_started">(
    "all",
  );
  const [message, setMessage] = useState("");

  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");
  const [league, setLeague] = useState("Ghana Premier League");
  const [kickoff, setKickoff] = useState("");

  async function reload() {
    if (backendMode) {
      const remote = await managerGetMatches();
      setMatches(remote.map(backendMatchToView));
      return;
    }
    setMatches(listManagerMatches());
  }

  useEffect(() => {
    void reload();
    const d = new Date();
    d.setHours(d.getHours() + 2, 0, 0, 0);
    setKickoff((prev) => prev || d.toISOString().slice(0, 16));
  }, [backendMode]);

  const filtered = matches.filter((m) => {
    if (filter === "managed" && !m.managed) return false;
    if (filter === "not_started" && m.status !== "not_started") return false;
    return true;
  });

  async function handleCreateManual(e: React.FormEvent) {
    e.preventDefault();
    if (!homeTeam.trim() || !awayTeam.trim()) {
      setMessage("Enter home and away team names");
      return;
    }
    if (backendMode) {
      const remote = await managerCreateMatch({
        home_team: homeTeam,
        away_team: awayTeam,
        league,
        kickoff: new Date(kickoff).toISOString(),
      });
      setMessage(`Created ${remote.home_team} vs ${remote.away_team}`);
      setHomeTeam("");
      setAwayTeam("");
      await reload();
      router.push(`/manager/matches/${remote.match_id}`);
      return;
    }
    const record = createManualMatch({
      homeTeam,
      awayTeam,
      league,
      kickoff: new Date(kickoff).toISOString(),
    });
    reconcileBetsForMatch(record.matchId);
    setMessage(`Created ${record.homeTeam} vs ${record.awayTeam}`);
    setHomeTeam("");
    setAwayTeam("");
    void reload();
    router.push(`/manager/matches/${record.matchId}`);
  }

  async function handleTakeControl(matchId: string) {
    if (backendMode) {
      await managerTakeControl(matchId);
      setMessage("Match is now under your control");
      await reload();
      router.push(`/manager/matches/${matchId}`);
      return;
    }
    takeControlOfCatalogMatch(matchId);
    setMessage("Match is now under your control");
    void reload();
    router.push(`/manager/matches/${matchId}`);
  }

  async function handleQuickStatus(matchId: string, status: ManagerMatchStatus) {
    if (backendMode) {
      const remote = await managerUpdateMatch(matchId, { status });
      setMessage(
        `${remote.home_team} vs ${remote.away_team} → ${MANAGER_STATUS_LABELS[status]}`,
      );
      await reload();
      return;
    }
    const updated = updateManagedMatch(matchId, { status });
    if (!updated) return;
    reconcileBetsForMatch(matchId);
    setMessage(`${updated.homeTeam} vs ${updated.awayTeam} → ${MANAGER_STATUS_LABELS[status]}`);
    void reload();
  }

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/manager"
          className="text-xs text-brand hover:underline"
        >
          ← Manager home
        </Link>
        <h1 className="page-title mt-1">Matches</h1>
        <p className="mt-0.5 text-xs text-muted">
          Use the status dropdown to update before or after kickoff. Open a match
          for scores and kickoff time.
        </p>
      </div>

      {message && (
        <p className="rounded-md border border-brand/20 bg-brand/5 px-3 py-2 text-xs">
          {message}
        </p>
      )}

      {showNew && (
        <form onSubmit={handleCreateManual} className="card space-y-3 p-4">
          <h2 className="text-sm font-semibold text-brand-dark">
            Add manual match
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
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
          </div>
          <label className="block text-xs">
            <span className="text-muted">League</span>
            <input
              value={league}
              onChange={(e) => setLeague(e.target.value)}
              className="mt-1 w-full rounded-md border border-border px-3 py-2 outline-none focus:border-brand"
            />
          </label>
          <label className="block text-xs">
            <span className="text-muted">Kickoff</span>
            <input
              type="datetime-local"
              value={kickoff}
              onChange={(e) => setKickoff(e.target.value)}
              className="mt-1 w-full rounded-md border border-border px-3 py-2 outline-none focus:border-brand"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-brand px-4 py-2 text-xs font-semibold text-white"
          >
            Create match
          </button>
        </form>
      )}

      <div className="flex flex-wrap gap-2">
        {(["all", "managed", "not_started"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-[11px] font-medium ${
              filter === f
                ? "bg-brand text-white"
                : "border border-border text-muted"
            }`}
          >
            {f === "all"
              ? "All"
              : f === "managed"
                ? "Managed"
                : "Not started"}
          </button>
        ))}
        <Link
          href="/manager/matches?new=1"
          className="ml-auto rounded-full border border-brand px-3 py-1 text-[11px] font-medium text-brand"
        >
          + Manual match
        </Link>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-border bg-brand-light/50 text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Match</th>
              <th className="hidden px-3 py-2 font-medium sm:table-cell">
                Kickoff
              </th>
              <th className="hidden px-3 py-2 font-medium sm:table-cell">
                Phase
              </th>
              <th className="px-3 py-2 font-medium">Score</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted">
                  No matches found.
                </td>
              </tr>
            ) : (
              filtered.map((m) => {
                const phase = getMatchPhase(m.kickoff);
                return (
                <tr key={m.matchId} className="border-b border-border/60">
                  <td className="px-3 py-2">
                    <p className="font-medium text-brand-dark">
                      {m.homeTeam} vs {m.awayTeam}
                    </p>
                    <p className="text-[10px] text-muted">{m.league}</p>
                  </td>
                  <td className="hidden px-3 py-2 text-muted sm:table-cell">
                    {formatKickoff(m.kickoff)}
                  </td>
                  <td className="hidden px-3 py-2 text-[10px] text-muted sm:table-cell">
                    {MATCH_PHASE_LABELS[phase]}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {m.status === "not_started"
                      ? "—"
                      : `${m.homeScore}:${m.awayScore}`}
                  </td>
                  <td className="px-3 py-2">
                    {m.managed ? (
                      <ManagerStatusSelect
                        size="sm"
                        value={m.status}
                        onChange={(status) =>
                          handleQuickStatus(m.matchId, status)
                        }
                      />
                    ) : (
                      <span className="text-[10px] text-muted">Catalog</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {m.managed ? (
                      <Link
                        href={`/manager/matches/${m.matchId}`}
                        className="rounded-md bg-brand px-2 py-0.5 text-[10px] font-medium text-white"
                      >
                        Edit
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleTakeControl(m.matchId)}
                        className="rounded-md border border-brand px-2 py-0.5 text-[10px] font-medium text-brand"
                      >
                        Take control
                      </button>
                    )}
                  </td>
                </tr>
              );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ManagerMatchesPage() {
  return (
    <ManagerGate>
      <Suspense
        fallback={
          <div className="py-10 text-center text-sm text-muted">
            Loading matches…
          </div>
        }
      >
        <MatchesContent />
      </Suspense>
    </ManagerGate>
  );
}
