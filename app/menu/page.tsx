import Link from "next/link";
import { AppIcon } from "@/components/AppIcon";
import { MENU_CATEGORIES, MENU_ITEMS } from "@/lib/menu-items";

export default function MenuPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">Menu</h1>
        <p className="mt-0.5 text-xs text-muted">Everything in one place</p>
      </div>

      {MENU_CATEGORIES.map((cat) => {
        const items = MENU_ITEMS.filter((m) => m.category === cat.id);
        return (
          <section key={cat.id}>
            <h2 className="section-label mb-1.5 px-0.5">{cat.label}</h2>
            <ul className="card divide-y divide-border/60 overflow-hidden">
              {items.map((item) => (
                <li key={item.href + item.label}>
                  <Link
                    href={item.href}
                    className="card-hover flex items-center gap-2.5 px-3 py-2.5 transition-colors"
                  >
                    <AppIcon name={item.icon} size={20} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="truncate text-[11px] text-muted">
                        {item.description}
                      </p>
                    </div>
                    <span className="text-xs text-muted/60">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
