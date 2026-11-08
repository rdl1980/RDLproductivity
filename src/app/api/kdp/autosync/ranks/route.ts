import { z } from "zod";

import { autoSyncAccount } from "@/server/kdp-autosync";
import { rankTargets, saveRanks } from "@/server/kdp-ranks";
import { issuerOf } from "@/server/oauth";

/**
 * The extension's daily read of the Amazon product pages (same token as the
 * hourly sales sync). GET: the pages to read. POST: snippets of each page
 * around the rank and reviews markers, parsed here (`src/lib/amazon-rank.ts`).
 */
export async function GET(req: Request) {
  const account = await autoSyncAccount(req.headers.get("authorization"));
  if (!account) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ targets: await rankTargets(account) });
}

const snippet = z.string().max(4000).optional();
const bodySchema = z.object({
  items: z
    .array(
      z.object({
        asin: z.string().regex(/^[A-Z0-9]{10}$/),
        market: z.string().max(4),
        rank: snippet,
        reviews: snippet,
        rating: snippet,
      }),
    )
    .max(200),
});

export async function POST(req: Request) {
  const account = await autoSyncAccount(req.headers.get("authorization"));
  if (!account) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "invalid body" }, { status: 400 });
  return Response.json(await saveRanks(account, body.data.items, issuerOf(req)));
}
