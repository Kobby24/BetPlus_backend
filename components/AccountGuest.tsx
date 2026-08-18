"use client";

import { useAuth } from "@/lib/auth-context";

export function AccountGuest() {
  const { openLogin, openRegister } = useAuth();

  return (
    <div className="-mx-4 -mt-6 md:-mx-6">
      <div className="bg-brand-dark px-4 py-10 text-center text-white">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15">
          <svg
            className="h-8 w-8 text-white/60"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
        </div>
        <h1 className="text-xl font-bold">Welcome to BetPlus</h1>
        <p className="mt-2 text-sm text-white/60">
          Log in to view your balance, bets, and rewards
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={openLogin}
            className="rounded-lg border-2 border-white/40 px-8 py-3 text-sm font-bold text-white hover:bg-white/10"
          >
            Log In
          </button>
          <button
            type="button"
            onClick={openRegister}
            className="rounded-lg bg-brand-accent px-8 py-3 text-sm font-bold text-brand-dark hover:brightness-95"
          >
            Register
          </button>
        </div>
      </div>

      <div className="rounded-t-2xl bg-surface px-4 py-6 text-muted">
        <p className="text-center text-sm">
          Create an account to access deposit, withdraw, bet history, and
          loyalty rewards.
        </p>
      </div>
    </div>
  );
}
