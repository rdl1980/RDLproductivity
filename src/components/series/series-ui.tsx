import type { BookStage, PublishedOn, SeriesStatus } from "@/lib/kdp-series-catalog";
import { seriesStatusLabel, stageLabel } from "@/lib/kdp-series-catalog";
import { cn } from "@/lib/utils";

export const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** "2026-11-08" → "08/11/2026" (calendar dates, no time zone). */
export function dateLabel(key: string): string {
  return `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`;
}

const STAGE_STYLES: Record<BookStage, string> = {
  idea: "bg-muted text-muted-foreground",
  working: "bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-200",
  ready: "bg-sky-100 text-sky-900 dark:bg-sky-400/15 dark:text-sky-200",
  published: "bg-emerald-100 text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-200",
};

export function StageBadge({ stage }: { stage: BookStage }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
        STAGE_STYLES[stage],
      )}
      data-testid="stage"
    >
      {stageLabel(stage)}
    </span>
  );
}

const STATUS_STYLES: Record<SeriesStatus, string> = {
  active: "bg-emerald-100 text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-200",
  paused: "bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-200",
  completed: "bg-muted text-muted-foreground",
};

export function SeriesStatusBadge({ status }: { status: SeriesStatus }) {
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", STATUS_STYLES[status])}>
      {seriesStatusLabel(status)}
    </span>
  );
}

const SOURCE_HINTS: Record<PublishedOn["source"], string> = {
  manual: "Data impostata a mano",
  task: "Settimana in cui l'import del Bookshelf ha visto il libro Online (attività Reale)",
  sale: "Giorno della prima vendita nei report KDP",
};

/** Publication date with where it comes from. */
export function PublishedLabel({ published }: { published: PublishedOn }) {
  const text =
    published.source === "task"
      ? `sett. del ${dateLabel(published.date)}`
      : published.before
        ? `entro il ${dateLabel(published.date)}`
        : dateLabel(published.date);
  const hint = published.before
    ? `${SOURCE_HINTS.sale}: i report iniziano quel giorno, il libro può essere uscito prima`
    : SOURCE_HINTS[published.source];
  return (
    <span className="flex flex-col">
      <span className="tabular-nums">{text}</span>
      <span className="text-xs text-muted-foreground" title={hint}>
        {published.source === "manual"
          ? "a mano"
          : published.source === "task"
            ? "da attività Online"
            : "da prima vendita"}
      </span>
    </span>
  );
}
