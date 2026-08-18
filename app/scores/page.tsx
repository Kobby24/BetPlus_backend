import { PageHeader } from "@/components/PageHeader";
import { getLiveMatches, MATCHES } from "@/lib/mock-data";
import { formatKickoff } from "@/lib/utils";

export default function ScoresPage() {
  const live = getLiveMatches();
  const upcoming = MATCHES.filter((m) => !m.isLive).slice(0, 8);

  return (
    <div className="space-y-4">
      <PageHeader icon="live-scores" title="Scores" subtitle="Live and upcoming" />

      {live.length > 0 && (
        <section>
          <h2 className="section-label mb-1.5 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-live" />
            Live
          </h2>
          <ul className="card divide-y divide-border/60 overflow-hidden">
            {live.map((m) => (
              <li key={m.id} className="px-3 py-2">
                <p className="text-[10px] text-muted">
                  {m.league} · {m.liveMinute}&apos;
                </p>
                <div className="mt-0.5 flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate font-medium">{m.homeTeam}</span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {m.homeScore}–{m.awayScore}
                  </span>
                  <span className="min-w-0 truncate text-right font-medium">
                    {m.awayTeam}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="section-label mb-1.5">Upcoming</h2>
        <ul className="card divide-y divide-border/60 overflow-hidden">
          {upcoming.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-2 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-[10px] text-muted">{m.league}</p>
                <p className="truncate text-sm font-medium">
                  {m.homeTeam} vs {m.awayTeam}
                </p>
              </div>
              <span className="shrink-0 text-[11px] text-muted">
                {formatKickoff(m.kickoff)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
