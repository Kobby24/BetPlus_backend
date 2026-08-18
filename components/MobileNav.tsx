"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useBetSlip } from "@/lib/betslip-context";
import { getBetsByUser } from "@/lib/bet-store";
import { getMyBets, useBackendApi } from "@/lib/backend-client";
import { backendBetToPlacedBet } from "@/lib/backend-mappers";

const TABS = [
  { id: "sports", href: "/", label: "Sports", match: ["/"], icon: SportsIcon },
  {
    id: "menu",
    href: "/menu",
    label: "AZ Menu",
    match: [
      "/menu",
      "/virtual",
      "/jackpot",
      "/scores",
      "/wallet",
      "/promotions",
      "/bet-history",
      "/verify",
      "/support",
    ],
    icon: MenuIcon,
  },
  { id: "games", href: "/games", label: "Games", match: ["/games"], icon: GamesIcon },
  {
    id: "open-bets",
    href: "/my-bets",
    label: "Open Bets",
    match: ["/my-bets", "/bet-history", "/bet"],
    icon: OpenBetsIcon,
    showBadge: true,
    opensTickets: true,
  },
  {
    id: "me",
    href: "/account",
    label: "Me",
    match: ["/account"],
    icon: MeIcon,
    requiresAuth: true,
  },
] as const;

function isTabActive(pathname: string, match: readonly string[]) {
  if (match.includes("/") && pathname.startsWith("/match/")) {
    return match.includes("/");
  }
  return match.some(
    (path) =>
      pathname === path ||
      (path !== "/" && pathname.startsWith(`${path}/`)),
  );
}

export function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const backendMode = useBackendApi();
  const { user, openLogin } = useAuth();
  const { openTicketsTab } = useBetSlip();
  const [betsRevision, setBetsRevision] = useState(0);
  const [remoteOpenCount, setRemoteOpenCount] = useState(0);

  useEffect(() => {
    if (!user || !backendMode) {
      setRemoteOpenCount(0);
      return;
    }
    void getMyBets()
      .then((bets) =>
        setRemoteOpenCount(
          bets.map(backendBetToPlacedBet).filter((b) => b.status === "open").length,
        ),
      )
      .catch(() => setRemoteOpenCount(0));
  }, [user, backendMode, betsRevision]);

  useEffect(() => {
    function bump() {
      setBetsRevision((n) => n + 1);
    }

    function onStorage(event: StorageEvent) {
      if (event.key === "betplus_bets" || event.key === "betplus_users") {
        bump();
      }
    }

    window.addEventListener("betplus:balance-updated", bump);
    window.addEventListener("betplus:user-updated", bump);
    window.addEventListener("betplus:bets-updated", bump);
    window.addEventListener("focus", bump);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("betplus:balance-updated", bump);
      window.removeEventListener("betplus:user-updated", bump);
      window.removeEventListener("betplus:bets-updated", bump);
      window.removeEventListener("focus", bump);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const openTicketCount = useMemo(() => {
    if (!user) return 0;
    if (backendMode) return remoteOpenCount;
    return getBetsByUser(user.id).filter((b) => b.status === "open").length;
  }, [user?.id, backendMode, remoteOpenCount, betsRevision]);

  function handleOpenBets() {
    if (typeof window !== "undefined" && window.innerWidth >= 1024) {
      router.push("/my-bets");
      return;
    }
    if (!user) {
      openLogin();
      return;
    }
    openTicketsTab("open-bets");
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-brand-soft bg-surface shadow-[0_-2px_10px_rgb(26_85_104_/_0.08)]">
      <div className="mx-auto flex h-[52px] w-full max-w-none items-stretch pb-[env(safe-area-inset-bottom)]">
        {TABS.map((tab) => {
          const Icon = tab.icon;

          if ("requiresAuth" in tab && tab.requiresAuth && !user) {
            return (
              <button
                key={tab.id}
                type="button"
                onClick={openLogin}
                className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] text-muted"
              >
                <MeIcon active={false} />
                <span>Me</span>
              </button>
            );
          }

          if ("opensTickets" in tab && tab.opensTickets) {
            const active = isTabActive(pathname, tab.match);
            const badge =
              tab.showBadge && openTicketCount > 0 ? openTicketCount : undefined;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={handleOpenBets}
                className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] ${
                  active ? "font-semibold text-brand" : "text-muted"
                }`}
              >
                <span className="relative">
                  <Icon active={active} />
                  {badge !== undefined && (
                    <span className="absolute -right-2 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-brand px-0.5 text-[8px] font-bold text-white">
                      {badge}
                    </span>
                  )}
                </span>
                <span>{tab.label}</span>
              </button>
            );
          }

          if (!("href" in tab)) return null;

          const active = isTabActive(pathname, tab.match);

          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] ${
                active ? "font-semibold text-brand" : "text-muted"
              }`}
            >
              <Icon active={active} />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function SportsIcon({ active }: { active: boolean }) {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.6}>
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" d="M12 3c-2.5 2.5-2.5 15.5 0 18M12 3c2.5 2.5 2.5 15.5 0 18M3 12h18" />
    </svg>
  );
}

function MenuIcon({ active }: { active: boolean }) {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.2 : 1.6}>
      <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function GamesIcon({ active }: { active: boolean }) {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.2 : 1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function OpenBetsIcon({ active }: { active: boolean }) {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.2 : 1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

function MeIcon({ active }: { active: boolean }) {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill={active ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={active ? 0 : 1.6}
    >
      {active ? (
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      )}
    </svg>
  );
}
