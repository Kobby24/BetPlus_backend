"use client";

import { useId } from "react";

type TrophyTone = "gold" | "accent";

interface WinTrophyIconProps {
  className?: string;
  /** Show ground shadow under the cup (for modal hero) */
  showShadow?: boolean;
  /** gold = celebration modal; accent = matches won text green */
  tone?: TrophyTone;
}

const PALETTES: Record<
  TrophyTone,
  {
    cup: [string, string, string];
    rim: [string, string];
    handle: [string, string];
    base: [string, string];
    stroke: string;
    stem: string;
    baseBar: string;
    medallionFill: string;
    medallionInner: string;
    medallionStroke: string;
    medallionText: string;
  }
> = {
  gold: {
    cup: ["#fff1a8", "#f5c842", "#d4a017"],
    rim: ["#fff8dc", "#e8b923"],
    handle: ["#f5c842", "#b8860b"],
    base: ["#f0c030", "#a67c00"],
    stroke: "#c9920a",
    stem: "#dba514",
    baseBar: "#c9920a",
    medallionFill: "#fff4cc",
    medallionInner: "#fff8e1",
    medallionStroke: "#d4a017",
    medallionText: "#9a7209",
  },
  accent: {
    cup: ["#d4f0dc", "#0d9737", "#0a7a2e"],
    rim: ["#e8f5eb", "#0d9737"],
    handle: ["#3cb863", "#0a7a2e"],
    base: ["#0d9737", "#086b24"],
    stroke: "#0a7a2e",
    stem: "#0d9737",
    baseBar: "#086b24",
    medallionFill: "#ffffff",
    medallionInner: "#e8f5eb",
    medallionStroke: "#0d9737",
    medallionText: "#0a7a2e",
  },
};

export function WinTrophyIcon({
  className = "h-24 w-24",
  showShadow = false,
  tone = "gold",
}: WinTrophyIconProps) {
  const uid = useId().replace(/:/g, "");
  const p = PALETTES[tone];

  return (
    <svg
      className={className}
      viewBox="0 0 128 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {showShadow && (
        <ellipse cx="64" cy="114" rx="34" ry="7" fill="#000" fillOpacity="0.1" />
      )}

      <path
        d="M34 42c-14 4-18 18-12 30 2 4 6 7 10 8"
        stroke={`url(#handle-${uid})`}
        strokeWidth="8"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M94 42c14 4 18 18 12 30-2 4-6 7-10 8"
        stroke={`url(#handle-${uid})`}
        strokeWidth="8"
        strokeLinecap="round"
        fill="none"
      />

      <path
        d="M38 34h52c0 0 2 8-2 12H40c-4-4-2-12-2-12z"
        fill={`url(#rim-${uid})`}
        stroke={p.stroke}
        strokeWidth="1.2"
      />

      <path
        d="M40 46h48l-5 44H45L40 46z"
        fill={`url(#cup-${uid})`}
        stroke={p.stroke}
        strokeWidth="1.2"
      />

      <circle cx="64" cy="62" r="16" fill={p.medallionFill} fillOpacity="0.55" />
      <circle
        cx="64"
        cy="62"
        r="13"
        fill={p.medallionInner}
        stroke={p.medallionStroke}
        strokeWidth="1"
      />
      <text
        x="64"
        y="67"
        textAnchor="middle"
        fill={p.medallionText}
        fontSize="13"
        fontWeight="800"
        fontFamily="system-ui, -apple-system, sans-serif"
        letterSpacing="-0.5"
      >
        BP
      </text>

      <rect x="54" y="88" width="20" height="9" rx="2" fill={p.stem} />
      <rect x="46" y="96" width="36" height="11" rx="3" fill={`url(#base-${uid})`} />
      <rect x="42" y="105" width="44" height="8" rx="2.5" fill={p.baseBar} />

      <defs>
        <linearGradient id={`cup-${uid}`} x1="64" y1="46" x2="64" y2="90">
          <stop stopColor={p.cup[0]} />
          <stop offset="0.35" stopColor={p.cup[1]} />
          <stop offset="1" stopColor={p.cup[2]} />
        </linearGradient>
        <linearGradient id={`rim-${uid}`} x1="64" y1="32" x2="64" y2="48">
          <stop stopColor={p.rim[0]} />
          <stop offset="1" stopColor={p.rim[1]} />
        </linearGradient>
        <linearGradient id={`handle-${uid}`} x1="20" y1="42" x2="108" y2="80">
          <stop stopColor={p.handle[0]} />
          <stop offset="1" stopColor={p.handle[1]} />
        </linearGradient>
        <linearGradient id={`base-${uid}`} x1="46" y1="96" x2="82" y2="107">
          <stop stopColor={p.base[0]} />
          <stop offset="1" stopColor={p.base[1]} />
        </linearGradient>
      </defs>
    </svg>
  );
}
