"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ManagerGate } from "@/components/manager/ManagerGate";
import { ManagerReferralsPanel } from "@/components/manager/ManagerReferralsPanel";
import {
  listManagerMatches,
  MANAGER_STATUS_LABELS,
  type ManagerMatchView,
} from "@/lib/manager-matches-store";
import { managerGetMatches, useBackendApi } from "@/lib/backend-client";
import { backendMatchToView } from "@/lib/backend-mappers";

export default function ManagerHomePage() {
  const backendMode = useBackendApi();
  const [matches, setMatches] = useState<ManagerMatchView[]>([]);

  useEffect(() => {
    async function load() {
      if (backendMode) {
        const remote = await managerGetMatches();
        setMatches(remote.map(backendMatchToView));
        return;
      }
      setMatches(listManagerMatches());
    }
    void load();
  }, [backendMode]);

  const managed = matches.filter((m) => m.managed);
  const open = managed.filter((m) => m.status === "not_started");

  return (
    <ManagerGate>
      <div className="space-y-4">
        <div>
          <h1 className="page-title">Manager</h1>
          <p className="mt-0.5 text-xs text-muted">
            Enable Manager Mode in Profile to access match control and ticket
            editing.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="card p-4">
            <p className="text-[11px] text-muted">Managed matches</p>
            <p className="mt-1 text-2xl font-bold text-brand-dark">
              {managed.length}
            </p>
          </div>
          <div className="card p-4">
            <p className="text-[11px] text-muted">Awaiting result</p>
            <p className="mt-1 text-2xl font-bold text-brand">{open.length}</p>
          </div>
          <div className="card p-4">
            <p className="text-[11px] text-muted">Catalog fixtures</p>
            <p className="mt-1 text-2xl font-bold text-brand-dark">
              {matches.length}
            </p>
          </div>
        </div>

        <ManagerReferralsPanel />

        <div className="flex flex-wrap gap-2">
          <Link
            href="/manager/matches"
            className="rounded-md bg-brand px-4 py-2 text-xs font-semibold text-white"
          >
            Manage matches
          </Link>
          <Link
            href="/manager/matches?new=1"
            className="rounded-md border border-brand px-4 py-2 text-xs font-semibold text-brand"
          >
            Add manual match
          </Link>
        </div>

        {managed.length > 0 && (
          <section className="card overflow-hidden">
            <div className="border-b border-border bg-brand-light/40 px-3 py-2">
              <h2 className="text-sm font-semibold text-brand-dark">
                Your controlled matches
              </h2>
            </div>
            <ul className="divide-y divide-border/60">
              {managed.slice(0, 5).map((m) => (
                <li key={m.matchId}>
                  <Link
                    href={`/manager/matches/${m.matchId}`}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 text-xs hover:bg-brand-light/30"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-brand-dark">
                        {m.homeTeam} vs {m.awayTeam}
                      </p>
                      <p className="text-[10px] text-muted">{m.league}</p>
                    </div>
                    <span className="shrink-0 font-medium text-brand">
                      {MANAGER_STATUS_LABELS[m.status]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="card p-4">
          <h2 className="text-sm font-semibold text-brand-dark">How it works</h2>
          <ul className="mt-2 space-y-1.5 text-xs text-muted">
            <li>
              <strong className="text-brand-dark">Not started</strong> — bets on
              this match stay open.
            </li>
            <li>
              <strong className="text-brand-dark">Won / Lost</strong> — force
              all picks on this match to win or lose (use score for display).
            </li>
            <li>
              <strong className="text-brand-dark">Void</strong> — cancels the
              match; open bets with this leg are voided and stake refunded.
            </li>
          </ul>
        </section>
      </div>
    </ManagerGate>
  );
}
