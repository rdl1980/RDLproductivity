"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { accountLabel, KDP_ACCOUNT_VALUES, type KdpAccount, todayIn } from "@/lib/kdp";
import { type AccountMatches, accountMismatch, likelyAccount } from "@/lib/kdp-accounts";
import {
  decodeSalesHash,
  formatEuro,
  parseTitleKey,
  salesPayloadSchema,
  salesSyncFrom,
} from "@/lib/kdp-sales";
import { logActivity } from "@/server/activity";
import { db } from "@/server/db";
import { titleMatches } from "@/server/queries/kdp-accounts";
import { salesImportKey, type SalesImportInfo } from "@/server/queries/kdp-sales";
import { isAuthenticated } from "@/server/session";

import { type ActionResult, fail, ok, parse, UNAUTHORIZED } from "./result";

/** The app is single-user: "today" is the owner's. */
const TIME_ZONE = process.env.DEFAULT_TIME_ZONE ?? "Europe/Rome";

const importSchema = z.object({
  account: z.enum(KDP_ACCOUNT_VALUES),
  /** The URL fragment as written by the collector: gzipped, so years of rows stay small. */
  hash: z.string().min(1).max(4_000_000),
});

const date = (key: string) => new Date(`${key}T00:00:00Z`);

/**
 * Replaces the account's sales of the report's titles in its period with the
 * new rows: KDP revises recent figures, so a re-import always wins.
 */
export async function importKdpSales(
  input: z.input<typeof importSchema>,
): Promise<ActionResult<{ rows: number; royalty: number; units: number }>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(importSchema, input);
  if (!data) return fail(error);

  const { account } = data;
  let decoded: unknown;
  try {
    decoded = await decodeSalesHash(data.hash);
  } catch {
    return fail("Il link è incompleto o danneggiato.");
  }
  const { data: payload, error: payloadError } = parse(salesPayloadSchema, decoded);
  if (!payload) return fail(payloadError);
  // The import replaces the account's sales in the period: refuse another
  // account's reports instead of overwriting this one's figures.
  const mismatch = accountMismatch(
    account,
    await titleMatches(payload.rows.map((row) => row[2])),
    "titoli",
  );
  if (mismatch) return fail(mismatch);
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

  const info: SalesImportInfo = {
    importedAt: new Date().toISOString(),
    from: payload.from,
    to: payload.to,
    rows: rows.length,
  };
  await db.$transaction(
    async (tx) => {
      // Only the titles the report knows: a partial report (one title, one
      // marketplace) must not wipe the others.
      await tx.kdpSale.deleteMany({
        where: {
          account,
          date: { gte: date(payload.from), lte: date(payload.to) },
          titleKey: { in: [...new Set(rows.map((row) => row.titleKey))] },
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
  return ok({ rows: rows.length, royalty: Math.round(royalty * 100) / 100, units });
}

const accountOnlySchema = z.object({ account: z.enum(KDP_ACCOUNT_VALUES) });

/** From when the extension should read the Reports for an account (see `salesSyncFrom`). */
export async function getSalesSyncWindow(
  input: z.input<typeof accountOnlySchema>,
): Promise<ActionResult<{ from: string | null; lastImportTo: string | null }>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(accountOnlySchema, input);
  if (!data) return fail(error);
  const setting = await db.appSetting.findUnique({ where: { key: salesImportKey(data.account) } });
  let lastImportTo: string | null = null;
  if (setting) {
    try {
      lastImportTo = (JSON.parse(setting.value) as { to?: string }).to ?? null;
    } catch {
      lastImportTo = null;
    }
  }
  return ok({ from: salesSyncFrom(lastImportTo, todayIn(TIME_ZONE)), lastImportTo });
}

const detectSalesSchema = z.array(z.string().min(1).max(200)).max(20_000);

/** Which account already knows these report titles, to preselect it on the import page. */
export async function detectSalesAccount(
  titleKeys: string[],
): Promise<ActionResult<{ account: KdpAccount | null; matches: AccountMatches }>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(detectSalesSchema, [...new Set(titleKeys)]);
  if (!data) return fail(error);
  const matches = await titleMatches(data);
  return ok({ account: likelyAccount(matches), matches });
}

const aliasSchema = z
  .object({
    account: z.enum(KDP_ACCOUNT_VALUES),
    titleKey: z.string().min(1).max(200),
    /** An imported book of the same account, or a free title; both null remove the alias. */
    bookId: z.string().min(1).max(64).nullable().default(null),
    title: z.string().trim().max(200, "Il titolo è troppo lungo.").nullable().default(null),
  })
  .transform((value) => ({ ...value, title: value.title || null }));

/**
 * Names a title family of the reports that no imported book owns: either as
 * an existing book (its sales join the book's) or with a free title.
 */
export async function setKdpTitleAlias(
  input: z.input<typeof aliasSchema>,
): Promise<ActionResult<{ bookId: string | null; title: string | null }>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(aliasSchema, input);
  if (!data) return fail(error);

  const key = { account: data.account, titleKey: data.titleKey };
  let bookTitle: string | null = null;
  if (data.bookId) {
    const book = await db.kdpBook.findUnique({
      where: { id: data.bookId },
      select: { account: true, title: true },
    });
    if (!book) return fail("Libro non trovato.");
    if (book.account !== data.account) return fail("Il libro è dell'altro account.");
    bookTitle = book.title;
  }
  const previous = await db.kdpTitleAlias.findUnique({
    where: { account_titleKey: key },
    select: { bookId: true, title: true },
  });
  const next = { bookId: data.bookId, title: data.bookId ? null : data.title };
  if (!next.bookId && !next.title) {
    if (!previous) return ok(next);
    await db.kdpTitleAlias.delete({ where: { account_titleKey: key } });
  } else {
    await db.kdpTitleAlias.upsert({
      where: { account_titleKey: key },
      create: { ...key, ...next },
      update: next,
    });
  }
  const asins = Object.values(parseTitleKey(data.titleKey)).filter(Boolean).join(", ");
  await logActivity({
    kind: "kdp.alias",
    summary: next.bookId
      ? `Vendite di ${asins || data.titleKey} assegnate al libro «${bookTitle}» (${accountLabel(data.account)})`
      : next.title
        ? `Vendite di ${asins || data.titleKey} intitolate «${next.title}» (${accountLabel(data.account)})`
        : `Titolo rimosso dalle vendite di ${asins || data.titleKey} (${accountLabel(data.account)})`,
    entityIds: [`alias:${data.account}:${data.titleKey}`],
    undo: [{ op: "kdpAlias", ...key, previous }],
  });
  revalidatePath("/kdp/vendite");
  return ok(next);
}
