import Link from "next/link";
import { getFeaturedGames } from "@/lib/games-data";
import { GameCard } from "./GameCard";

export function GamesBanner() {
  const featured = getFeaturedGames();

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="section-label">Games</h2>
        <Link href="/games" className="text-[11px] font-medium text-brand">
          All games
        </Link>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {featured.map((game) => (
          <GameCard key={game.id} game={game} compact />
        ))}
      </div>
    </section>
  );
}
