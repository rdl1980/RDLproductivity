import { z } from "zod";

export const RECURRENCE_RULES = ["daily", "weekdays", "weekly", "monthly", "yearly"] as const;
export type RecurrenceRule = (typeof RECURRENCE_RULES)[number];

export const recurrenceSchema = z.object({
  rule: z.enum(RECURRENCE_RULES),
  /** Every `interval` days/weeks/months/years (ignored for weekdays). */
  interval: z.number().int().min(1).max(365),
  /** IANA time zone the wall-clock time is kept in (e.g. across DST changes). */
  timeZone: z.string().min(1).max(64),
});

export type Recurrence = z.infer<typeof recurrenceSchema>;

/** Units for "ogni N …", singular and plural. */
const UNITS: Record<RecurrenceRule, [string, string]> = {
  daily: ["giorno", "giorni"],
  weekdays: ["giorno lavorativo", "giorni lavorativi"],
  weekly: ["settimana", "settimane"],
  monthly: ["mese", "mesi"],
  yearly: ["anno", "anni"],
};

export function recurrenceUnit(rule: RecurrenceRule, interval: number) {
  return UNITS[rule][interval === 1 ? 0 : 1];
}

export const RECURRENCE_OPTIONS: { value: RecurrenceRule; label: string }[] = [
  { value: "daily", label: "Ogni giorno" },
  { value: "weekdays", label: "Giorni lavorativi (lun-ven)" },
  { value: "weekly", label: "Ogni settimana" },
  { value: "monthly", label: "Ogni mese" },
  { value: "yearly", label: "Ogni anno" },
];

export function describeRecurrence({ rule, interval }: Pick<Recurrence, "rule" | "interval">) {
  if (rule === "weekdays") return "Giorni lavorativi";
  if (interval === 1) return RECURRENCE_OPTIONS.find((o) => o.value === rule)!.label;
  return `Ogni ${interval} ${recurrenceUnit(rule, interval)}`;
}

/** Parses a stored rule, tolerating bad JSON (returns null). */
export function parseRecurrence(value: unknown): Recurrence | null {
  const result = recurrenceSchema.safeParse(value);
  return result.success ? result.data : null;
}

type WallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function wallClock(date: Date, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** UTC instant of a wall-clock time in `timeZone`. */
function fromWallClock(clock: WallClock, timeZone: string): Date {
  const asUtc = Date.UTC(
    clock.year,
    clock.month - 1,
    clock.day,
    clock.hour,
    clock.minute,
    clock.second,
  );
  const offsetAt = (instant: number) => {
    const local = wallClock(new Date(instant), timeZone);
    return (
      Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second) -
      instant
    );
  };
  // Two passes settle the offset around DST changes.
  let instant = asUtc - offsetAt(asUtc);
  instant = asUtc - offsetAt(instant);
  return new Date(instant);
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function step(clock: WallClock, recurrence: Recurrence): WallClock {
  const { rule, interval } = recurrence;
  const shiftDays = (days: number) => {
    const date = new Date(Date.UTC(clock.year, clock.month - 1, clock.day + days));
    return {
      ...clock,
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    };
  };
  switch (rule) {
    case "daily":
      return shiftDays(interval);
    case "weekly":
      return shiftDays(7 * interval);
    case "weekdays": {
      let next = shiftDays(1);
      // 0 = Sunday, 6 = Saturday.
      while ([0, 6].includes(new Date(Date.UTC(next.year, next.month - 1, next.day)).getUTCDay())) {
        next = { ...next, ...nextDay(next) };
      }
      return next;
    }
    case "monthly":
    case "yearly": {
      const months = rule === "monthly" ? interval : 12 * interval;
      const index = clock.month - 1 + months;
      const year = clock.year + Math.floor(index / 12);
      const month = (index % 12) + 1;
      // 31 Jan + 1 month = 28/29 Feb.
      return { ...clock, year, month, day: Math.min(clock.day, daysInMonth(year, month)) };
    }
  }
}

function nextDay(clock: WallClock): Pick<WallClock, "year" | "month" | "day"> {
  const date = new Date(Date.UTC(clock.year, clock.month - 1, clock.day + 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/**
 * Next due date after `due`, keeping its wall-clock time in the rule's time
 * zone. Occurrences that would already be past `now` are skipped.
 */
export function nextOccurrence(due: Date, recurrence: Recurrence, now = new Date()): Date {
  const after = Math.max(due.getTime(), now.getTime());
  let clock = wallClock(due, recurrence.timeZone);
  let next = due;
  // Bounded: daily rules completed years late still terminate.
  for (let i = 0; i < 5000 && next.getTime() <= after; i++) {
    clock = step(clock, recurrence);
    next = fromWallClock(clock, recurrence.timeZone);
  }
  return next;
}
