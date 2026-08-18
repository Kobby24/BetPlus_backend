export function formatOdds(value: number) {
  return value.toFixed(2);
}

export function formatKickoff(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));

  if (diffMs < 0) return "Started";

  if (diffHours < 24) {
    if (diffHours <= 1) return "< 1h";
    return `${diffHours}h`;
  }

  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export const CURRENCY_CODE = "GHS";
export const CURRENCY_SYMBOL = "GH₵";

export function formatCurrency(amount: number) {
  return amount.toLocaleString("en-GH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatMoney(amount: number) {
  return `${CURRENCY_SYMBOL}${formatCurrency(amount)}`;
}

export function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
