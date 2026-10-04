export type DueStatus = "none" | "completed" | "overdue" | "soon" | "upcoming";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Status of a due date relative to `now`: "soon" means within the next 24 hours. */
export function dueStatus(
  due: Date | string | null,
  completed: boolean,
  now: Date = new Date(),
): DueStatus {
  if (!due) return "none";
  if (completed) return "completed";
  const diff = new Date(due).getTime() - now.getTime();
  if (diff < 0) return "overdue";
  if (diff <= DAY_MS) return "soon";
  return "upcoming";
}

export const DUE_STATUS_LABEL: Record<DueStatus, string> = {
  none: "",
  completed: "Completata",
  overdue: "Scaduta",
  soon: "In scadenza",
  upcoming: "",
};

/** Short date in the browser's time zone, e.g. "4 ott" or "4 ott 2027, 18:30". */
export function formatDue(value: Date | string, now: Date = new Date(), timeZone?: string) {
  const date = new Date(value);
  const sameYear =
    new Intl.DateTimeFormat("it-IT", { year: "numeric", timeZone }).format(date) ===
    new Intl.DateTimeFormat("it-IT", { year: "numeric", timeZone }).format(now);
  const parts = new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const day = [get("day"), get("month").replace(".", ""), sameYear ? "" : get("year")]
    .filter(Boolean)
    .join(" ");
  const time = `${get("hour")}:${get("minute")}`;
  return time === "00:00" ? day : `${day}, ${time}`;
}

/** Combines a calendar day (local) and an "HH:mm" time into a Date in local time. */
export function combineDateAndTime(day: Date, time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  const result = new Date(day);
  result.setHours(Number.isFinite(hours) ? hours : 0, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  return result;
}

/** "HH:mm" in local time. */
export function toTimeInput(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
