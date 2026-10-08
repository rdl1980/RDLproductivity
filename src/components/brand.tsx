import Image from "next/image";

import { cn } from "@/lib/utils";

import brandIcon from "./brand-icon.png";

/** App icon (src/app/icon.png is the same artwork, for browsers and home screens). */
export function BrandMark({ className }: { className?: string }) {
  return (
    <Image
      src={brandIcon}
      alt=""
      aria-hidden
      priority
      className={cn("size-8 shrink-0 drop-shadow-sm", className)}
    />
  );
}

export function BrandName({ className }: { className?: string }) {
  return (
    <span className={cn("font-semibold tracking-tight", className)}>
      RDL <span className="font-normal text-muted-foreground">Productivity</span>
    </span>
  );
}
