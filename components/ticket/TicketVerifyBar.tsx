"use client";

import { BookingCodeDisplay } from "@/components/BookingCodeDisplay";

interface TicketVerifyBarProps {
  code: string;
}

export function TicketVerifyBar({ code }: TicketVerifyBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b border-brand-soft bg-brand-light px-3 py-2.5 text-xs text-foreground sm:text-sm">
      <span className="text-muted">Verify Code:</span>
      <BookingCodeDisplay
        code={code}
        size="sm"
        tone="accent"
        className="[&_span]:font-mono [&_span]:text-[13px] [&_span]:tracking-wide [&_button]:h-7 [&_button]:w-7"
      />
    </div>
  );
}
