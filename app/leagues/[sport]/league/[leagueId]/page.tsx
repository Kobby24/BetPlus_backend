import Link from "next/link";
import { notFound } from "next/navigation";
import { MatchRow } from "@/components/MatchRow";
import {
  getCountryById,
  getLeagueById,
  isValidSport,
  sportLabel,
} from "@/lib/leagues-data";
import { getMatchesForLeague } from "@/lib/leagues-utils";

interface LeagueMatchesPageProps {
  params: Promise<{ sport: string; leagueId: string }>;
}

export default async function LeagueMatchesPage({
  params,
}: LeagueMatchesPageProps) {
  const { sport: sportParam, leagueId } = await params;
  if (!isValidSport(sportParam)) notFound();

  const league = getLeagueById(leagueId);
  if (!league || league.sport !== sportParam) notFound();

  const country = getCountryById(league.countryId);
  const matches = getMatchesForLeague(leagueId);

  return (
    <div className="space-y-4">
      <div>
        <Link
          href={
            country
              ? `/leagues/${sportParam}/country/${country.id}`
              : `/leagues/${sportParam}`
          }
          className="text-[11px] font-medium text-brand hover:underline"
        >
          ← {country?.name ?? sportLabel(league.sport)}
        </Link>
        <h1 className="page-title mt-1">{league.name}</h1>
        <p className="text-xs text-muted">
          {matches.length} {matches.length === 1 ? "match" : "matches"} available
        </p>
      </div>

      {matches.length === 0 ? (
        <p className="py-8 text-center text-xs text-muted">No matches right now.</p>
      ) : (
        <section className="league-block">
          {matches.map((match, index) => (
            <MatchRow key={match.id} match={match} showDivider={index > 0} />
          ))}
        </section>
      )}
    </div>
  );
}
