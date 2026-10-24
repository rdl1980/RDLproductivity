import "server-only";

import { KDP_ACCOUNT_VALUES, type KdpAccount } from "@/lib/kdp";
import type { KdpFreshness } from "@/lib/kdp-freshness";
import { db } from "@/server/db";
import { type SalesImportInfo, salesImportKey } from "@/server/queries/kdp-sales";

/** When each account's sales and books were last imported. */
export async function getKdpFreshness(): Promise<KdpFreshness> {
  const [settings, books] = await Promise.all([
    db.appSetting.findMany({
      where: { key: { in: KDP_ACCOUNT_VALUES.map(salesImportKey) } },
    }),
    db.kdpBook.groupBy({ by: ["account"], _max: { importedAt: true } }),
  ]);
  const freshness = Object.fromEntries(
    KDP_ACCOUNT_VALUES.map((account) => [account, { sales: null, books: null }]),
  ) as KdpFreshness;
  for (const setting of settings) {
    const account = setting.key.slice("kdp.sales.".length) as KdpAccount;
    try {
      freshness[account].sales = (JSON.parse(setting.value) as SalesImportInfo).importedAt;
    } catch {
      // Malformed setting: rewritten by the next import.
    }
  }
  for (const group of books) {
    freshness[group.account as KdpAccount].books = group._max.importedAt?.toISOString() ?? null;
  }
  return freshness;
}
