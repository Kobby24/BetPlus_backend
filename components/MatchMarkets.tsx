"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  filterMarketsByCategory,
  getMarketCategoriesForMatch,
  getMarketsForMatch,
} from "@/lib/match-markets";
import { getMatchPlayers } from "@/lib/match-players";
import type { MarketCategory, Match } from "@/lib/types";
import { formatKickoff } from "@/lib/utils";
import { MarketCategoryTabs } from "./MarketCategoryTabs";
import { MarketOddsButton } from "./MarketOddsButton";
import { PlayerMarketBlock } from "./PlayerMarketBlock";

interface MatchMarketsProps {
  match: Match;
}

export function MatchMarkets({ match }: MatchMarketsProps) {
  const categories = getMarketCategoriesForMatch(match);
  const allMarkets = useMemo(() => getMarketsForMatch(match), [match]);
  const players = useMemo(() => getMatchPlayers(match), [match]);
  const [category, setCategory] = useState<MarketCategory>("all");

  const markets = useMemo(
    () => filterMarketsByCategory(allMarkets, category),
    [allMarkets, category],
  );

  return (
    <div className="-mx-3 md:-mx-0 md:overflow-hidden md:rounded-lg md:border md:border-border md:shadow-sm">
      {/* Match header */}
      <div className="bg-brand-dark px-3 pb-3 pt-2 text-white">
        <Link
          href="/"
          className="mb-2 inline-flex items-center gap-1 text-xs text-white/70 hover:text-white"
        >
          ← Back
        </Link>
        <p className="text-[11px] text-white/60">{match.league}</p>
        {match.isQualifier && (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-medium text-white">
              Qualifier
            </span>
            {match.legInfo && (
              <span className="text-[10px] text-white/60">{match.legInfo}</span>
            )}
            {match.aggregateScore && (
              <span className="text-[10px] text-white/60">
                Agg {match.aggregateScore}
              </span>
            )}
          </div>
        )}
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{match.homeTeam}</p>
            <p className="truncate text-sm font-semibold">{match.awayTeam}</p>
          </div>
          <div className="shrink-0 text-right">
            {match.isLive ? (
              <>
                <p className="text-lg font-bold tabular-nums">
                  {match.homeScore} - {match.awayScore}
                </p>
                <p className="text-[11px] font-medium text-live">
                  Live {match.liveMinute}&apos;
                </p>
              </>
            ) : (
              <p className="text-xs text-white/70">{formatKickoff(match.kickoff)}</p>
            )}
          </div>
        </div>
      </div>

      <MarketCategoryTabs
        categories={categories}
        active={category}
        onChange={setCategory}
      />

      <div className="border-b border-brand-soft bg-brand-light px-3 py-1.5">
        <p className="text-[10px] font-medium text-muted">
          {category === "all"
            ? `${allMarkets.length} markets available`
            : `${markets.length} markets`}
        </p>
      </div>

      <div className="divide-y divide-brand-soft/70 bg-surface">
        {markets.length === 0 ? (
          <p className="px-3 py-10 text-center text-xs text-muted">
            No markets in this category.
          </p>
        ) : (
          markets.map((market) =>
            market.layout === "players" && market.playerOddsKey ? (
              <PlayerMarketBlock
                key={market.id}
                match={match}
                market={market}
                players={players}
                oddsKey={market.playerOddsKey}
                extraOutcomes={market.outcomes}
              />
            ) : (
              <section key={market.id} className="bg-surface">
                <h3 className="border-b border-brand-soft/50 bg-brand-light/40 px-3 py-2.5 text-[13px] font-bold text-foreground">
                  {market.name}
                </h3>
                <div
                  className={`grid gap-2 p-3 ${
                    market.outcomes.length >= 6
                      ? "grid-cols-3"
                      : market.outcomes.length >= 3
                        ? "grid-cols-3"
                        : market.outcomes.length === 2
                          ? "grid-cols-2"
                          : "grid-cols-1"
                  }`}
                >
                  {market.outcomes.map((outcome) => (
                    <MarketOddsButton
                      key={outcome.id}
                      match={match}
                      marketId={market.id}
                      marketName={market.name}
                      outcomeId={outcome.id}
                      label={outcome.label}
                      odds={outcome.odds}
                    />
                  ))}
                </div>
              </section>
            ),
          )
        )}
      </div>
    </div>
  );
}
