import "server-only";

import { timingSafeEqual } from "node:crypto";

import { CONTENT_TIME_ZONE, dayIn } from "@/lib/content";
import { reminderDue, reminderItems, reminderMessage } from "@/lib/content-reminder";
import { db } from "@/server/db";
import { getContentTodo } from "@/server/queries/content";
import { getTelegramConfig, sendTelegram } from "@/server/telegram";

/** Day (Rome) of the last reminder sent, so hourly runs send it once. */
export const REMINDER_SENT_KEY = "content.reminder.lastSent";
/**
 * Bearer secret of the scheduler (pg_cron in Supabase). It lives in the
 * database the scheduler runs in, so no environment variable has to match it.
 */
export const CRON_SECRET_KEY = "cron.secret";

export async function isValidCronSecret(header: string | null): Promise<boolean> {
  const setting = await db.appSetting.findUnique({ where: { key: CRON_SECRET_KEY } });
  const expected = setting?.value;
  const given = header?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || expected.length < 32) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type ReminderOutcome =
  | { status: "not-configured" }
  | { status: "not-yet" }
  | { status: "already-sent" }
  | { status: "nothing-to-do" }
  | { status: "sent"; items: number };

/**
 * Sends the reminder of today when it is due: from 11:00 Rome, once a day,
 * only when something is due today or overdue. `test` sends now, whatever
 * the hour, without counting as today's reminder.
 */
export async function runContentReminder(
  baseUrl: string,
  { now = new Date(), test = false }: { now?: Date; test?: boolean } = {},
): Promise<ReminderOutcome> {
  const config = await getTelegramConfig();
  if (!config) return { status: "not-configured" };
  const today = dayIn(now, CONTENT_TIME_ZONE);
  if (!test) {
    const last = await db.appSetting.findUnique({ where: { key: REMINDER_SENT_KEY } });
    if (last?.value === today) return { status: "already-sent" };
    if (!reminderDue(now, today, last?.value ?? null)) return { status: "not-yet" };
  }
  const todo = await getContentTodo(now, today);
  const items = reminderItems(todo.open, today);
  const url = `${baseUrl}/robotti/da-fare`;
  if (items.length === 0) {
    if (test) await sendTelegram(config, `Robotti &amp; Robotte: niente da fare oggi. 👍`);
    else await markSent(today);
    return { status: "nothing-to-do" };
  }
  await sendTelegram(config, reminderMessage(items, today, url));
  if (!test) await markSent(today);
  return { status: "sent", items: items.length };
}

async function markSent(today: string) {
  await db.appSetting.upsert({
    where: { key: REMINDER_SENT_KEY },
    create: { key: REMINDER_SENT_KEY, value: today },
    update: { value: today },
  });
}

export type ReminderStatus = {
  /** Bot username when connected. */
  botName: string | null;
  connected: boolean;
  /** Whether the hourly scheduler has its secret, i.e. was set up. */
  scheduled: boolean;
  lastSent: string | null;
};

export async function getReminderStatus(): Promise<ReminderStatus> {
  const [config, secret, last] = await Promise.all([
    getTelegramConfig(),
    db.appSetting.findUnique({ where: { key: CRON_SECRET_KEY } }),
    db.appSetting.findUnique({ where: { key: REMINDER_SENT_KEY } }),
  ]);
  return {
    botName: config?.botName ?? null,
    connected: !!config,
    scheduled: !!secret?.value,
    lastSent: last?.value ?? null,
  };
}
