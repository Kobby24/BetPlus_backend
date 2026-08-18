"use client";

import type { BettingMarket, Match } from "@/lib/types";
import { getPlayersByTeam } from "@/lib/match-players";
import type { MatchPlayer } from "@/lib/match-players";
import { PlayerOddsRow } from "./PlayerOddsRow";
import { MarketOddsButton } from "./MarketOddsButton";

interface PlayerMarketBlockProps {
  match: Match;
  market: BettingMarket;
  players: MatchPlayer[];
  oddsKey: keyof Pick<
    MatchPlayer,
    "anytimeOdds" | "firstOdds" | "lastOdds" | "score2Odds" | "score3Odds" | "cardOdds"
  >;
  extraOutcomes?: BettingMarket["outcomes"];
}

export function PlayerMarketBlock({
  match,
  market,
  players,
  oddsKey,
  extraOutcomes = [],
}: PlayerMarketBlockProps) {
  const { home, away } = getPlayersByTeam(players);

  return (
    <section className="bg-surface">
      <h3 className="border-b border-brand-soft/50 bg-brand-light/40 px-3 py-2.5 text-[13px] font-bold text-foreground">
        {market.name}
      </h3>

      <div>
        <p className="border-b border-brand-soft/40 bg-brand-light/25 px-3 py-2 text-[11px] font-semibold text-foreground/80">
          {match.homeTeam}
        </p>
        {home.map((player) => (
          <PlayerOddsRow
            key={`${market.id}-${player.id}`}
            match={match}
            marketId={market.id}
            marketName={market.name}
            outcomeId={`${market.id}-${player.id}`}
            name={player.name}
            odds={player[oddsKey]}
          />
        ))}
      </div>

      <div>
        <p className="border-b border-brand-soft/40 bg-brand-light/25 px-3 py-2 text-[11px] font-semibold text-foreground/80">
          {match.awayTeam}
        </p>
        {away.map((player) => (
          <PlayerOddsRow
            key={`${market.id}-${player.id}`}
            match={match}
            marketId={market.id}
            marketName={market.name}
            outcomeId={`${market.id}-${player.id}`}
            name={player.name}
            odds={player[oddsKey]}
          />
        ))}
      </div>

      {extraOutcomes.length > 0 && (
        <div className="grid grid-cols-2 gap-2 border-t border-brand-soft/50 p-3">
          {extraOutcomes.map((outcome) => (
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
      )}
    </section>
  );
}
