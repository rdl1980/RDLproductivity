"use client";

import { CheckSquareIcon, ClockIcon, TextIcon } from "lucide-react";
import { useSyncExternalStore } from "react";

import type { CardItem, LabelItem } from "@/lib/board-state";
import { DUE_STATUS_LABEL, dueStatus, formatDue } from "@/lib/due";
import { cn } from "@/lib/utils";

// Dates are rendered in the browser's time zone; the server renders nothing
// for them to avoid hydration mismatches.
const subscribe = () => () => {};
function useIsClient() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

const DUE_STYLES = {
  none: "",
  upcoming: "text-muted-foreground",
  soon: "bg-amber-400 text-amber-950",
  overdue: "bg-red-600 text-white",
  completed: "bg-green-600 text-white",
} as const;

export function DueBadge({
  dueDate,
  completed,
  className,
}: {
  dueDate: string | null;
  completed: boolean;
  className?: string;
}) {
  const isClient = useIsClient();
  if (!dueDate || !isClient) return null;
  const status = dueStatus(dueDate, completed);
  const label = DUE_STATUS_LABEL[status];
  return (
    <span
      data-testid="due-badge"
      data-status={status}
      title={label ? `${label}: ${formatDue(dueDate)}` : formatDue(dueDate)}
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs",
        DUE_STYLES[status],
        className,
      )}
    >
      <ClockIcon className="size-3" />
      {formatDue(dueDate)}
    </span>
  );
}

export function LabelChips({
  labelIds,
  labels,
  size = "sm",
}: {
  labelIds: string[];
  labels: LabelItem[];
  size?: "sm" | "md";
}) {
  const assigned = labels.filter((label) => labelIds.includes(label.id));
  if (assigned.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1" aria-label="Etichette">
      {assigned.map((label) => (
        <li
          key={label.id}
          title={label.name || undefined}
          className={cn(
            "rounded font-medium text-white",
            size === "sm" ? "min-w-10 px-1.5 text-[11px] leading-4" : "px-2 py-1 text-xs",
          )}
          style={{ backgroundColor: label.color }}
        >
          {label.name || " "}
        </li>
      ))}
    </ul>
  );
}

/** Badges shown under the card title in the board view. */
export function CardBadges({ card }: { card: CardItem }) {
  const { done, total } = card.checklist;
  if (!card.dueDate && !card.hasDescription && total === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <DueBadge dueDate={card.dueDate} completed={card.completed} />
      {card.hasDescription && (
        <span title="Questa card ha una descrizione">
          <TextIcon className="size-3.5" aria-label="Descrizione" />
        </span>
      )}
      {total > 0 && (
        <span
          data-testid="checklist-badge"
          className={cn(
            "inline-flex items-center gap-1 rounded px-1.5 py-0.5",
            done === total && "bg-green-600 text-white",
          )}
          title="Elementi della checklist completati"
        >
          <CheckSquareIcon className="size-3" />
          {done}/{total}
        </span>
      )}
    </div>
  );
}
