import "server-only";

import { z } from "zod";

import { type AnomalyThresholds, DEFAULT_THRESHOLDS } from "@/lib/kdp-digest";
import { db } from "@/server/db";
import { SALES_ALERTS_KEY } from "@/server/kdp-sales-import";

/** What the bot does, each switchable from Integrazioni ("off" turns it off). */
export const TELEGRAM_JOBS = {
  reminder: { key: "telegram.job.reminder", label: "Promemoria «Da fare» alle 11:00" },
  summary: { key: "telegram.job.summary", label: "Riepilogo vendite KDP alle 21:00" },
  anomalies: { key: "telegram.job.anomalies", label: "Allarmi KDP alle 9:00" },
  sales: { key: SALES_ALERTS_KEY, label: "Avviso a ogni vendita nuova" },
  reviews: { key: "telegram.job.reviews", label: "Avviso valutazioni nuove su Amazon" },
} as const;
export type TelegramJob = keyof typeof TELEGRAM_JOBS;

/** List that receives the cards captured from plain messages. */
export const CAPTURE_LIST_KEY = "telegram.captureList";
/** Secret Telegram sends back in the webhook header. */
export const WEBHOOK_SECRET_KEY = "telegram.webhookSecret";
export const THRESHOLDS_KEY = "telegram.anomalyThresholds";

export const thresholdsSchema = z.object({
  stallDays: z.number().int().min(3).max(90),
  stallMinUnits: z.number().int().min(1).max(1000),
  kenpDropPct: z.number().int().min(10).max(95),
  adSpendEur: z.number().min(1).max(10_000),
});

export async function getSetting(key: string): Promise<string | null> {
  return (await db.appSetting.findUnique({ where: { key } }))?.value ?? null;
}

export async function setSetting(key: string, value: string | null): Promise<void> {
  if (value === null) {
    await db.appSetting.deleteMany({ where: { key } });
    return;
  }
  await db.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

export async function jobEnabled(job: TelegramJob): Promise<boolean> {
  return (await getSetting(TELEGRAM_JOBS[job].key)) !== "off";
}

export async function getThresholds(): Promise<AnomalyThresholds> {
  const raw = await getSetting(THRESHOLDS_KEY);
  try {
    const parsed = thresholdsSchema.safeParse(JSON.parse(raw ?? "null"));
    return parsed.success ? parsed.data : DEFAULT_THRESHOLDS;
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}

export type TelegramSettings = {
  jobs: Record<TelegramJob, boolean>;
  captureListId: string | null;
  thresholds: AnomalyThresholds;
  commands: boolean;
};

export async function getTelegramSettings(): Promise<TelegramSettings> {
  const rows = await db.appSetting.findMany({
    where: {
      key: {
        in: [
          ...Object.values(TELEGRAM_JOBS).map((j) => j.key),
          CAPTURE_LIST_KEY,
          WEBHOOK_SECRET_KEY,
        ],
      },
    },
  });
  const value = (key: string) => rows.find((r) => r.key === key)?.value ?? null;
  return {
    jobs: Object.fromEntries(
      Object.entries(TELEGRAM_JOBS).map(([job, { key }]) => [job, value(key) !== "off"]),
    ) as Record<TelegramJob, boolean>,
    captureListId: value(CAPTURE_LIST_KEY),
    thresholds: await getThresholds(),
    commands: !!value(WEBHOOK_SECRET_KEY),
  };
}
