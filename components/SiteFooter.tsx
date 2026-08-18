import Link from "next/link";

export function SiteFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={`mt-auto border-t border-brand-soft bg-brand-light/50 ${className}`}>
      <div className="mx-auto max-w-7xl px-4 py-6 pb-20 text-center text-xs text-muted">
        <div className="mb-3 flex flex-wrap justify-center gap-4 text-sm">
          <Link href="/support" className="hover:text-brand">Help & Support</Link>
          <Link href="/verify" className="hover:text-brand">Verify Bet</Link>
          <Link href="/promotions" className="hover:text-brand">Promotions</Link>
          <Link href="/wallet" className="hover:text-brand">Wallet</Link>
        </div>
        <p>
          BetPlus is licensed for sports betting entertainment. Please gamble
          responsibly. 18+ only.
        </p>
        <p className="mt-1">© {new Date().getFullYear()} BetPlus. All rights reserved.</p>
      </div>
    </footer>
  );
}
