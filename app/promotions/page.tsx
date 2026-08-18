import { PageHeader } from "@/components/PageHeader";

const PROMOTIONS = [
  {
    id: "welcome",
    title: "Welcome Bonus",
    description: "100% match on first deposit up to GH₵200",
    tag: "New",
    expires: "Ongoing",
  },
  {
    id: "acca-boost",
    title: "Acca Boost",
    description: "5+ legs — up to 50% extra on winnings",
    tag: "Sports",
    expires: "Weekends",
  },
  {
    id: "cashback",
    title: "Weekly Cashback",
    description: "10% back on net losses every Monday",
    tag: "Loyalty",
    expires: "Weekly",
  },
  {
    id: "freebet",
    title: "Free Bet Friday",
    description: "3 bets in a week → GH₵10 free bet",
    tag: "Free bet",
    expires: "Fridays",
  },
  {
    id: "jackpot-bonus",
    title: "Jackpot Bonus",
    description: "Buy 2 entries, get 1 free on Mega",
    tag: "Jackpot",
    expires: "This month",
  },
  {
    id: "refer",
    title: "Refer a Friend",
    description: "GH₵25 when they place their first bet",
    tag: "Referral",
    expires: "Ongoing",
  },
];

export default function PromotionsPage() {
  return (
    <div className="space-y-4">
      <PageHeader icon="promotions" title="Promotions" subtitle="Bonuses and offers" />

      <ul className="space-y-1.5">
        {PROMOTIONS.map((promo) => (
          <li key={promo.id}>
            <article className="card card-hover p-2.5 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-medium">{promo.title}</h2>
                    <span className="rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] text-muted">
                      {promo.tag}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{promo.description}</p>
                  <p className="mt-1 text-[10px] text-muted/80">{promo.expires}</p>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-md bg-brand px-2.5 py-1 text-[11px] font-medium text-white hover:bg-brand-dark"
                >
                  Claim
                </button>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
}
