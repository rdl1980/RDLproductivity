import type { CardItem } from "./board-state";

export type DueFilter = "overdue" | "today" | "week" | "none";
export type StatusFilter = "done" | "open";

export type BoardFilters = {
  /** Label ids; "none" matches cards without labels. */
  labels: string[];
  due: DueFilter | null;
  status: StatusFilter | null;
};

export const NO_LABEL = "none";

export const EMPTY_FILTERS: BoardFilters = { labels: [], due: null, status: null };

const DUE_VALUES: DueFilter[] = ["overdue", "today", "week", "none"];
const STATUS_VALUES: StatusFilter[] = ["done", "open"];

export function parseFilters(params: URLSearchParams): BoardFilters {
  const due = params.get("due");
  const status = params.get("status");
  return {
    labels: (params.get("labels") ?? "").split(",").filter(Boolean),
    due: DUE_VALUES.includes(due as DueFilter) ? (due as DueFilter) : null,
    status: STATUS_VALUES.includes(status as StatusFilter) ? (status as StatusFilter) : null,
  };
}

/** Writes filters into `params`, leaving unrelated keys (e.g. `card`) alone. */
export function writeFilters(params: URLSearchParams, filters: BoardFilters): URLSearchParams {
  const next = new URLSearchParams(params);
  if (filters.labels.length) next.set("labels", filters.labels.join(","));
  else next.delete("labels");
  if (filters.due) next.set("due", filters.due);
  else next.delete("due");
  if (filters.status) next.set("status", filters.status);
  else next.delete("status");
  return next;
}

export function activeFilterCount(filters: BoardFilters) {
  return filters.labels.length + (filters.due ? 1 : 0) + (filters.status ? 1 : 0);
}

const DAY_MS = 24 * 60 * 60 * 1000;

function sameLocalDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function matchesDue(card: CardItem, due: DueFilter, now: Date): boolean {
  if (due === "none") return card.dueDate === null;
  if (!card.dueDate) return false;
  const date = new Date(card.dueDate);
  switch (due) {
    case "overdue":
      return !card.completed && date < now;
    case "today":
      return sameLocalDay(date, now);
    case "week":
      return date >= now && date.getTime() - now.getTime() <= 7 * DAY_MS;
  }
}

export function matchesFilters(card: CardItem, filters: BoardFilters, now: Date = new Date()) {
  if (filters.labels.length > 0) {
    const wantsNone = filters.labels.includes(NO_LABEL);
    const hit =
      (wantsNone && card.labelIds.length === 0) ||
      card.labelIds.some((id) => filters.labels.includes(id));
    if (!hit) return false;
  }
  if (filters.due && !matchesDue(card, filters.due, now)) return false;
  if (filters.status === "done" && !card.completed) return false;
  if (filters.status === "open" && card.completed) return false;
  return true;
}
