import { auth } from "@/auth";
import { getExportData } from "@/server/queries/export";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const data = await getExportData();
  const date = data.exportedAt.slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="rdlproductivity-backup-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
