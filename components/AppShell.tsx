"use client";

import { usePathname } from "next/navigation";
import { AuthProvider } from "@/lib/auth-context";
import { BetSlipProvider } from "@/lib/betslip-context";
import { AuthModal } from "./AuthModal";
import { ReferralCapture } from "./ReferralCapture";
import { BetSlip } from "./BetSlip";
import { BetSlipBar } from "./BetSlipBar";
import { BetSlipSheet } from "./BetSlipSheet";
import { Header } from "./Header";
import { MobileNav } from "./MobileNav";
import { SiteFooter } from "./SiteFooter";

const NAV_HEIGHT = "calc(3.25rem + env(safe-area-inset-bottom))";

function TicketPageShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Full-screen ticket view — sits above bottom nav, no margins or card chrome */}
      <main
        className="fixed inset-x-0 top-0 z-0 flex flex-col overflow-hidden bg-brand-light"
        style={{ bottom: NAV_HEIGHT }}
      >
        {children}
      </main>
      <MobileNav />
      <BetSlipSheet />
      <AuthModal />
      <ReferralCapture />
    </>
  );
}

function DefaultShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-4 px-3 py-3 pb-[calc(3.25rem+env(safe-area-inset-bottom))] md:pb-4">
        <main className="min-w-0 flex-1">{children}</main>
        <div className="hidden w-80 shrink-0 lg:block">
          <BetSlip />
        </div>
      </div>
      <SiteFooter className="hidden md:block" />
      <MobileNav />
      <BetSlipBar />
      <BetSlipSheet />
      <AuthModal />
      <ReferralCapture />
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith("/admin");
  const isTicketPage = pathname?.startsWith("/bet/");

  if (isAdminRoute) {
    return <>{children}</>;
  }

  return (
    <AuthProvider>
      <BetSlipProvider>
        {isTicketPage ? (
          <TicketPageShell>{children}</TicketPageShell>
        ) : (
          <DefaultShell>{children}</DefaultShell>
        )}
      </BetSlipProvider>
    </AuthProvider>
  );
}
