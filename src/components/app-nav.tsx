"use client";

import {
  BookOpenIcon,
  BotIcon,
  CalendarDaysIcon,
  FeatherIcon,
  FlameIcon,
  LayoutGridIcon,
  EllipsisIcon,
  SunIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const PRIMARY_LINKS = [
  { href: "/boards", label: "Board", icon: LayoutGridIcon },
  { href: "/kdp", label: "KDP", icon: BookOpenIcon },
  { href: "/robotti", label: "Robotti&Robotte", icon: BotIcon },
  { href: "/scrittore", label: "Rosario Di Leva", icon: FeatherIcon },
] as const;

const AGGREGATE_LINKS = [
  { href: "/today", label: "Oggi", icon: SunIcon },
  { href: "/priority", label: "Priorità", icon: FlameIcon },
  { href: "/calendar", label: "Calendario", icon: CalendarDaysIcon },
] as const;

/** Main navigation; the current section is highlighted and announced. */
export function AppNav() {
  const pathname = usePathname();
  const aggregateActive = AGGREGATE_LINKS.some(
    ({ href }) => pathname === href || pathname.startsWith(`${href}/`),
  );

  return (
    <nav aria-label="Principale" className="flex shrink-0 items-center gap-0.5 text-sm">
      {PRIMARY_LINKS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2 py-1.5 font-medium transition-colors md:px-2.5",
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
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Altro"
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2 py-1.5 font-medium transition-colors outline-none md:px-2.5",
            aggregateActive
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <EllipsisIcon className="size-4" />
          <span className="hidden md:inline">Altro</span>
          <span className="sr-only md:hidden">Altro</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          {AGGREGATE_LINKS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <DropdownMenuItem key={href} asChild>
                <Link href={href} aria-current={active ? "page" : undefined}>
                  <Icon />
                  {label}
                </Link>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
