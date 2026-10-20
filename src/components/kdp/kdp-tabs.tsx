import { CalendarRangeIcon, LibraryIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

const TABS = [
  { key: "calendar", href: "/kdp", label: "Calendario", icon: CalendarRangeIcon },
  { key: "books", href: "/kdp/libri", label: "Libri e ASIN", icon: LibraryIcon },
] as const;

/** Switches between the KDP calendar and the imported books. */
export function KdpTabs({ current, badge }: { current: "calendar" | "books"; badge?: number }) {
  return (
    <nav aria-label="Sezioni KDP" className="flex gap-1 border-b">
      {TABS.map(({ key, href, label, icon: Icon }) => (
        <Link
          key={key}
          href={href}
          aria-current={key === current ? "page" : undefined}
          className={cn(
            "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            key === current
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-4" />
          {label}
          {key === "books" && badge ? (
            <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
              {badge}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
