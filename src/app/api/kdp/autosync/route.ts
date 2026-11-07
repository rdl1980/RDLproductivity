import { z } from "zod";

import { accountLabel, todayIn } from "@/lib/kdp";
import { unitsLabel } from "@/lib/kdp-sale-alerts";
import { addDays } from "@/lib/kdp-sales";
import { autoSyncAccount, recordAutoSyncRun } from "@/server/kdp-autosync";
import { importSalesHash, TIME_ZONE } from "@/server/kdp-sales-import";
import { issuerOf } from "@/server/oauth";

/**
 * The browser extension's hourly sync (see `src/server/kdp-autosync.ts`).
 * GET: which account the token is for, and from which day to read the
 * Reports. POST: the collector's result (`hash`) or the error it hit.
 */

/** Days re-read each hour: today and the days KDP may still be filling in. */
const WINDOW_DAYS = 3;

export async function GET(req: Request) {
  const account = await autoSyncAccount(req.headers.get("authorization"));
  if (!account) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({
    account,
    label: accountLabel(account),
    from: addDays(todayIn(TIME_ZONE), -WINDOW_DAYS),
  });
}

const bodySchema = z.union([
  z.object({ hash: z.string().min(1).max(4_000_000) }),
  z.object({ error: z.string().min(1).max(500) }),
]);

export async function POST(req: Request) {
  const account = await autoSyncAccount(req.headers.get("authorization"));
  if (!account) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "invalid body" }, { status: 400 });
  const at = new Date().toISOString();
  if ("error" in body.data) {
    await recordAutoSyncRun(account, { at, ok: false, message: body.data.error });
    return Response.json({ ok: true });
  }
  const result = await importSalesHash(account, body.data.hash, { baseUrl: issuerOf(req) });
  if (!result.ok) {
    await recordAutoSyncRun(account, { at, ok: false, message: result.error });
    return Response.json({ error: result.error }, { status: 422 });
  }
  const sold = result.alerts.reduce((s, a) => s + a.ebook + a.paperback + a.hardcover, 0);
  let message = sold
    ? `${sold === 1 ? "1 nuova vendita" : `${sold} nuove vendite`}: ${result.alerts.map(unitsLabel).join("; ")}`
    : "Nessuna vendita nuova";
  if (message.length > 300) message = `${message.slice(0, 297)}…`;
  await recordAutoSyncRun(account, { at, ok: true, message });
  return Response.json({ ok: true, rows: result.rows, newUnits: sold });
}
