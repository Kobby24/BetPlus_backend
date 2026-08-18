"use client";

import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";

/** Requires a logged-in manager with Manager Mode enabled in Profile. */
export function ManagerGate({ children }: { children: ReactNode }) {
  const { user, isLoading, openLogin, refreshUser, canManage } = useAuth();

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  if (isLoading) {
    return (
      <div className="py-16 text-center text-sm text-muted">
        Loading…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="card py-10 text-center">
        <p className="text-sm text-muted">Log in to open manager tools.</p>
        <button
          type="button"
          onClick={openLogin}
          className="mt-3 rounded-md bg-brand px-4 py-2 text-xs font-semibold text-white"
        >
          Log in
        </button>
      </div>
    );
  }

  if (!user.isManager) {
    return (
      <div className="card py-10 text-center">
        <p className="text-sm font-medium text-brand-dark">Manager access required</p>
        <p className="mt-2 text-xs text-muted">
          Ask an admin to register your account as a manager. You keep the same
          login — then enable Manager Mode under Profile.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block text-xs font-medium text-brand hover:underline"
        >
          Back to Sports
        </Link>
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="card py-10 text-center">
        <p className="text-sm font-medium text-brand-dark">Manager Mode is off</p>
        <p className="mt-2 text-xs text-muted">
          Turn on Manager Mode in your Profile settings to access match control
          and ticket editing tools.
        </p>
        <Link
          href="/account?open=profile"
          className="mt-4 inline-block rounded-md bg-brand px-4 py-2 text-xs font-semibold text-white"
        >
          Open Profile
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
