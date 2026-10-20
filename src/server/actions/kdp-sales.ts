"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { accountLabel, KDP_ACCOUNT_VALUES } from "@/lib/kdp";
import { decodeSalesHash, formatEuro, parseTitleKey, salesPayloadSchema } from "@/lib/kdp-sales";
import { logActivity } from "@/server/activity";
import { db } from "@/server/db";
import { salesImportKey, type SalesImportInfo } from "@/server/queries/kdp-sales";
import { isAuthenticated } from "@/server/session";

import { type ActionResult, fail, ok, parse, UNAUTHORIZED } from "./result";

const importSchema = z.object({
  account: z.enum(KDP_ACCOUNT_VALUES),
  /** The URL fragment as written by the collector: gzipped, so years of rows stay small. */
  hash: z.string().min(1).max(4_000_000),
});

const date = (key: string) => new Date(`${key}T00:00:00Z`);

/**
 * Replaces the account's sales in the payload's period with its rows: KDP
 * revises recent figures, so a re-import always wins over older data.
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
      await tx.kdpSale.deleteMany({
        where: { account, date: { gte: date(payload.from), lte: date(payload.to) } },
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
