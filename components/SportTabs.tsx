"use client";

import { SPORTS } from "@/lib/mock-data";
import { AppIcon } from "@/components/AppIcon";
import type { Sport } from "@/lib/types";

interface SportTabsProps {
  active: Sport | "all";
  onChange: (sport: Sport | "all") => void;
}

export function SportTabs({ active, onChange }: SportTabsProps) {
  return (
    <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
      <button
        type="button"
        onClick={() => onChange("all")}
        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
          active === "all"
            ? "bg-brand-dark text-white"
            : "bg-surface-elevated text-muted"
        }`}
      >
        All
      </button>
      {SPORTS.map((sport) => (
        <button
          key={sport.id}
          type="button"
          onClick={() => onChange(sport.id)}
          className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ${
            active === sport.id
              ? "bg-brand-dark text-white"
              : "bg-surface-elevated text-muted"
          }`}
        >
          <AppIcon name={sport.icon} size={16} />
          {sport.label}
        </button>
      ))}
    </div>
  );
}
