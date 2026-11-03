import "server-only";

import { db } from "@/server/db";

/**
 * Telegram bot of the reminders. The token and the chat live in AppSetting,
 * entered from the "Da fare" tab, so nothing has to be set on Vercel.
 */
export const TELEGRAM_TOKEN_KEY = "telegram.botToken";
export const TELEGRAM_CHAT_KEY = "telegram.chatId";
export const TELEGRAM_BOT_KEY = "telegram.botName";

/** Overridable in tests, to point at a stub server. */
const apiBase = () => process.env.TELEGRAM_API_URL ?? "https://api.telegram.org";

export class TelegramError extends Error {}

export async function telegramCall<T>(
  token: string,
  method: string,
  body?: Record<string, unknown>,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBase()}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new TelegramError("Telegram non risponde, riprova.");
  }
  const json = (await response.json().catch(() => null)) as {
    ok?: boolean;
    result?: T;
    description?: string;
  } | null;
  if (!json?.ok) {
    if (response.status === 401 || response.status === 404) {
      throw new TelegramError("Token del bot non valido.");
    }
    throw new TelegramError(`Telegram: ${json?.description ?? `errore ${response.status}`}`);
  }
  return json.result as T;
}

export type TelegramConfig = { token: string; chatId: string; botName: string | null };

export async function getTelegramConfig(): Promise<TelegramConfig | null> {
  const rows = await db.appSetting.findMany({
    where: { key: { in: [TELEGRAM_TOKEN_KEY, TELEGRAM_CHAT_KEY, TELEGRAM_BOT_KEY] } },
  });
  const value = (key: string) => rows.find((r) => r.key === key)?.value || null;
  const token = value(TELEGRAM_TOKEN_KEY);
  const chatId = value(TELEGRAM_CHAT_KEY);
  return token && chatId ? { token, chatId, botName: value(TELEGRAM_BOT_KEY) } : null;
}

export async function sendTelegram(config: TelegramConfig, html: string): Promise<void> {
  await telegramCall(config.token, "sendMessage", {
    chat_id: config.chatId,
    text: html,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });
}

type Update = { message?: { chat?: { id: number; type: string } } };

/** The bot's name and the private chat of whoever last wrote to it. */
export async function discoverChat(
  token: string,
): Promise<{ botName: string; chatId: string | null }> {
  const me = await telegramCall<{ username: string }>(token, "getMe");
  const updates = await telegramCall<Update[]>(token, "getUpdates", {
    allowed_updates: ["message"],
  });
  const chat = updates
    .map((u) => u.message?.chat)
    .filter((c) => c?.type === "private")
    .at(-1);
  return { botName: me.username, chatId: chat ? String(chat.id) : null };
}
