"use client";

import { useMemo, useState } from "react";
import { getUpcomingMatches } from "@/lib/mock-data";
import type { Sport } from "@/lib/types";
import { MatchRow } from "./MatchRow";
import { SectionTabs, type SectionTab } from "./SectionTabs";
import { SportTabs } from "./SportTabs";

export function SportsHome() {
  const [sport, setSport] = useState<Sport | "all">("all");
  const [section, setSection] = useState<SectionTab>("all");

  const upcoming = useMemo(() => {
    const matches = getUpcomingMatches(sport === "all" ? undefined : sport);
    if (section === "soon") return matches.slice(0, 8);
    return matches;
  }, [sport, section]);

  const grouped = useMemo(() => {
    const groups = new Map<string, typeof upcoming>();
    for (const match of upcoming) {
      const list = groups.get(match.league) ?? [];
      list.push(match);
      groups.set(match.league, list);
    }
    return Array.from(groups.entries());
  }, [upcoming]);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-surface">
        <SectionTabs active={section} onChange={setSection} />
        <div className="border-t border-border px-3 py-2">
          <SportTabs active={sport} onChange={setSport} />
        </div>
      </div>

      {grouped.length === 0 ? (
        <p className="py-8 text-center text-xs text-muted">No matches found.</p>
      ) : (
        grouped.map(([league, matches]) => (
          <section key={league} className="league-block">
            <h3 className="border-b border-border bg-surface-elevated px-3 py-2 text-xs font-semibold">
              {league}
            </h3>
            {matches.map((match, index) => (
              <MatchRow
                key={match.id}
                match={match}
                showDivider={index > 0}
              />
            ))}
          </section>
        ))
      )}
    </div>
  );
}
