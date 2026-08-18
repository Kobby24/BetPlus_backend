interface CountryFlagProps {
  code: string;
  className?: string;
  size?: "sm" | "md";
}

export function CountryFlag({
  code,
  className = "",
  size = "sm",
}: CountryFlagProps) {
  const dims = size === "sm" ? "h-4 w-6" : "h-5 w-7";

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/w40/${code}.png`}
      alt=""
      className={`${dims} shrink-0 rounded-sm border border-border/40 object-cover ${className}`}
      loading="lazy"
    />
  );
}
