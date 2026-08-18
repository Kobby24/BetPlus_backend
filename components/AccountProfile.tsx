"use client";

import Link from "next/link";
import { useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { useAuth } from "@/lib/auth-context";
import type { IconId } from "@/lib/icons";
import type { User } from "@/lib/user-types";
import { CURRENCY_SYMBOL, formatMoney } from "@/lib/utils";

interface AccountProfileProps {
  user: User;
  onOpenSettings: (tab?: "profile" | "password" | "preferences") => void;
  onLogout: () => void;
}

const QUICK_LINKS: { label: string; href: string; icon: IconId }[] = [
  { label: "Bet History", href: "/bet-history", icon: "bet-history" },
  { label: "Wallet", href: "/wallet", icon: "wallet" },
  { label: "Promotions", href: "/promotions", icon: "promotions" },
];

const MENU_ITEMS: {
  label: string;
  href: string;
  icon: IconId;
  status?: string;
}[] = [
  { label: "Jackpot", href: "/jackpot", icon: "jackpot" },
  { label: "Live Scores", href: "/scores", icon: "live-scores" },
  { label: "Virtual Sports", href: "/virtual", icon: "virtual-sports" },
  { label: "Booking Code", href: "/verify", icon: "booking-code" },
  { label: "Customer Service", href: "/support", status: "Online 24/7", icon: "support" },
  { label: "How to play", href: "/support", icon: "support" },
];

export function AccountProfile({
  user,
  onOpenSettings,
  onLogout,
}: AccountProfileProps) {
  const [balanceVisible, setBalanceVisible] = useState(true);
  const username = user.email.split("@")[0];

  return (
    <div className="-mx-4 -mt-6 md:-mx-6">
      <div className="bg-brand-dark px-4 pb-5 pt-4 text-white">
        <div className="mb-5 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-accent text-lg font-bold text-brand-dark">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <button
                type="button"
                onClick={() => onOpenSettings("profile")}
                className="flex items-center gap-1 text-base font-semibold"
              >
                {username}
                <ChevronRight />
              </button>
              <span className="mt-1 inline-block rounded bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/80">
                Loyalty Tier
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenSettings("profile")}
            className="text-white/80 hover:text-white"
            aria-label="Settings"
          >
            <SettingsIcon />
          </button>
        </div>

        <p className="text-xs text-white/60">Next Update: 11 Jun</p>

        <div className="mt-4">
          <p className="text-sm text-white/70">Total Balance</p>
          <div className="mt-1 flex items-center gap-2">
            <p className="text-3xl font-bold tracking-tight">
              {balanceVisible
                ? formatMoney(user.balance)
                : `${CURRENCY_SYMBOL} ••••••`}
            </p>
            <button
              type="button"
              onClick={() => setBalanceVisible((v) => !v)}
              className="text-white/60 hover:text-white"
              aria-label="Toggle balance visibility"
            >
              <EyeIcon hidden={!balanceVisible} />
            </button>
          </div>
        </div>

        <div className="mt-5 flex gap-2.5">
          <Link
            href="/wallet"
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-accent py-3 text-sm font-bold text-brand-dark shadow-sm transition-colors hover:brightness-95 active:brightness-90"
          >
            <WalletIcon />
            Deposit
          </Link>
          <Link
            href="/wallet"
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/30 bg-white/5 py-3 text-sm font-bold text-white transition-colors hover:border-white/45 hover:bg-white/10"
          >
            <WithdrawIcon />
            Withdraw
          </Link>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-lg bg-white/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">BetPlus Loyalty</span>
            <span className="rounded bg-brand-accent/20 px-1.5 py-0.5 text-[10px] font-bold text-brand-accent">
              +1 Mission
            </span>
          </div>
          <button type="button" className="text-xs font-semibold text-brand-accent">
            Earn Rewards &gt;
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {QUICK_LINKS.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="flex flex-col items-center gap-1.5 rounded-lg bg-white/5 px-2 py-3 text-center transition-colors hover:bg-white/10"
            >
              <AppIcon name={item.icon} size={22} />
              <span className="text-[10px] leading-tight text-white/80">
                {item.label}
              </span>
            </Link>
          ))}
        </div>
      </div>

      <div className="rounded-t-2xl bg-surface text-foreground">
        <ul className="divide-y divide-border">
          {MENU_ITEMS.map((item) => (
            <li key={item.label}>
              <Link
                href={item.href}
                className="flex w-full items-center gap-3 px-4 py-4 text-left"
              >
                <AppIcon name={item.icon} size={24} className="opacity-70" />
                <span className="flex-1 text-sm font-medium">{item.label}</span>
                {item.status && (
                  <span className="text-xs text-muted">{item.status}</span>
                )}
                <ChevronRight className="text-muted" />
              </Link>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => onOpenSettings("profile")}
              className="flex w-full items-center gap-3 px-4 py-4 text-left"
            >
              <AppIcon name="profile" size={24} className="opacity-70" />
              <span className="flex-1 text-sm font-medium">Profile</span>
              <ChevronRight className="text-muted" />
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => onOpenSettings("preferences")}
              className="flex w-full items-center gap-3 px-4 py-4 text-left"
            >
              <AppIcon name="settings" size={24} className="opacity-70" />
              <span className="flex-1 text-sm font-medium">Personal Settings</span>
              <ChevronRight className="text-muted" />
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={onLogout}
              className="flex w-full items-center gap-3 px-4 py-4 text-left text-danger"
            >
              <AppIcon name="logout" size={24} />
              <span className="flex-1 text-sm font-medium">Log Out</span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}

function ChevronRight({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`h-4 w-4 ${className}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function EyeIcon({ hidden }: { hidden: boolean }) {
  return hidden ? (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  ) : (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  );
}

function WithdrawIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}
