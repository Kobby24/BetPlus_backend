"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { GameCard } from "@/components/GameCard";
import { resolveBookingCode } from "@/lib/booking-codes";
import { GAME_CATEGORIES, GAMES } from "@/lib/games-data";

export function GamesContent() {
  const searchParams = useSearchParams();
  const loadedCode = searchParams.get("code");
  const [category, setCategory] = useState<string>("All");

  const loadedGameIds = useMemo(() => {
    if (!loadedCode) return new Set<string>();
    const result = resolveBookingCode(loadedCode);
    if (!result || result.type !== "games") return new Set<string>();
    return new Set(result.games.map((g) => g.id));
  }, [loadedCode]);

  const filtered = useMemo(() => {
    if (category === "All") return GAMES;
    return GAMES.filter((g) => g.category === category);
  }, [category]);

  const loadedGames = useMemo(
    () => GAMES.filter((g) => loadedGameIds.has(g.id)),
    [loadedGameIds],
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Games</h1>
        <p className="mt-0.5 text-xs text-muted">Crash, slots, virtual & table</p>
      </div>

      {loadedCode && loadedGames.length > 0 && (
        <div className="card border-brand/40 bg-brand/5 p-2.5">
          <p className="text-xs font-medium text-brand">Code: {loadedCode}</p>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {loadedGames.map((game) => (
              <GameCard key={game.id} game={game} highlighted />
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
        {GAME_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategory(cat)}
            className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              category === cat
                ? "bg-brand text-white"
                : "bg-surface-elevated text-muted hover:text-foreground"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((game) => (
          <GameCard
            key={game.id}
            game={game}
            highlighted={loadedGameIds.has(game.id)}
          />
        ))}
      </div>
    </div>
  );
}
