"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export function TicketDetailsHeader() {
  const router = useRouter();

  return (
    <header className="z-10 flex h-11 shrink-0 items-center justify-between bg-brand-dark px-3 text-white">
      <div className="flex min-w-0 items-center gap-1">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Go back"
          className="mr-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded active:bg-white/10"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="truncate text-[15px] font-semibold">Ticket Details</h1>
      </div>

      <div className="flex shrink-0 items-center gap-4">
        <Link href="/support" aria-label="Support" className="active:opacity-80">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" d="M3 18v-6a9 9 0 1118 0v6" />
            <path strokeLinecap="round" d="M12 21a2 2 0 100-4 2 2 0 000 4z" />
          </svg>
        </Link>
        <Link href="/" aria-label="Home" className="active:opacity-80">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </Link>
      </div>
    </header>
  );
}
