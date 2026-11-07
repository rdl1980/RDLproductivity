import "server-only";

import { timingSafeEqual } from "node:crypto";

import { CONTENT_TIME_ZONE, dayIn, zonedInstant } from "@/lib/content";
import { escapeHtml } from "@/lib/content-reminder";
import { accountLabel, KDP_ACCOUNT_VALUES } from "@/lib/kdp";
import { euro } from "@/lib/kdp-digest";
import { addDays, type SaleRecord } from "@/lib/kdp-sales";
import { HELP_TEXT, parseBotMessage } from "@/lib/telegram-commands";
import { createCard } from "@/server/actions/cards";
import { updateCardDetails } from "@/server/actions/card-details";
import { completeContentTodo } from "@/server/actions/content";
import { todoKey } from "@/lib/content";
import { TELEGRAM_ACTOR_EMAIL } from "@/server/activity";
import { db } from "@/server/db";
import { runAsMcpUser } from "@/server/mcp-context";
import { getCalendarCards } from "@/server/queries/calendar";
import { getContentTodo } from "@/server/queries/content";
import { getSalesData } from "@/server/queries/kdp-sales";
import { getTelegramConfig, sendTelegram } from "@/server/telegram";
import { CAPTURE_LIST_KEY, getSetting, WEBHOOK_SECRET_KEY } from "@/server/telegram-settings";

/** The bot acts as the owner, through the same Server Actions as the UI. */
const OWNER = { email: TELEGRAM_ACTOR_EMAIL };

export async function isValidWebhookSecret(header: string | null): Promise<boolean> {
  const expected = await getSetting(WEBHOOK_SECRET_KEY);
  if (!expected || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Update = { message?: { chat?: { id: number }; text?: string } };

/** Answers one update from Telegram; messages from any other chat are ignored. */
export async function handleUpdate(update: Update, baseUrl: string): Promise<void> {
  const config = await getTelegramConfig();
  const message = update.message;
  if (!config || !message?.chat || String(message.chat.id) !== config.chatId) return;
  if (typeof message.text !== "string") {
    await sendTelegram(config, "Per ora leggo solo messaggi di testo.");
    return;
  }
  const request = parseBotMessage(message.text);
  if (!request) return;
  const reply = (html: string) => sendTelegram(config, html);
  switch (request.kind) {
    case "help":
      return reply(HELP_TEXT);
    case "unknown":
      return reply(`Comando /${escapeHtml(request.command)} sconosciuto.\n\n${HELP_TEXT}`);
    case "today":
      return reply(await todayText(baseUrl));
    case "sales":
      return reply(await salesText(baseUrl));
    case "done":
      return reply(await doneText(request.code));
    case "capture":
      return reply(await capture(request.title, request.description, baseUrl));
  }
}

const hhmm = (iso: string) =>
  new Intl.DateTimeFormat("it-IT", {
    timeZone: CONTENT_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

async function todayText(baseUrl: string): Promise<string> {
  const now = new Date();
  const today = dayIn(now, CONTENT_TIME_ZONE);
  const [cards, todo] = await Promise.all([
    getCalendarCards({
      from: zonedInstant(addDays(today, -30), "00:00"),
      to: zonedInstant(today, "23:59"),
    }),
    getContentTodo(now, today),
  ]);
  const open = cards.filter((c) => !c.completed);
  const items = todo.open.filter((i) => i.date <= today);
  const lines = [`<b>Oggi</b>`];
  lines.push("", `<b>Card in scadenza o scadute (${open.length})</b>`);
  if (open.length === 0) lines.push("Nessuna.");
  for (const c of open.slice(0, 25)) {
    const late = dayIn(new Date(c.dueDate), CONTENT_TIME_ZONE) < today ? "⚠️ " : "";
    lines.push(
      `• ${late}${escapeHtml(c.title)} · ${escapeHtml(c.board.title)} (${hhmm(c.dueDate)})`,
    );
  }
  lines.push("", `<b>Robotti &amp; Robotte da fare (${items.length})</b>`);
  if (items.length === 0) lines.push("Niente in sospeso.");
  for (const i of items.slice(0, 25)) {
    lines.push(
      `• ${i.date < today ? "⚠️ " : ""}${escapeHtml(i.text)}${i.code ? ` [${i.code}]` : ""}`,
    );
  }
  lines.push("", `<a href="${baseUrl}/today">Apri Oggi</a>`);
  return lines.join("\n");
}

async function salesText(baseUrl: string): Promise<string> {
  const today = dayIn(new Date(), CONTENT_TIME_ZONE);
  const yesterday = addDays(today, -1);
  const monthStart = `${today.slice(0, 7)}-01`;
  const data = await getSalesData();
  const sum = (keep: (r: SaleRecord) => boolean) => {
    let units = 0;
    let royalty = 0;
    for (const r of data.records) {
      if (!keep(r)) continue;
      units += r.eu + r.pu + r.hu;
      royalty += r.re + r.rp + r.rh + r.rk;
    }
    return `${units} copie, ${euro(royalty)}`;
  };
  const lines = ["<b>Vendite KDP</b>"];
  for (const account of KDP_ACCOUNT_VALUES) {
    if (!data.records.some((r) => r.a === account && r.d >= addDays(monthStart, -31))) continue;
    const imported = data.imports[account]?.importedAt;
    lines.push(
      "",
      `<b>${escapeHtml(accountLabel(account))}</b>${imported ? ` (dati delle ${hhmm(imported)})` : ""}`,
      `Oggi: ${sum((r) => r.a === account && r.d === today)}`,
      `Ieri: ${sum((r) => r.a === account && r.d === yesterday)}`,
      `Mese: ${sum((r) => r.a === account && r.d >= monthStart && r.d <= today)}`,
    );
  }
  if (lines.length === 1) lines.push("Nessuna vendita importata nell'ultimo mese.");
  lines.push("", `<a href="${baseUrl}/kdp/vendite">Apri Vendite</a>`);
  return lines.join("\n");
}

async function doneText(code: string): Promise<string> {
  if (!code) return "Scrivi il codice della scheda, per esempio /fatto ep001.";
  const now = new Date();
  const today = dayIn(now, CONTENT_TIME_ZONE);
  const todo = await getContentTodo(now, today);
  const items = todo.open.filter((i) => i.code?.toLowerCase() === code && i.date <= today);
  if (items.length === 0) return `Nessuna voce da fare per ${escapeHtml(code)} fino a oggi.`;
  const done: string[] = [];
  const failed: string[] = [];
  for (const item of items) {
    const result = await runAsMcpUser(OWNER, () =>
      completeContentTodo({
        kind: item.kind,
        key: todoKey(item),
        code: item.code,
        platform: item.platform,
      }),
    );
    (result.ok ? done : failed).push(escapeHtml(item.text));
  }
  return [
    done.length ? `✅ Fatte:\n${done.map((t) => `• ${t}`).join("\n")}` : "",
    failed.length ? `Non riuscite:\n${failed.map((t) => `• ${t}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function capture(
  title: string,
  description: string | null,
  baseUrl: string,
): Promise<string> {
  const listId = await getSetting(CAPTURE_LIST_KEY);
  const list = listId
    ? await db.list.findFirst({
        where: { id: listId, archived: false, board: { archived: false } },
        select: { id: true, title: true, board: { select: { id: true, title: true } } },
      })
    : null;
  if (!list) {
    return `Non so dove salvarlo: scegli la lista delle idee in <a href="${baseUrl}/connections">Integrazioni</a>, poi rimanda il messaggio.`;
  }
  const created = await runAsMcpUser(OWNER, () => createCard({ listId: list.id, title }));
  if (!created.ok) return `Card non creata: ${escapeHtml(created.error)}`;
  if (description) {
    await runAsMcpUser(OWNER, () => updateCardDetails({ id: created.data.id, description }));
  }
  return `📝 Card «${escapeHtml(title)}» creata in ${escapeHtml(list.board.title)} → ${escapeHtml(list.title)}.\n<a href="${baseUrl}/boards/${list.board.id}">Apri la board</a>`;
}
