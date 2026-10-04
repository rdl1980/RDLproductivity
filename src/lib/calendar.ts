import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
} from "date-fns";

export type CalendarView = "month" | "week";

const WEEK = { weekStartsOn: 1 } as const;

/** Local calendar day as "YYYY-MM-DD". */
export function dayKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parses "YYYY-MM-DD" as a local date (midnight); null when invalid. */
export function parseDayKey(value: string | null | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
    ? date
    : null;
}

/** Days shown for `anchor`: full weeks (Monday first) covering the month, or one week. */
export function visibleDays(anchor: Date, view: CalendarView): Date[] {
  if (view === "week") {
    const start = startOfWeek(anchor, WEEK);
    return eachDayOfInterval({ start, end: addDays(start, 6) });
  }
  return eachDayOfInterval({
    start: startOfWeek(startOfMonth(anchor), WEEK),
    end: endOfWeek(endOfMonth(anchor), WEEK),
  });
}

export function shiftAnchor(anchor: Date, view: CalendarView, step: 1 | -1) {
  return view === "week" ? addWeeks(anchor, step) : addMonths(anchor, step);
}

/** Same local time of day as `due`, on `day`. */
export function moveToDay(due: Date, day: Date): Date {
  const result = new Date(day);
  result.setHours(due.getHours(), due.getMinutes(), due.getSeconds(), due.getMilliseconds());
  return result;
}

/**
 * UTC range the server must load so that every visible day is covered in any
 * time zone (± 14h): the visible weeks plus a day of padding on each side.
 */
export function serverRange(anchorUtc: Date, view: CalendarView) {
  const days = visibleDays(anchorUtc, view);
  return { from: addDays(days[0], -2), to: addDays(days[days.length - 1], 2) };
}
