import Link from "next/link";
import { notFound } from "next/navigation";
import { CountryFlag } from "@/components/CountryFlag";
import {
  getCountriesForSport,
  getTopLeaguesForSport,
  isValidSport,
  sportLabel,
} from "@/lib/leagues-data";
import { countMatchesForLeague } from "@/lib/leagues-utils";
import type { Sport } from "@/lib/types";

interface SportLeaguesPageProps {
  params: Promise<{ sport: string }>;
}

export default async function SportLeaguesPage({ params }: SportLeaguesPageProps) {
  const { sport: sportParam } = await params;
  if (!isValidSport(sportParam)) notFound();

  const sport = sportParam as Sport;
  const topLeagues = getTopLeaguesForSport(sport);
  const countries = getCountriesForSport(sport);

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/leagues"
          className="text-[11px] font-medium text-brand hover:underline"
        >
          ← All sports
        </Link>
        <h1 className="page-title mt-1">{sportLabel(sport)}</h1>
        <p className="mt-0.5 text-xs text-muted">Top leagues and countries</p>
      </div>

      <section>
        <h2 className="section-label mb-1.5 px-0.5">Top leagues</h2>
        <ul className="card divide-y divide-border/60 overflow-hidden">
          {topLeagues.map((league) => (
            <li key={league.id}>
              <Link
                href={`/leagues/${sport}/league/${league.id}`}
                className="card-hover flex items-center justify-between px-3 py-2.5 transition-colors"
              >
                <span className="text-sm font-medium">{league.name}</span>
                <span className="text-[11px] text-muted">
                  {countMatchesForLeague(league.id)} games
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="section-label mb-1.5 px-0.5">Browse by country</h2>
        <ul className="card divide-y divide-border/60 overflow-hidden">
          {countries.map((country) => (
            <li key={country.id}>
              <Link
                href={`/leagues/${sport}/country/${country.id}`}
                className="card-hover flex items-center gap-2.5 px-3 py-2.5 transition-colors"
              >
                <CountryFlag code={country.flagCode} />
                <span className="flex-1 text-sm font-medium">{country.name}</span>
                <span className="text-xs text-muted/60">›</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
