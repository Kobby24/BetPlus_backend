"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { formatMoney } from "@/lib/utils";
import { BetSlipTrigger } from "./BetSlipTrigger";

/** Drop your PNG here: public/brand/logo.png */
const LOGO_SRC = "/brand/logo.png";

export function Header() {
  const pathname = usePathname();
  const { user, openLogin, openRegister } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-brand/20 bg-brand-dark text-white shadow-sm">
      <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-3">
        <Link
          href="/"
          className="-ml-3 flex h-12 shrink-0 items-end overflow-hidden bg-white pl-3 pr-4 sm:pr-5"
        >
          <Image
            src={LOGO_SRC}
            alt="BetPlus"
            width={480}
            height={480}
            priority
            className="mb-px h-[3.25rem] w-auto max-w-none object-contain object-bottom sm:h-14"
          />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {[
            { href: "/", label: "Sports", match: (p: string) => p === "/" || p.startsWith("/match/") },
            { href: "/live", label: "Live", match: (p: string) => p.startsWith("/live") },
            { href: "/games", label: "Games", match: (p: string) => p.startsWith("/games") },
            { href: "/leagues", label: "Leagues", match: (p: string) => p.startsWith("/leagues") },
            { href: "/verify", label: "Verify", match: (p: string) => p.startsWith("/verify") },
            { href: "/menu", label: "Menu", match: (p: string) => p.startsWith("/menu") },
          ].map((tab) => {
            const active = tab.match(pathname);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-white/15 font-semibold text-white"
                    : "text-white/75 hover:bg-white/10 hover:text-white"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <BetSlipTrigger className="rounded-full p-1.5 text-white hover:bg-white/10" />
          {user ? (
            <Link
              href="/account"
              className="flex items-center gap-2 rounded-full bg-white/10 px-2.5 py-1 hover:bg-white/15"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">
                {user.name.charAt(0).toUpperCase()}
              </span>
              <span className="hidden text-xs font-semibold text-brand-accent sm:block">
                {formatMoney(user.balance)}
              </span>
            </Link>
          ) : (
            <>
              <button
                type="button"
                onClick={openLogin}
                className="text-sm font-medium text-white/90 hover:text-white"
              >
                Login
              </button>
              <button
                type="button"
                onClick={openRegister}
                className="rounded-full bg-brand-accent px-3.5 py-1.5 text-sm font-semibold text-brand-dark hover:brightness-95"
              >
                Register
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
