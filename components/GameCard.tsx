import Link from "next/link";
import { AppIcon } from "@/components/AppIcon";
import type { Game } from "@/lib/games-data";

interface GameCardProps {
  game: Game;
  compact?: boolean;
  highlighted?: boolean;
}

export function GameCard({
  game,
  compact = false,
  highlighted = false,
}: GameCardProps) {
  if (compact) {
    return (
      <Link
        href="/games"
        className={`card card-hover flex w-[96px] shrink-0 flex-col items-center gap-1.5 p-2 transition-colors ${
          highlighted ? "border-brand/50 bg-brand/5" : ""
        }`}
      >
        <AppIcon name={game.icon} size={28} />
        <span className="w-full truncate text-center text-[11px] font-medium leading-tight">
          {game.title}
        </span>
      </Link>
    );
  }

  return (
    <Link
      href="/games"
      className={`card card-hover flex items-center gap-2.5 p-2.5 transition-colors ${
        highlighted ? "border-brand/50 bg-brand/5" : ""
      }`}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-elevated">
        <AppIcon name={game.icon} size={28} />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-medium">{game.title}</h3>
        <p className="truncate text-[11px] text-muted">
          {game.category} · {game.players}
        </p>
      </div>
    </Link>
  );
}
