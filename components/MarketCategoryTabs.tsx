"use client";

import type { MarketCategory } from "@/lib/types";

interface MarketCategoryTabsProps {
  categories: { id: MarketCategory; label: string }[];
  active: MarketCategory;
  onChange: (category: MarketCategory) => void;
}

export function MarketCategoryTabs({
  categories,
  active,
  onChange,
}: MarketCategoryTabsProps) {
  return (
    <div className="sticky top-12 z-20 border-b border-white/10 bg-brand-dark shadow-sm">
      <div className="flex overflow-x-auto scrollbar-hide">
        {categories.map((cat) => {
          const isActive = active === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onChange(cat.id)}
              className={`relative shrink-0 px-3.5 py-3 text-xs font-medium transition-colors ${
                isActive
                  ? "font-semibold text-white"
                  : "text-white/55 hover:text-white/80"
              }`}
            >
              {cat.label}
              {isActive && (
                <span className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-brand-accent" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
