/** Statistics helpers; week buckets use the browser's local calendar. */

export type WeekBucket = { start: Date; count: number };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Monday 00:00 (local) of the week containing `date`. */
export function startOfWeek(date: Date): Date {
  const day = (date.getDay() + 6) % 7; // Monday = 0
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - day);
}

/** Completions per week for the last `weeks` weeks, oldest first (current week last). */
export function completionsPerWeek(dates: string[], now: Date, weeks = 12): WeekBucket[] {
  const current = startOfWeek(now);
  const buckets: WeekBucket[] = Array.from({ length: weeks }, (_, i) => ({
    start: new Date(
      current.getFullYear(),
      current.getMonth(),
      current.getDate() - 7 * (weeks - 1 - i),
    ),
    count: 0,
  }));
  for (const iso of dates) {
    const week = startOfWeek(new Date(iso)).getTime();
    const bucket = buckets.find((b) => b.start.getTime() === week);
    if (bucket) bucket.count++;
  }
  return buckets;
}

export function countSince(dates: string[], since: Date): number {
  return dates.filter((iso) => new Date(iso) >= since).length;
}

export function daysBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / DAY_MS);
}

/** "3 g" / "12 h" for an average age. */
export function formatDays(days: number): string {
  if (days < 1) return `${Math.round(days * 24)} h`;
  return `${days < 10 ? days.toFixed(1).replace(".", ",") : Math.round(days)} g`;
}

/** Axis maximum: a round number at or above `max` (at least 1). */
export function niceMax(max: number): number {
  if (max <= 1) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= max)! * magnitude;
  return step;
}
