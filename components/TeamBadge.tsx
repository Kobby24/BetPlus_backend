interface TeamBadgeProps {
  abbr: string;
  name: string;
  size?: "sm" | "md";
}

export function TeamBadge({ abbr, name, size = "md" }: TeamBadgeProps) {
  const dim = size === "sm" ? "h-7 w-7 text-[10px]" : "h-8 w-8 text-xs";

  return (
    <div className="flex min-w-0 flex-col items-center gap-0.5">
      <div
        className={`flex ${dim} shrink-0 items-center justify-center rounded-full bg-surface-elevated font-semibold text-brand ring-1 ring-border/80`}
        title={name}
      >
        {abbr}
      </div>
      <span className="max-w-[64px] truncate text-center text-[10px] text-muted">
        {name}
      </span>
    </div>
  );
}
