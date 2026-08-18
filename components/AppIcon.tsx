import Image from "next/image";
import type { IconId } from "@/lib/icons";
import { getIconPath } from "@/lib/icons";

interface AppIconProps {
  name: IconId;
  size?: number;
  className?: string;
  priority?: boolean;
}

export function AppIcon({
  name,
  size = 24,
  className = "",
  priority = false,
}: AppIconProps) {
  return (
    <Image
      src={getIconPath(name)}
      alt=""
      width={size}
      height={size}
      priority={priority}
      className={`shrink-0 object-contain ${className}`}
      aria-hidden
    />
  );
}
