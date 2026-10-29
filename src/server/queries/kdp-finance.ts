import "server-only";

import { type KdpAccount, KDP_ACCOUNT_VALUES } from "@/lib/kdp";
import { type MonthlyRoyalty, type Payout, payoutSchedule } from "@/lib/kdp-finance";
import { db } from "@/server/db";

/** Royalty per month and account, oldest first. */
export async function getMonthlyRoyalties(): Promise<MonthlyRoyalty[]> {
  const rows = await db.$queryRaw<
    { month: string; account: string; marketplace: string; royalty: number }[]
  >`
    SELECT to_char("date", 'YYYY-MM') AS month, "account", "marketplace",
      SUM("royalty")::float AS royalty
    FROM "KdpSale" GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`;
  const round = (n: number) => Math.round(n * 100) / 100;
  const byKey = new Map<string, MonthlyRoyalty>();
  for (const row of rows) {
    const key = `${row.month}|${row.account}`;
    const entry = byKey.get(key) ?? {
      month: row.month,
      account: row.account as KdpAccount,
      royalty: 0,
      markets: [],
    };
    entry.royalty += row.royalty;
    entry.markets!.push({ marketplace: row.marketplace, royalty: round(row.royalty) });
    byKey.set(key, entry);
  }
  return [...byKey.values()].map((m) => ({
    ...m,
    royalty: round(m.royalty),
    markets: m.markets!.sort((a, b) => b.royalty - a.royalty),
  }));
}

export async function getPayouts(today: string): Promise<Payout[]> {
  return payoutSchedule(await getMonthlyRoyalties(), today);
}

export type FiscalRow = {
  month: string;
  account: KdpAccount;
  marketplace: string;
  ebookUnits: number;
  paperbackUnits: number;
  hardcoverUnits: number;
  kenp: number;
  royaltyEbook: number;
  royaltyPaperback: number;
  royaltyHardcover: number;
  royaltyKenp: number;
  royalty: number;
};

/** One row per month, account and marketplace of `year`, for the accountant. */
export async function getFiscalRows(year: number): Promise<FiscalRow[]> {
  const rows = await db.$queryRaw<FiscalRow[]>`
    SELECT to_char("date", 'YYYY-MM') AS month, "account", "marketplace",
      SUM("ebookUnits")::int AS "ebookUnits", SUM("paperbackUnits")::int AS "paperbackUnits",
      SUM("hardcoverUnits")::int AS "hardcoverUnits", SUM("kenp")::int AS kenp,
      SUM("royaltyEbook")::float AS "royaltyEbook", SUM("royaltyPaperback")::float AS "royaltyPaperback",
      SUM("royaltyHardcover")::float AS "royaltyHardcover", SUM("royaltyKenp")::float AS "royaltyKenp",
      SUM("royalty")::float AS royalty
    FROM "KdpSale"
    WHERE "date" >= ${new Date(Date.UTC(year, 0, 1))} AND "date" < ${new Date(Date.UTC(year + 1, 0, 1))}
    GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`;
  return rows.map((row) => ({ ...row, account: row.account as KdpAccount }));
}

/** Years with any sales, newest first. */
export async function getSalesYears(): Promise<number[]> {
  const rows = await db.$queryRaw<{ year: number }[]>`
    SELECT DISTINCT EXTRACT(YEAR FROM "date")::int AS year FROM "KdpSale" ORDER BY 1 DESC`;
  return rows.map((row) => row.year);
}

/** Royalty of each account in [from, to], e.g. a month to date or a week. */
export async function getRoyaltyBetween(
  from: string,
  to: string,
): Promise<Record<KdpAccount, { royalty: number; units: number; kenp: number }>> {
  const rows = await db.$queryRaw<
    { account: string; royalty: number; units: number; kenp: number }[]
  >`
    SELECT "account", SUM("royalty")::float AS royalty,
      SUM("ebookUnits" + "paperbackUnits" + "hardcoverUnits")::int AS units, SUM("kenp")::int AS kenp
    FROM "KdpSale"
    WHERE "date" >= ${new Date(`${from}T00:00:00Z`)} AND "date" <= ${new Date(`${to}T00:00:00Z`)}
    GROUP BY 1`;
  const result = Object.fromEntries(
    KDP_ACCOUNT_VALUES.map((a) => [a, { royalty: 0, units: 0, kenp: 0 }]),
  ) as Record<KdpAccount, { royalty: number; units: number; kenp: number }>;
  for (const row of rows) {
    result[row.account as KdpAccount] = {
      royalty: Math.round(row.royalty * 100) / 100,
      units: row.units,
      kenp: row.kenp,
    };
  }
  return result;
}
