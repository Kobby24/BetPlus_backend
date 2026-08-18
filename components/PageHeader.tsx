import { AppIcon } from "@/components/AppIcon";
import type { IconId } from "@/lib/icons";

interface PageHeaderProps {
  icon: IconId;
  title: string;
  subtitle: string;
}

export function PageHeader({ icon, title, subtitle }: PageHeaderProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-brand-soft bg-brand-light">
        <AppIcon name={icon} size={28} />
      </div>
      <div>
        <h1 className="page-title">{title}</h1>
        <p className="mt-0.5 text-xs text-muted">{subtitle}</p>
      </div>
    </div>
  );
}
