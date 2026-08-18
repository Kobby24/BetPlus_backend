import Link from "next/link";
import { AppIcon } from "@/components/AppIcon";
import { LEAGUE_SPORTS } from "@/lib/leagues-data";

export default function LeaguesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Leagues</h1>
        <p className="mt-0.5 text-xs text-muted">
          Browse by sport, country, and competition
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {LEAGUE_SPORTS.map((sport) => (
          <Link
            key={sport.id}
            href={`/leagues/${sport.id}`}
            className="card card-hover flex flex-col items-center gap-2 px-3 py-4 transition-colors"
          >
            <AppIcon name={sport.id} size={36} />
            <span className="text-sm font-semibold">{sport.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
