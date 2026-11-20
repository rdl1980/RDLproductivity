import { CalendarRangeIcon, ListChecksIcon } from "lucide-react";
import Link from "next/link";

import type { ContentProjectConfig } from "@/lib/content";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "calendar", suffix: "", label: "Calendario", icon: CalendarRangeIcon },
  { key: "todo", suffix: "/da-fare", label: "Da fare", icon: ListChecksIcon },
] as const;

/** Switches between a content calendar and its to-do list, as the KDP tabs do. */
export function ContentTabs({
  project,
  current,
  todoCount,
}: {
  project: ContentProjectConfig;
  current: (typeof TABS)[number]["key"];
  todoCount: number;
}) {
  return (
    <nav aria-label={`Sezioni ${project.label}`} className="flex flex-wrap gap-1">
      {TABS.map(({ key, suffix, label, icon: Icon }) => (
        <Link
          key={key}
          href={`${project.path}${suffix}`}
          aria-current={key === current ? "page" : undefined}
          className={cn(
            "flex items-center gap-1.5 border-b-2 px-3 py-0.5 text-sm font-medium transition-colors",
            key === current
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-4" />
          {label}
          {key === "todo" && todoCount > 0 ? (
            <span
              className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground"
              data-testid="todo-count"
            >
              {todoCount}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
