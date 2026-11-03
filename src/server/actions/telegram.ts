"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { logActivity } from "@/server/activity";
import { runContentReminder } from "@/server/content-reminder";
import { db } from "@/server/db";
import { issuerFromHeaders } from "@/server/oauth";
import { isAuthenticated } from "@/server/session";
import {
  discoverChat,
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
  await logActivity({
    kind: "telegram.connect",
    summary: `Collegato il bot Telegram @${found.botName}`,
    entityIds: [],
  });
  revalidatePath("/robotti/da-fare");
  return ok({ botName: found.botName });
}

export async function disconnectTelegram(): Promise<ActionResult<null>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  await db.appSetting.deleteMany({
    where: { key: { in: [TELEGRAM_TOKEN_KEY, TELEGRAM_CHAT_KEY, TELEGRAM_BOT_KEY] } },
  });
  await logActivity({
    kind: "telegram.disconnect",
    summary: "Scollegato il bot Telegram",
    entityIds: [],
  });
  revalidatePath("/robotti/da-fare");
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
