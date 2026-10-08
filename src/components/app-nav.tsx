"use client";

import { CalendarDaysIcon, FlameIcon, LayoutGridIcon, SunIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/boards", label: "Board", icon: LayoutGridIcon },
  { href: "/today", label: "Oggi", icon: SunIcon },
  { href: "/priority", label: "Priorità", icon: FlameIcon },
  { href: "/calendar", label: "Calendario", icon: CalendarDaysIcon },
] as const;

/** Main navigation; the current section is highlighted and announced. */
export function AppNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Principale" className="flex shrink-0 items-center gap-0.5 text-sm">
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            <span className="hidden md:inline">{label}</span>
            <span className="sr-only md:hidden">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
