const FAQ = [
  {
    q: "How do I deposit?",
    a: "Wallet → Deposit. Choose Mobile Money, Visa card, USDT, or Bitcoin.",
  },
  {
    q: "How long do withdrawals take?",
    a: "Usually within 24 hours on business days.",
  },
  {
    q: "What is a booking code?",
    a: "A code to load someone else's betslip or verify a ticket.",
  },
];

export default function SupportPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Support</h1>
        <p className="mt-0.5 text-xs text-muted">Help when you need it</p>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {[
          { label: "Chat", desc: "Live agent" },
          { label: "Email", desc: "support@betplus.com" },
          { label: "WhatsApp", desc: "+234 800 BET PLUS" },
        ].map((item) => (
          <button
            key={item.label}
            type="button"
            className="card card-hover p-2 text-left transition-colors"
          >
            <p className="text-xs font-medium">{item.label}</p>
            <p className="mt-0.5 text-[10px] leading-snug text-muted">{item.desc}</p>
          </button>
        ))}
      </div>

      <section>
        <h2 className="section-label mb-1.5">FAQ</h2>
        <div className="space-y-1">
          {FAQ.map((item) => (
            <details key={item.q} className="card group open:bg-surface-elevated/30">
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
                {item.q}
              </summary>
              <p className="border-t border-border/60 px-3 py-2 text-xs text-muted">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
