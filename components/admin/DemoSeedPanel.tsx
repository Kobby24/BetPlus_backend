"use client";

import Link from "next/link";
import {
  DEMO_USER1,
  DEMO_USER1_BET_CODE,
  prepareUser1DemoForAutoSettle,
  resetUser1OpenDemo,
  seedUser1DemoSlip,
} from "@/lib/demo-seed";
import { formatLegSummary } from "@/lib/bet-record";
import type { PlacedBet } from "@/lib/bet-types";
import type { User } from "@/lib/user-types";
import { formatMoney } from "@/lib/utils";

export function runAdminDemoSeed() {
  return seedUser1DemoSlip();
}

export function DemoSeedPanel({
  demo,
  onReload,
}: {
  demo: { user: User; bet: PlacedBet; created: boolean } | null;
  onReload?: () => void;
}) {
  function handleLoad() {
    const result = seedUser1DemoSlip();
    onReload?.();
    return result;
  }

  if (!demo) {
    return (
      <section className="card border-brand/25 p-4">
        <h2 className="text-sm font-semibold text-brand-dark">Demo data</h2>
        <p className="mt-1 text-xs text-muted">
          Load User1 with a sample bet slip to test admin picks and support claims.
        </p>
        <button
          type="button"
          onClick={handleLoad}
          className="mt-3 rounded-md bg-brand px-4 py-2 text-xs font-medium text-white"
        >
          Load User1 demo slip
        </button>
      </section>
    );
  }

  return (
    <section className="card border-brand/25 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-brand-dark">
            User1 demo slip
          </h2>
          <p className="mt-1 text-xs text-muted">
            {DEMO_USER1.email} / {DEMO_USER1.password} · Code {DEMO_USER1_BET_CODE}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {demo.bet.status === "open" ? (
            <Link
              href={`/admin/bets/${demo.bet.id}?settle=1`}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white"
            >
              Settle bet
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => {
                resetUser1OpenDemo();
                onReload?.();
              }}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white"
            >
              Reset open demo
            </button>
          )}
          <Link
            href={`/admin/bets/${demo.bet.id}`}
            className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white"
          >
            Edit bet
          </Link>
          <Link
            href={`/admin/users/${demo.user.id}`}
            className="rounded-md border border-brand px-3 py-1.5 text-xs font-medium text-brand"
          >
            View User1
          </Link>
          <Link
            href={`/bet/${DEMO_USER1_BET_CODE}`}
            className="rounded-md border border-border px-3 py-1.5 text-xs text-muted"
          >
            Ticket
          </Link>
          {demo.bet.status === "open" && (
            <button
              type="button"
              onClick={() => {
                prepareUser1DemoForAutoSettle();
                onReload?.();
              }}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted"
            >
              Simulate FT
            </button>
          )}
        </div>
      </div>

      <ul className="mt-3 space-y-1.5">
        {demo.bet.selections.map((sel, i) => (
          <li
            key={sel.id}
            className="rounded-md bg-brand-light/40 px-3 py-2 text-[11px]"
          >
            <span className="font-medium">Leg {i + 1}</span>
            <span className="text-muted"> — </span>
            {formatLegSummary(sel)}
          </li>
        ))}
      </ul>

      <p className="mt-2 text-[11px] text-muted">
        Stake {formatMoney(demo.bet.stake)} · Potential{" "}
        {formatMoney(demo.bet.potentialWin)} · Status{" "}
        <span className="font-medium text-brand-dark">{demo.bet.status}</span>
        {demo.bet.status !== "open" && (
          <span>
            {" "}
            — use <span className="font-medium">Reset open demo</span> to test
            Settle again
          </span>
        )}
      </p>
    </section>
  );
}
