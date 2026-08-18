"use client";

import Link from "next/link";
import { GameCard } from "@/components/GameCard";
import { PageHeader } from "@/components/PageHeader";
import { GAMES } from "@/lib/games-data";

const VIRTUAL_EVENTS = [
  { id: "vf1", home: "Virtual City", away: "Virtual United", league: "V-League", minute: 12, score: "1-0" },
  { id: "vf2", home: "Cyber FC", away: "Digital Rovers", league: "V-League", minute: 67, score: "2-2" },
  { id: "vf3", home: "Sim Stars", away: "Pixel FC", league: "V-Cup", minute: 34, score: "0-1" },
  { id: "vh1", label: "Horse Race #4821", league: "V-Racing", status: "Starts 2m" },
  { id: "vh2", label: "Greyhound #1193", league: "V-Racing", status: "Lap 3/4" },
];

export default function VirtualSportsPage() {
  const virtualGames = GAMES.filter((g) => g.category === "Virtual");

  return (
    <div className="space-y-4">
      <PageHeader icon="virtual-sports" title="Virtual" subtitle="Simulated events, always on" />

      <section>
        <h2 className="section-label mb-1.5">Live now</h2>
        <ul className="card divide-y divide-border/60 overflow-hidden">
          {VIRTUAL_EVENTS.map((event) => (
            <li
              key={event.id}
              className="flex items-center justify-between px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-[10px] text-muted">{event.league}</p>
                <p className="truncate text-sm font-medium">
                  {"home" in event
                    ? `${event.home} vs ${event.away}`
                    : event.label}
                </p>
              </div>
              <div className="shrink-0 text-right">
                {"minute" in event ? (
                  <>
                    <p className="text-xs font-semibold text-live">{event.score}</p>
                    <p className="text-[10px] text-muted">{event.minute}&apos;</p>
                  </>
                ) : (
                  <p className="text-[11px] text-brand">{event.status}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="section-label mb-1.5">Games</h2>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {virtualGames.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      </section>

      <p className="text-center text-[11px] text-muted">
        More in{" "}
        <Link href="/games" className="text-brand hover:underline">
          casino
        </Link>
      </p>
    </div>
  );
}
