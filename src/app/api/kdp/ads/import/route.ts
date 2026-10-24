import { z } from "zod";

import { auth } from "@/auth";
import { accountLabel, KDP_ACCOUNT_VALUES } from "@/lib/kdp";
import { accountMismatch } from "@/lib/kdp-accounts";
import { adRowSchema } from "@/lib/kdp-ads";
import { logActivity } from "@/server/activity";
import { db } from "@/server/db";
import { asinMatches } from "@/server/queries/kdp-accounts";
import { adsImportKey } from "@/server/queries/kdp-ads";

const bodySchema = z.object({
  account: z.enum(KDP_ACCOUNT_VALUES),
  rows: z.array(adRowSchema).min(1).max(100_000),
});

const date = (key: string) => new Date(`${key}T00:00:00Z`);

/**
 * Saves the rows of an Ads report. The account's rows for the report's ASINs
 * and currency (one console per marketplace) in its date range are replaced:
 * Amazon revises recent attribution, so a re-import always wins.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Non autorizzato" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dati non validi." }, { status: 400 });
  const { account, rows } = parsed.data;

  const mismatch = accountMismatch(account, await asinMatches(rows.map((r) => r.asin)), "ASIN");
  if (mismatch) return Response.json({ error: mismatch }, { status: 400 });

  const dates = rows.map((r) => r.date).sort();
  const from = dates[0];
  const to = dates[dates.length - 1];
  const currencies = [...new Set(rows.map((r) => r.currency))];
  await db.$transaction(
    async (tx) => {
      await tx.kdpAdSpend.deleteMany({
        where: {
          account,
          currency: { in: currencies },
          asin: { in: [...new Set(rows.map((r) => r.asin))] },
          date: { gte: date(from), lte: date(to) },
        },
      });
      for (let i = 0; i < rows.length; i += 1000) {
        await tx.kdpAdSpend.createMany({
          data: rows.slice(i, i + 1000).map((r) => ({ ...r, account, date: date(r.date) })),
          skipDuplicates: true,
        });
      }
      const info = JSON.stringify({
        importedAt: new Date().toISOString(),
        from,
        to,
        rows: rows.length,
      });
      await tx.appSetting.upsert({
        where: { key: adsImportKey(account) },
        create: { key: adsImportKey(account), value: info },
        update: { value: info },
      });
    },
    { timeout: 60_000 },
  );
  const spend = rows.reduce((sum, r) => sum + r.spend, 0);
  await logActivity({
    kind: "kdp.ads.import",
    summary: `Spesa Amazon Ads importata (${accountLabel(account)}, ${from} – ${to}): ${rows.length} righe, ${currencies.join("/")} ${spend.toFixed(2)}`,
    entityIds: [],
  });
  return Response.json({ rows: rows.length, from, to, spend, currencies });
}
