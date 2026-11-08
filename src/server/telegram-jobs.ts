import "server-only";

import { randomBytes } from "node:crypto";

import { CONTENT_TIME_ZONE, dayIn } from "@/lib/content";
import { hourIn } from "@/lib/content-reminder";
import { KDP_ACCOUNT_VALUES, type KdpAccount } from "@/lib/kdp";
import { anomalies, summaryMessage, unsentAnomalies } from "@/lib/kdp-digest";
import { addDays } from "@/lib/kdp-sales";
import { runContentReminder } from "@/server/content-reminder";
import { db } from "@/server/db";
import { runYouTubeMetrics } from "@/server/youtube";
import { runBackupIfDue } from "@/server/backup-job";
import { getSalesData, salesImportKey } from "@/server/queries/kdp-sales";
import {
  getSetting,
  getThresholds,
  jobEnabled,
  setSetting,
  WEBHOOK_SECRET_KEY,
} from "@/server/telegram-settings";
import {
  getTelegramConfig,
  sendTelegram,
  type TelegramConfig,
  telegramCall,
} from "@/server/telegram";

/** Hour (Rome) of each daily message; a missed hour catches up later the same day. */
export const SUMMARY_HOUR = 21;
export const ANOMALY_HOUR = 9;
const SUMMARY_SENT_KEY = "telegram.summary.lastSent";
const ANOMALY_SENT_KEY = "telegram.anomalies.lastSent";
/** { [alert key]: day sent }, so the same alert waits a week before repeating. */
const ANOMALY_LOG_KEY = "telegram.anomalies.log";

type JobOutcome = string;

/** Every hourly job of the bot, called by pg_cron through `/api/cron/hourly`. */
export async function runHourlyJobs(baseUrl: string, now = new Date()) {
  const result: Record<string, JobOutcome> = {};
  // Not a message: the YouTube numbers, once a day from 6:00, Telegram or not.
  try {
    result.youtube = await runYouTubeIfDue(now);
  } catch (error) {
    result.youtube = `error: ${error instanceof Error ? error.message : String(error)}`;
  }
  try {
    result.backup = await runBackupIfDue(now);
  } catch (error) {
    result.backup = `error: ${error instanceof Error ? error.message : String(error)}`;
  }
  const config = await getTelegramConfig();
  if (!config) return { status: "not-configured" as const, ...result };
  const run = async (name: string, job: () => Promise<JobOutcome>) => {
    try {
      result[name] = await job();
    } catch (error) {
      result[name] = `error: ${error instanceof Error ? error.message : String(error)}`;
    }
  };
  await run("webhook", () => ensureWebhook(config, baseUrl));
  await run("reminder", async () =>
    (await jobEnabled("reminder")) ? (await runContentReminder(baseUrl, { now })).status : "off",
  );
  await run("summary", async () =>
    (await jobEnabled("summary")) ? runSummary(config, baseUrl, now) : "off",
  );
  await run("anomalies", async () =>
    (await jobEnabled("anomalies")) ? runAnomalies(config, baseUrl, now) : "off",
  );
  return { status: "ok" as const, ...result };
}

const YOUTUBE_HOUR = 6;
const YOUTUBE_DAY_KEY = "youtube.lastDay";

async function runYouTubeIfDue(now: Date): Promise<JobOutcome> {
  const today = await due(YOUTUBE_DAY_KEY, YOUTUBE_HOUR, now);
  if (!today) return "not-due";
  const run = await runYouTubeMetrics(now);
  if (!run) return "off";
  await setSetting(YOUTUBE_DAY_KEY, today);
  return run.message;
}

async function due(key: string, hour: number, now: Date): Promise<string | null> {
  const today = dayIn(now, CONTENT_TIME_ZONE);
  if (hourIn(now) < hour) return null;
  if ((await getSetting(key)) === today) return null;
  return today;
}

/** Day (Rome) of each account's last sales import. */
async function importDays(): Promise<Partial<Record<KdpAccount, string>>> {
  const rows = await db.appSetting.findMany({
    where: { key: { in: KDP_ACCOUNT_VALUES.map(salesImportKey) } },
  });
  const out: Partial<Record<KdpAccount, string>> = {};
  for (const account of KDP_ACCOUNT_VALUES) {
    const row = rows.find((r) => r.key === salesImportKey(account));
    try {
      const at = (JSON.parse(row?.value ?? "null") as { importedAt?: string } | null)?.importedAt;
      if (at) out[account] = dayIn(new Date(at), CONTENT_TIME_ZONE);
    } catch {
      // ignore
    }
  }
  return out;
}

export async function runSummary(
  config: TelegramConfig,
  baseUrl: string,
  now: Date,
  { test = false } = {},
): Promise<JobOutcome> {
  const today = test
    ? dayIn(now, CONTENT_TIME_ZONE)
    : await due(SUMMARY_SENT_KEY, SUMMARY_HOUR, now);
  if (!today) return "not-due";
  const [data, imports] = await Promise.all([getSalesData(), importDays()]);
  // Accounts with sales this month but no import today: their day is incomplete.
  const monthStart = `${today.slice(0, 7)}-01`;
  const active = new Set(data.records.filter((r) => r.d >= monthStart).map((r) => r.a));
  const stale = KDP_ACCOUNT_VALUES.filter((a) => active.has(a) && imports[a] !== today);
  await sendTelegram(
    config,
    summaryMessage(data.records, data.books, today, stale, `${baseUrl}/kdp/vendite`),
  );
  if (!test) await setSetting(SUMMARY_SENT_KEY, today);
  return "sent";
}

export async function runAnomalies(
  config: TelegramConfig,
  baseUrl: string,
  now: Date,
): Promise<JobOutcome> {
  const today = await due(ANOMALY_SENT_KEY, ANOMALY_HOUR, now);
  if (!today) return "not-due";
  const [data, imports, thresholds, logRaw] = await Promise.all([
    getSalesData(),
    importDays(),
    getThresholds(),
    getSetting(ANOMALY_LOG_KEY),
  ]);
  // Only accounts imported in the last 3 days: older data would read as "stopped".
  const fresh = new Set(
    KDP_ACCOUNT_VALUES.filter((a) => imports[a] && imports[a]! >= addDays(today, -3)),
  );
  // Judge the days KDP has filled in: up to yesterday.
  const found = anomalies(
    data.records,
    data.ads,
    data.books,
    addDays(today, -1),
    fresh,
    thresholds,
  );
  let log: Record<string, string> = {};
  try {
    log = JSON.parse(logRaw ?? "{}") as Record<string, string>;
  } catch {
    log = {};
  }
  const fresh7 = unsentAnomalies(found, log, today);
  await setSetting(ANOMALY_SENT_KEY, today);
  if (fresh7.length === 0) return "nothing";
  await sendTelegram(
    config,
    [
      "<b>Allarmi KDP</b>",
      ...fresh7.slice(0, 30).map((a) => a.text),
      `<a href="${baseUrl}/kdp/vendite">Apri Vendite</a>`,
    ].join("\n"),
  );
  const since = addDays(today, -30);
  const next = Object.fromEntries(Object.entries(log).filter(([, d]) => d >= since));
  for (const a of fresh7) next[a.key] = today;
  await setSetting(ANOMALY_LOG_KEY, JSON.stringify(next));
  return `sent ${fresh7.length}`;
}

/**
 * Points the bot's webhook at the app, so commands and captured messages
 * arrive (Telegram needs https: skipped on localhost).
 */
export async function ensureWebhook(
  config: TelegramConfig,
  baseUrl: string,
  { force = false } = {},
): Promise<JobOutcome> {
  if (!force && (await getSetting(WEBHOOK_SECRET_KEY))) return "ok";
  if (!baseUrl.startsWith("https://") && !process.env.TELEGRAM_API_URL) return "skipped (no https)";
  const secret = randomBytes(24).toString("hex");
  await telegramCall(config.token, "setWebhook", {
    url: `${baseUrl}/api/telegram/webhook`,
    secret_token: secret,
    allowed_updates: ["message"],
  });
  await setSetting(WEBHOOK_SECRET_KEY, secret);
  await telegramCall(config.token, "setMyCommands", {
    commands: [
      { command: "oggi", description: "Scadenze e Da fare di oggi" },
      { command: "vendite", description: "Vendite KDP di oggi, ieri e del mese" },
      { command: "fatto", description: "Segna fatte le voci di una scheda (es. /fatto ep001)" },
      { command: "aiuto", description: "Cosa sa fare il bot" },
    ],
  }).catch(() => undefined);
  return "set";
}
