"use client";

import {
  MANAGER_STATUS_LABELS,
  type ManagerMatchStatus,
} from "@/lib/manager-matches-store";

const STATUS_OPTIONS: ManagerMatchStatus[] = [
  "not_started",
  "won",
  "lost",
  "void",
];

interface ManagerStatusSelectProps {
  value: ManagerMatchStatus;
  onChange: (status: ManagerMatchStatus) => void;
  size?: "sm" | "md";
  id?: string;
}

export function ManagerStatusSelect({
  value,
  onChange,
  size = "md",
  id,
}: ManagerStatusSelectProps) {
  const className =
    size === "sm"
      ? "w-full min-w-[120px] rounded-md border border-border bg-white px-2 py-1 text-[10px] font-medium outline-none focus:border-brand"
      : "w-full rounded-md border border-border bg-white px-3 py-2.5 text-sm font-medium outline-none focus:border-brand";

  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value as ManagerMatchStatus)}
      className={className}
    >
      {STATUS_OPTIONS.map((opt) => (
        <option key={opt} value={opt}>
          {MANAGER_STATUS_LABELS[opt]}
        </option>
      ))}
    </select>
  );
}

export { STATUS_OPTIONS };
