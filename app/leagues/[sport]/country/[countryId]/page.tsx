import Link from "next/link";
import { notFound } from "next/navigation";
import { CountryFlag } from "@/components/CountryFlag";
import {
  getCountryById,
  getLeaguesForCountry,
  isValidSport,
  sportLabel,
} from "@/lib/leagues-data";
import { countMatchesForLeague } from "@/lib/leagues-utils";
import type { Sport } from "@/lib/types";

interface CountryLeaguesPageProps {
  params: Promise<{ sport: string; countryId: string }>;
}

export default async function CountryLeaguesPage({
  params,
}: CountryLeaguesPageProps) {
  const { sport: sportParam, countryId } = await params;
  if (!isValidSport(sportParam)) notFound();

  const sport = sportParam as Sport;
  const country = getCountryById(countryId);
  if (!country) notFound();

  const leagues = getLeaguesForCountry(sport, countryId);
  if (leagues.length === 0) notFound();

  return (
    <div className="space-y-4">
      <div>
        <Link
          href={`/leagues/${sport}`}
          className="text-[11px] font-medium text-brand hover:underline"
        >
          ← {sportLabel(sport)}
        </Link>
        <div className="mt-1 flex items-center gap-2">
          <CountryFlag code={country.flagCode} size="md" />
          <div>
            <h1 className="page-title">{country.name}</h1>
            <p className="text-xs text-muted">All competitions</p>
          </div>
        </div>
      </div>

      <ul className="card divide-y divide-border/60 overflow-hidden">
        {leagues.map((league) => (
          <li key={league.id}>
            <Link
              href={`/leagues/${sport}/league/${league.id}`}
              className="card-hover flex items-center justify-between px-3 py-2.5 transition-colors"
            >
              <div>
                <p className="text-sm font-medium">{league.name}</p>
                {league.tier != null && league.tier > 0 && (
                  <p className="text-[10px] text-muted">Tier {league.tier}</p>
                )}
              </div>
              <span className="text-[11px] text-muted">
                {countMatchesForLeague(league.id)} games
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
