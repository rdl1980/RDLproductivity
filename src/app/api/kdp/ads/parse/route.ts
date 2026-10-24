import { auth } from "@/auth";
import { likelyAccount } from "@/lib/kdp-accounts";
import { parseReport } from "@/lib/kdp-ads";
import { readReportTable } from "@/server/kdp-ads-files";
import { asinMatches } from "@/server/queries/kdp-accounts";

/** Reads an Ads report and says which account its ASINs belong to; nothing is saved. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Non autorizzato" }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Nessun file." }, { status: 400 });

  const table = await readReportTable(file);
  if ("error" in table) return Response.json(table, { status: 400 });
  const parsed = parseReport(table);
  if ("error" in parsed) return Response.json(parsed, { status: 400 });

  const matches = await asinMatches(parsed.rows.map((r) => r.asin));
  return Response.json({ ...parsed, account: likelyAccount(matches), matches });
}
