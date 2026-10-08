"use client";

import { CheckSquareIcon, ClockIcon, PaperclipIcon, RepeatIcon, TextIcon } from "lucide-react";

import type { CardItem, LabelItem } from "@/lib/board-state";
import { isPriority, PRIORITIES } from "@/lib/priority";
import { DUE_STATUS_LABEL, dueStatus, formatDue } from "@/lib/due";
import { labelTextColor } from "@/lib/label-colors";
import { useIsClient } from "@/lib/use-is-client";
import { cn } from "@/lib/utils";

// Dates depend on the browser's clock and time zone: render them after hydration.
const DUE_STYLES = {
  none: "",
  upcoming: "text-muted-foreground",
  soon: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  overdue: "bg-red-700 text-white",
  completed: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
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
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums",
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
            "rounded-md font-medium",
            size === "sm" ? "min-w-10 px-1.5 py-px text-[11px] leading-4" : "px-2 py-1 text-xs",
          )}
          style={{ backgroundColor: label.color, color: labelTextColor(label.color) }}
        >
          {label.name || " "}
        </li>
      ))}
    </ul>
  );
}

export function PriorityBadge({
  priority,
  className,
}: {
  priority: number | null;
  className?: string;
}) {
  if (!isPriority(priority)) return null;
  const { label, name, className: colors } = PRIORITIES[priority];
  return (
    <span
      data-testid="priority-badge"
      title={`Priorità ${label}: ${name}`}
      className={cn(
        "relative rounded-md px-1.5 py-0.5 text-[11px] leading-4 font-semibold tracking-wide",
        colors,
        className,
      )}
    >
      {label}
      <span className="sr-only"> priorità {name}</span>
    </span>
  );
}

/** Badges shown under the card title in the board view. */
export function CardBadges({ card }: { card: CardItem }) {
  const { done, total } = card.checklist;
  if (
    !card.dueDate &&
    !card.hasDescription &&
    total === 0 &&
    card.priority === null &&
    card.attachments === 0
  ) {
    return null;
  }
  const repeat = card.recurring && (
    <span title="Card ricorrente" data-testid="recurring-badge">
      <RepeatIcon className="size-3.5" aria-label="Ricorrente" />
    </span>
  );
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <PriorityBadge priority={card.priority} />
      <DueBadge dueDate={card.dueDate} completed={card.completed} />
      {repeat}
      {card.hasDescription && (
        <span title="Questa card ha una descrizione">
          <TextIcon className="size-3.5" aria-label="Descrizione" />
        </span>
      )}
      {card.attachments > 0 && (
        <span
          className="relative inline-flex items-center gap-1"
          title="Allegati"
          data-testid="attachments-badge"
        >
          <PaperclipIcon className="size-3" aria-hidden />
          {card.attachments}
          <span className="sr-only"> allegati</span>
        </span>
      )}
      {total > 0 && (
        <span
          data-testid="checklist-badge"
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 tabular-nums",
            done === total &&
              "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
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
