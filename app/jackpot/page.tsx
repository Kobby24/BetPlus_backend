"use client";

import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { formatMoney } from "@/lib/utils";

const JACKPOTS = [
  {
    id: "mega",
    name: "Mega Jackpot",
    pool: 2_450_000,
    entry: 50,
    closesIn: "2d 14h",
    picks: 15,
  },
  {
    id: "daily",
    name: "Daily Jackpot",
    pool: 125_000,
    entry: 10,
    closesIn: "6h 22m",
    picks: 8,
  },
  {
    id: "correct-score",
    name: "Correct Score",
    pool: 890_000,
    entry: 25,
    closesIn: "1d 3h",
    picks: 6,
  },
];

const RECENT_WINNERS = [
  { name: "Kwame A.", amount: 450_000, jackpot: "Mega", date: "2 days ago" },
  { name: "Ama O.", amount: 98_500, jackpot: "Daily", date: "Yesterday" },
  { name: "Kofi M.", amount: 210_000, jackpot: "Correct Score", date: "3 days ago" },
];

export default function JackpotPage() {
  return (
    <div className="space-y-4">
      <PageHeader icon="jackpot" title="Jackpot" subtitle="Pick results, win the pool" />

      <ul className="space-y-1.5">
        {JACKPOTS.map((jp) => (
          <li key={jp.id}>
            <article className="card p-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-medium">{jp.name}</h2>
                  <p className="mt-0.5 text-lg font-semibold text-brand">
                    {formatMoney(jp.pool)}
                  </p>
                  <p className="text-[11px] text-muted">
                    {jp.picks} picks · closes {jp.closesIn}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[10px] text-muted">From</p>
                  <p className="text-sm font-semibold">{formatMoney(jp.entry)}</p>
                </div>
              </div>
              <button
                type="button"
                className="mt-2 w-full rounded-md bg-brand py-2 text-xs font-medium text-white hover:bg-brand-dark"
              >
                Play
              </button>
            </article>
          </li>
        ))}
      </ul>

      <section>
        <h2 className="section-label mb-1.5">Recent winners</h2>
        <ul className="card divide-y divide-border/60 overflow-hidden">
          {RECENT_WINNERS.map((w) => (
            <li
              key={w.name + w.date}
              className="flex items-center justify-between px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium">{w.name}</p>
                <p className="text-[11px] text-muted">
                  {w.jackpot} · {w.date}
                </p>
              </div>
              <span className="text-sm font-semibold text-brand">
                {formatMoney(w.amount)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-center text-[11px] text-muted">
        Bonus entries on{" "}
        <Link href="/promotions" className="text-brand hover:underline">
          promotions
        </Link>
      </p>
    </div>
  );
}
