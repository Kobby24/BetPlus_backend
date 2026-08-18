import { PageHeader } from "@/components/PageHeader";
import { MatchRow } from "@/components/MatchRow";
import { getLiveMatches } from "@/lib/mock-data";

export default function LivePage() {
  const liveMatches = getLiveMatches();

  return (
    <div className="space-y-3">
      <PageHeader icon="live" title="Live" subtitle="In-play markets" />

      {liveMatches.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface py-10 text-center text-xs text-muted">
          Nothing live right now
        </div>
      ) : (
        <section className="league-block">
          <h3 className="border-b border-border bg-surface-elevated px-3 py-2 text-xs font-semibold">
            Live now
          </h3>
          {liveMatches.map((match, index) => (
            <MatchRow key={match.id} match={match} showDivider={index > 0} />
          ))}
        </section>
      )}
    </div>
  );
}
