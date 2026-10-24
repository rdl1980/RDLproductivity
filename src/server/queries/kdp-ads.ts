import "server-only";

import type { KdpAccount } from "@/lib/kdp";
import { type AdRecord, DEFAULT_FX, fxSchema, toEur } from "@/lib/kdp-ads";
import { db } from "@/server/db";

export const adsImportKey = (account: KdpAccount) => `kdp.ads.${account}`;
export const FX_KEY = "kdp.fx";

/** Stored EUR rates per currency, over the defaults. */
export async function getFxRates(): Promise<Record<string, number>> {
  const setting = await db.appSetting.findUnique({ where: { key: FX_KEY } });
  if (!setting) return { ...DEFAULT_FX };
  const parsed = fxSchema.safeParse(JSON.parse(setting.value));
  return { ...DEFAULT_FX, ...(parsed.success ? parsed.data : {}) };
}

/**
 * Every ad row in EUR, resolved to the same book keys as the sales records:
 * `resolve` maps "account:asin" to a sales book key.
 */
export async function getAdRecords(
  resolve: (account: KdpAccount, asin: string) => string | undefined,
): Promise<{ ads: AdRecord[]; fx: Record<string, number>; currencies: string[] }> {
  const [rows, fx] = await Promise.all([
    db.kdpAdSpend.findMany({ orderBy: { date: "asc" } }),
    getFxRates(),
  ]);
  const currencies = [...new Set(rows.map((r) => r.currency))].sort();
  const ads = rows.map((row) => {
    const account = row.account as KdpAccount;
    return {
      d: row.date.toISOString().slice(0, 10),
      a: account,
      book: resolve(account, row.asin) ?? `asin:${row.asin}`,
      asin: row.asin,
      spend: toEur(row.spend, row.currency, fx),
      sales: toEur(row.sales, row.currency, fx),
      clicks: row.clicks,
      impressions: row.impressions,
      orders: row.orders,
    };
  });
  return { ads, fx, currencies };
}
