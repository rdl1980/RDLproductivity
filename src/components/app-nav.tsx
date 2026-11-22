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
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const aggregateActive = AGGREGATE_LINKS.find(({ href }) => isActive(href));

  return (
    <nav aria-label="Principale" className="flex shrink-0 items-center gap-0.5 text-sm">
      {PRIMARY_LINKS.map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
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
          aria-label={aggregateActive ? `Altro: ${aggregateActive.label}` : "Altro"}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2 py-1.5 font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:px-2.5",
            aggregateActive
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <EllipsisIcon className="size-4" />
          <span className="hidden md:inline">{aggregateActive?.label ?? "Altro"}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" collisionPadding={8} className="w-48">
          {AGGREGATE_LINKS.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <DropdownMenuItem
                key={href}
                asChild
                className={cn(active && "bg-accent font-medium text-accent-foreground")}
              >
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
