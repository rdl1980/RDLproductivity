import { ContactIcon, TrendingUpIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

const TABS = [
  { key: "sales", href: "/kdp/pen-name", label: "Vendite", icon: TrendingUpIcon },
  { key: "registry", href: "/kdp/pen-name/anagrafica", label: "Anagrafica", icon: ContactIcon },
] as const;

/** Sub-tabs of the Pen name tab: the sales split and the registry. */
export function PenTabs({ current }: { current: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Sezioni Pen name" className="flex flex-wrap gap-1">
      {TABS.map(({ key, href, label, icon: Icon }) => (
        <Link
          key={key}
          href={href}
          aria-current={key === current ? "page" : undefined}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition-colors",
            key === current
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
