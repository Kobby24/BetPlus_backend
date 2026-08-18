"use client";

const TABS = [
  { id: "live", label: "Live" },
  { id: "soon", label: "Today" },
  { id: "all", label: "All" },
  { id: "bets", label: "My Bets" },
] as const;

export type SectionTab = (typeof TABS)[number]["id"];

interface SectionTabsProps {
  active: SectionTab;
  onChange: (tab: SectionTab) => void;
}

export function SectionTabs({ active, onChange }: SectionTabsProps) {
  return (
    <div className="flex scrollbar-hide">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`relative flex-1 py-2.5 text-xs font-medium transition-colors ${
            active === tab.id ? "text-brand-dark" : "text-muted"
          }`}
        >
          {tab.label}
          {active === tab.id && (
            <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-brand-dark" />
          )}
        </button>
      ))}
    </div>
  );
}
