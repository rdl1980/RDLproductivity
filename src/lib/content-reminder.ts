/**
 * Daily Telegram reminder of the "Da fare" list: at 11:00 (Rome) the items
 * due today or overdue that are still unchecked. Pure functions, tested.
 */
import { CONTENT_TIME_ZONE, type TodoItem } from "./content";

/** Hour (Rome) from which the reminder goes out; later runs catch up once. */
export const REMINDER_HOUR = 11;

/** Hour of the day in the given time zone, 0-23. */
export function hourIn(instant: Date, timeZone = CONTENT_TIME_ZONE): number {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(instant);
  return Number(hour);
}

/** Whether the reminder of `today` should go out now. */
export function reminderDue(
  instant: Date,
  today: string,
  lastSent: string | null,
  timeZone = CONTENT_TIME_ZONE,
): boolean {
  return lastSent !== today && hourIn(instant, timeZone) >= REMINDER_HOUR;
}

/** Open items due today or earlier, oldest first. */
export function reminderItems(open: TodoItem[], today: string): TodoItem[] {
  return open.filter((item) => item.date <= today).sort((a, b) => a.date.localeCompare(b.date));
}

export const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const shortDay = (day: string) => {
  const [, m, d] = day.split("-");
  return `${d}/${m}`;
};

/** Telegram message (HTML parse mode): today's items, then the overdue ones. */
export function reminderMessage(items: TodoItem[], today: string, url: string): string {
  const todays = items.filter((i) => i.date === today);
  const late = items.filter((i) => i.date < today);
  const lines = [`<b>Robotti &amp; Robotte: ${items.length} da fare</b>`];
  if (todays.length) {
    lines.push("", "<b>Oggi</b>", ...todays.map((i) => `• ${escapeHtml(i.text)}`));
  }
  if (late.length) {
    lines.push(
      "",
      "<b>Arretrati</b>",
      ...late.map((i) => `• ${shortDay(i.date)} ${escapeHtml(i.text)}`),
    );
  }
  const link = `<a href="${escapeHtml(url)}">Apri «Da fare»</a>`;
  // Telegram caps a message at 4096 characters: drop whole lines, never a tag.
  const kept: string[] = [];
  let size = link.length + 10;
  for (const line of lines) {
    if (size + line.length + 1 > 4000) {
      kept.push("…");
      break;
    }
    kept.push(line);
    size += line.length + 1;
  }
  return [...kept, "", link].join("\n");
}
