import "server-only";

import { revalidatePath } from "next/cache";

import { accountLabel, type KdpAccount, todayIn } from "@/lib/kdp";
import { accountMismatch } from "@/lib/kdp-accounts";
import { mainTitle } from "@/lib/kdp-books";
import { ALERT_DAYS, newSales, saleAlertMessage, type SaleAlert } from "@/lib/kdp-sale-alerts";
import {
  addDays,
  decodeSalesHash,
  formatEuro,
  parseTitleKey,
  salesPayloadSchema,
} from "@/lib/kdp-sales";
import { logActivity } from "@/server/activity";
import { db } from "@/server/db";
import { parseFormats } from "@/server/queries/kdp-books";
import { titleMatches } from "@/server/queries/kdp-accounts";
import { salesImportKey, type SalesImportInfo } from "@/server/queries/kdp-sales";
import { getTelegramConfig, sendTelegram } from "@/server/telegram";

/** The app is single-user: "today" is the owner's. */
export const TIME_ZONE = process.env.DEFAULT_TIME_ZONE ?? "Europe/Rome";

/** AppSetting: "off" silences the Telegram alerts of new sales. */
export const SALES_ALERTS_KEY = "kdp.salesAlerts";

const date = (key: string) => new Date(`${key}T00:00:00Z`);
const dayOf = (d: Date) => d.toISOString().slice(0, 10);

export type SalesImportResult =
  | { ok: true; rows: number; royalty: number; units: number; alerts: SaleAlert[] }
  | { ok: false; error: string };

/**
 * Replaces the account's sales of the report's titles in its period with the
 * new rows (KDP revises recent figures, so a re-import always wins), then
 * sends a Telegram alert with the units the import added, if any.
 */
export async function importSalesHash(
  account: KdpAccount,
  hash: string,
  { baseUrl }: { baseUrl: string },
): Promise<SalesImportResult> {
  let decoded: unknown;
  try {
    decoded = await decodeSalesHash(hash);
  } catch {
    return { ok: false, error: "Il link è incompleto o danneggiato." };
  }
  const parsed = salesPayloadSchema.safeParse(decoded);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dati non validi." };
  }
  const payload = parsed.data;
  // The import replaces the account's sales in the period: refuse another
  // account's reports instead of overwriting this one's figures.
  const mismatch = accountMismatch(
    account,
    await titleMatches(payload.rows.map((row) => row[2])),
    "titoli",
  );
  if (mismatch) return { ok: false, error: mismatch };
  const rows = payload.rows.map(
    ([d, marketplace, titleKey, eu, pu, hu, kenp, r, re, rp, rh, rk]) => {
      const asins = parseTitleKey(titleKey);
      return {
        account,
        date: date(d),
        marketplace,
        titleKey,
        ebookAsin: asins.ebook,
        paperbackAsin: asins.paperback,
        hardcoverAsin: asins.hardcover,
        ebookUnits: eu,
        paperbackUnits: pu,
        hardcoverUnits: hu,
        kenp,
        royalty: r,
        royaltyEbook: re,
        royaltyPaperback: rp,
        royaltyHardcover: rh,
        royaltyKenp: rk,
      };
    },
  );
  const titleKeys = [...new Set(rows.map((row) => row.titleKey))];
  const info: SalesImportInfo = {
    importedAt: new Date().toISOString(),
    from: payload.from,
    to: payload.to,
    rows: rows.length,
  };
  // Alerts only for the last days, and never on the first import of an account.
  const since = [payload.from, addDays(todayIn(TIME_ZONE), -ALERT_DAYS)].sort().at(-1)!;

  const alerts = await db.$transaction(
    async (tx) => {
      // One import per account at a time: two would deadlock on the delete and insert.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`kdp.sales.${account}`}))`;
      const previousImport = await tx.appSetting.findUnique({
        where: { key: salesImportKey(account) },
      });
      const before = previousImport
        ? await tx.kdpSale.findMany({
            where: { account, date: { gte: date(since) }, titleKey: { in: titleKeys } },
            select: {
              date: true,
              marketplace: true,
              titleKey: true,
              ebookUnits: true,
              paperbackUnits: true,
              hardcoverUnits: true,
              royalty: true,
            },
          })
        : [];
      // Only the titles the report knows: a partial report (one title, one
      // marketplace) must not wipe the others.
      await tx.kdpSale.deleteMany({
        where: {
          account,
          date: { gte: date(payload.from), lte: date(payload.to) },
          titleKey: { in: titleKeys },
        },
      });
      for (let i = 0; i < rows.length; i += 1000) {
        await tx.kdpSale.createMany({ data: rows.slice(i, i + 1000), skipDuplicates: true });
      }
      await tx.appSetting.upsert({
        where: { key: salesImportKey(account) },
        create: { key: salesImportKey(account), value: JSON.stringify(info) },
        update: { value: JSON.stringify(info) },
      });
      if (!previousImport) return [];
      const counts = (r: {
        date: Date;
        marketplace: string;
        titleKey: string;
        ebookUnits: number;
        paperbackUnits: number;
        hardcoverUnits: number;
        royalty: number;
      }) => ({
        date: dayOf(r.date),
        marketplace: r.marketplace,
        titleKey: r.titleKey,
        ebook: r.ebookUnits,
        paperback: r.paperbackUnits,
        hardcover: r.hardcoverUnits,
        royalty: r.royalty,
      });
      return newSales(before.map(counts), rows.map(counts), since);
    },
    { timeout: 120_000 },
  );

  const royalty = rows.reduce((sum, row) => sum + row.royalty, 0);
  const units = rows.reduce(
    (sum, row) => sum + row.ebookUnits + row.paperbackUnits + row.hardcoverUnits,
    0,
  );
  await logActivity({
    kind: "kdp.sales.import",
    summary: `Vendite KDP importate (${accountLabel(account)}, ${payload.from} – ${payload.to}): ${units} copie, ${formatEuro(royalty)} di royalty stimate`,
    entityIds: [],
  });
  revalidatePath("/kdp/vendite");
  if (alerts.length) await notifySales(account, alerts, baseUrl);
  return { ok: true, rows: rows.length, royalty: Math.round(royalty * 100) / 100, units, alerts };
}

/** Best effort: a Telegram failure never fails the import. */
async function notifySales(account: KdpAccount, alerts: SaleAlert[], baseUrl: string) {
  try {
    const [config, setting] = await Promise.all([
      getTelegramConfig(),
      db.appSetting.findUnique({ where: { key: SALES_ALERTS_KEY } }),
    ]);
    if (!config || setting?.value === "off") return;
    const titleOf = await titleResolver(account);
    await sendTelegram(
      config,
      saleAlertMessage(alerts, accountLabel(account), titleOf, `${baseUrl}/kdp/vendite`),
    );
  } catch (error) {
    console.error("KDP sale alert not sent", error);
  }
}

/** Title of a report's title family: the imported book owning one of its ASINs, an alias, or the ASINs. */
async function titleResolver(account: KdpAccount) {
  const [books, aliases] = await Promise.all([
    db.kdpBook.findMany({ where: { account }, select: { title: true, formats: true } }),
    db.kdpTitleAlias.findMany({
      where: { account },
      select: { titleKey: true, title: true, book: { select: { title: true } } },
    }),
  ]);
  const byAsin = new Map<string, string>();
  for (const book of books) {
    for (const f of parseFormats(book.formats))
      if (f.asin) byAsin.set(f.asin, mainTitle(book.title));
  }
  const alias = new Map(
    aliases.map((a) => [a.titleKey, a.book ? mainTitle(a.book.title) : a.title]),
  );
  return (titleKey: string) => {
    const asins = Object.values(parseTitleKey(titleKey)).filter((a): a is string => !!a);
    return (
      asins.map((a) => byAsin.get(a)).find(Boolean) ??
      alias.get(titleKey) ??
      (asins.join(", ") || titleKey)
    );
  };
}
