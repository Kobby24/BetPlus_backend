import type { Match } from "@/lib/types";
import { formatKickoff } from "@/lib/utils";
import { OddsButton } from "./OddsButton";

export function TopMatchCard({ match }: { match: Match }) {
  return (
    <article className="w-[180px] shrink-0 rounded-lg border border-border bg-surface p-2.5">
      <p className="mb-1.5 text-[10px] text-muted">
        {formatKickoff(match.kickoff)} · {match.league}
      </p>
      <p className="truncate text-xs font-medium">{match.homeTeam}</p>
      <p className="mb-2 truncate text-xs font-medium">{match.awayTeam}</p>
      <div className="flex gap-1">
        <OddsButton match={match} selection="home" label="1" />
        <OddsButton match={match} selection="draw" label="X" />
        <OddsButton match={match} selection="away" label="2" />
      </div>
    </article>
  );
}
