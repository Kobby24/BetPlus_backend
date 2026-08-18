import Link from "next/link";
import type { Match } from "@/lib/types";
import { formatKickoff } from "@/lib/utils";
import { OddsButton } from "./OddsButton";

interface MatchRowProps {
  match: Match;
  showDivider?: boolean;
}

export function MatchRow({ match, showDivider = false }: MatchRowProps) {
  const showDraw = match.sport === "football";

  return (
    <article
      className={`px-3 py-2.5 ${showDivider ? "border-t border-border" : ""}`}
    >
      <Link href={`/match/${match.id}`} className="block">
        <div className="mb-1.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px]">
            {match.isLive ? (
              <span className="font-medium text-live">
                Live {match.liveMinute}&apos;
              </span>
            ) : (
              <span className="text-muted">{formatKickoff(match.kickoff)}</span>
            )}
            {match.isQualifier && (
              <span className="rounded bg-brand/10 px-1 py-0.5 text-[9px] font-medium text-brand">
                Qualifier
              </span>
            )}
            {match.isLive && (
              <span className="font-semibold tabular-nums text-foreground">
                {match.homeScore} - {match.awayScore}
              </span>
            )}
          </div>
          <span className="text-[10px] text-muted">+ markets</span>
        </div>

        <div className="mb-2 space-y-0.5">
          <p className="text-sm font-medium leading-snug">{match.homeTeam}</p>
          <p className="text-sm font-medium leading-snug">{match.awayTeam}</p>
        </div>
      </Link>

      <div className="flex gap-1">
        <OddsButton match={match} selection="home" label="1" />
        {showDraw && <OddsButton match={match} selection="draw" label="X" />}
        <OddsButton match={match} selection="away" label="2" />
      </div>
    </article>
  );
}
