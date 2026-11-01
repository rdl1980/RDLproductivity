/**
 * KDP calendar: tasks belong to a week (its Sunday, "YYYY-MM-DD", as KDP's
 * own reporting weeks run Sunday to Saturday) and to one of the accounts. Dates here are calendar dates, computed in UTC so they do
 * not depend on the machine's time zone.
 */

/** The stored values stay stable; the labels are the names shown in the app. */
export const KDP_ACCOUNTS = [
  { value: "main", label: "Rosario" },
  { value: "secondary", label: "Ilaria" },
  { value: "third", label: "NonnoPeppe" },
] as const;

export type KdpAccount = (typeof KDP_ACCOUNTS)[number]["value"];

export const KDP_ACCOUNT_VALUES = KDP_ACCOUNTS.map((account) => account.value) as [
  KdpAccount,
  ...KdpAccount[],
];

export function accountLabel(account: KdpAccount): string {
  return KDP_ACCOUNTS.find((a) => a.value === account)?.label ?? account;
}

/** Each account lane is split into what was planned and what actually happened. */
export const KDP_TRACKS = [
  { value: "planned", label: "Pianificato" },
  { value: "actual", label: "Reale" },
] as const;

export type KdpTrack = (typeof KDP_TRACKS)[number]["value"];

export const KDP_TRACK_VALUES = KDP_TRACKS.map((track) => track.value) as [KdpTrack, ...KdpTrack[]];

export function trackLabel(track: KdpTrack): string {
  return KDP_TRACKS.find((t) => t.value === track)?.label ?? track;
}

/** "Rosario · Reale" */
export function laneLabel(account: KdpAccount, track: KdpTrack): string {
  return `${accountLabel(account)} · ${trackLabel(track)}`;
}

export type KdpTaskItem = {
  id: string;
  title: string;
  notes: string | null;
  account: KdpAccount;
  track: KdpTrack;
  /** Sunday of the week, "YYYY-MM-DD". */
  week: string;
  position: string;
  done: boolean;
};

const DAY = 24 * 60 * 60 * 1000;

function toKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Parses "YYYY-MM-DD" as a UTC date; null when invalid. */
export function parseDateKey(value: string | null | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  const date = new Date(`${match[0]}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && toKey(date) === match[0] ? date : null;
}

/** Sunday of the week containing `day` ("YYYY-MM-DD"); null when invalid. */
export function weekStartOf(day: string): string | null {
  const date = parseDateKey(day);
  if (!date) return null;
  return toKey(new Date(date.getTime() - date.getUTCDay() * DAY));
}

/** Weeks shown by the KDP calendar at once. */
export const WEEKS_SHOWN = 8;

/** `count` consecutive weeks from `start` (a week start). */
export function weeksFrom(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addWeeks(start, i));
}

export function addWeeks(week: string, count: number): string {
  const date = parseDateKey(week);
  if (!date) throw new Error(`Invalid week: ${week}`);
  return toKey(new Date(date.getTime() + count * 7 * DAY));
}

/** Today's date in `timeZone`, "YYYY-MM-DD". */
export function todayIn(timeZone: string, now = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
}

/** "YYYY-MM" or null when invalid. */
export function parseMonth(value: string | null | undefined): string | null {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value ?? "") ? (value as string) : null;
}

export function shiftMonth(month: string, step: number): string {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + step, 1));
  return toKey(date).slice(0, 7);
}

/** Starts of the weeks (Sunday to Saturday) that include a day of `month`. */
export function monthWeeks(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const last = toKey(new Date(Date.UTC(y, m, 0)));
  const weeks: string[] = [];
  for (let week = weekStartOf(`${month}-01`)!; week <= last; week = addWeeks(week, 1)) {
    weeks.push(week);
  }
  return weeks;
}

const dayMonth = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const dayOnly = new Intl.DateTimeFormat("it-IT", { day: "numeric", timeZone: "UTC" });
const dayMonthYear = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "5 – 11 ott" or "29 set – 5 ott". */
export function weekRangeLabel(week: string): string {
  const start = parseDateKey(week)!;
  const end = new Date(start.getTime() + 6 * DAY);
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  return `${(sameMonth ? dayOnly : dayMonth).format(start)} – ${dayMonth.format(end)}`;
}

/** "27 set – 21 nov 2026": from the first day of `first` to the last of `last`. */
export function spanLabel(first: string, last: string): string {
  const start = parseDateKey(first)!;
  const end = new Date(parseDateKey(last)!.getTime() + 6 * DAY);
  return `${dayMonth.format(start)} – ${dayMonthYear.format(end)}`;
}

/** ISO 8601 number of the week whose Sunday is `week` (the Monday after it starts the ISO week). */
export function isoWeekNumber(week: string): number {
  const date = parseDateKey(week)!;
  // The Thursday of the week decides its year.
  const thursday = new Date(date.getTime() + 4 * DAY);
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return Math.floor((thursday.getTime() - yearStart) / (7 * DAY)) + 1;
}

export function monthLabel(month: string): string {
  const label = new Intl.DateTimeFormat("it-IT", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parseDateKey(`${month}-01`)!);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Tasks of one cell, in order. */
export function cellTasks(
  tasks: KdpTaskItem[],
  week: string,
  account: KdpAccount,
  track: KdpTrack,
) {
  return tasks
    .filter((task) => task.week === week && task.account === account && task.track === track)
    .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
}
