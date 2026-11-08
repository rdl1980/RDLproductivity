"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { logActivity } from "@/server/activity";
import { runContentReminder } from "@/server/content-reminder";
import { db } from "@/server/db";
import { issuerFromHeaders } from "@/server/oauth";
import { isAuthenticated } from "@/server/session";
import { ensureWebhook, runSummary } from "@/server/telegram-jobs";
import {
  CAPTURE_LIST_KEY,
  setSetting,
  TELEGRAM_JOBS,
  type TelegramJob,
  thresholdsSchema,
  THRESHOLDS_KEY,
  WEBHOOK_SECRET_KEY,
} from "@/server/telegram-settings";
import {
  discoverChat,
  getTelegramConfig,
  telegramCall,
  TELEGRAM_BOT_KEY,
  TELEGRAM_CHAT_KEY,
  TELEGRAM_TOKEN_KEY,
  TelegramError,
} from "@/server/telegram";

import { type ActionResult, fail, ok, parse, UNAUTHORIZED } from "./result";

const tokenSchema = z
  .string()
  .trim()
  .regex(/^\d{5,}:[\w-]{30,}$/, "Token non valido: è del tipo 123456789:AAE…, da @BotFather.");

const revalidate = () => {
  revalidatePath("/robotti/da-fare");
  revalidatePath("/connections");
};

const save = (key: string, value: string) =>
  db.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });

/**
 * Connects the reminder bot: checks the token, then takes the private chat of
 * the last message sent to the bot (the user writes /start first).
 */
export async function connectTelegram(token: string): Promise<ActionResult<{ botName: string }>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(tokenSchema, token);
  if (data === null) return fail(error);
  let found: Awaited<ReturnType<typeof discoverChat>>;
  try {
    // A webhook (commands) blocks getUpdates: take it down while looking for the chat.
    await telegramCall(data, "deleteWebhook").catch(() => undefined);
    found = await discoverChat(data);
  } catch (e) {
    return fail(e instanceof TelegramError ? e.message : "Errore di rete, riprova.");
  }
  if (!found.chatId) {
    return fail(`Scrivi /start a @${found.botName} su Telegram, poi riprova.`);
  }
  await db.$transaction([
    save(TELEGRAM_TOKEN_KEY, data),
    save(TELEGRAM_CHAT_KEY, found.chatId),
    save(TELEGRAM_BOT_KEY, found.botName),
  ]);
  await setSetting(WEBHOOK_SECRET_KEY, null);
  // Commands and captured messages: best effort, the hourly run retries.
  await ensureWebhook(
    { token: data, chatId: found.chatId, botName: found.botName },
    issuerFromHeaders(await headers()),
    { force: true },
  ).catch(() => undefined);
  await logActivity({
    kind: "telegram.connect",
    summary: `Collegato il bot Telegram @${found.botName}`,
    entityIds: [],
  });
  revalidate();
  return ok({ botName: found.botName });
}

export async function disconnectTelegram(): Promise<ActionResult<null>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const config = await getTelegramConfig();
  if (config) await telegramCall(config.token, "deleteWebhook").catch(() => undefined);
  await db.appSetting.deleteMany({
    where: {
      key: { in: [TELEGRAM_TOKEN_KEY, TELEGRAM_CHAT_KEY, TELEGRAM_BOT_KEY, WEBHOOK_SECRET_KEY] },
    },
  });
  await logActivity({
    kind: "telegram.disconnect",
    summary: "Scollegato il bot Telegram",
    entityIds: [],
  });
  revalidate();
  return ok(null);
}

/** Sends the reminder now, whatever the hour, without counting as today's. */
export async function sendTestReminder(): Promise<ActionResult<{ items: number }>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  try {
    const outcome = await runContentReminder(issuerFromHeaders(await headers()), { test: true });
    if (outcome.status === "not-configured") return fail("Collega prima il bot Telegram.");
    return ok({ items: outcome.status === "sent" ? outcome.items : 0 });
  } catch (e) {
    return fail(e instanceof TelegramError ? e.message : "Invio non riuscito, riprova.");
  }
}

const jobSchema = z.enum(Object.keys(TELEGRAM_JOBS) as [TelegramJob, ...TelegramJob[]]);

/** Turns one of the bot's messages on or off. */
export async function setTelegramJob(job: string, on: boolean): Promise<ActionResult<null>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(z.object({ job: jobSchema, on: z.boolean() }), { job, on });
  if (!data) return fail(error);
  await setSetting(TELEGRAM_JOBS[data.job].key, data.on ? "on" : "off");
  revalidate();
  revalidatePath("/kdp/estensione");
  return ok(null);
}

/** The list that receives the cards captured from plain messages (null: none). */
export async function setTelegramCaptureList(listId: string | null): Promise<ActionResult<null>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  if (listId !== null) {
    const list = await db.list.findFirst({
      where: { id: listId, archived: false, board: { archived: false } },
      select: { id: true },
    });
    if (!list) return fail("Lista non trovata.");
  }
  await setSetting(CAPTURE_LIST_KEY, listId);
  revalidate();
  return ok(null);
}

export async function setTelegramThresholds(input: unknown): Promise<ActionResult<null>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(thresholdsSchema, input);
  if (!data) return fail(error);
  await setSetting(THRESHOLDS_KEY, JSON.stringify(data));
  revalidate();
  return ok(null);
}

/** Sends today's sales summary now, without counting as the 21:00 one. */
export async function sendTestSummary(): Promise<ActionResult<null>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const config = await getTelegramConfig();
  if (!config) return fail("Collega prima il bot Telegram.");
  try {
    await runSummary(config, issuerFromHeaders(await headers()), new Date(), { test: true });
    return ok(null);
  } catch (e) {
    return fail(e instanceof TelegramError ? e.message : "Invio non riuscito, riprova.");
  }
}

/** Points the webhook at the app again, for commands and captured messages. */
export async function enableTelegramCommands(): Promise<ActionResult<null>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const config = await getTelegramConfig();
  if (!config) return fail("Collega prima il bot Telegram.");
  try {
    const outcome = await ensureWebhook(config, issuerFromHeaders(await headers()), {
      force: true,
    });
    if (outcome.startsWith("skipped")) return fail("I comandi funzionano solo con l'app in https.");
    revalidate();
    return ok(null);
  } catch (e) {
    return fail(e instanceof TelegramError ? e.message : "Attivazione non riuscita, riprova.");
  }
}
