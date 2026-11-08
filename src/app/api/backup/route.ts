import { auth } from "@/auth";
import { buildBackup } from "@/server/backup";

/** The full backup as a zip download (the same one the weekly job saves on Drive). */
export async function GET() {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Non autorizzato" }, { status: 401 });
  const backup = await buildBackup();
  return new Response(new Uint8Array(backup.data), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${backup.name}"`,
      "Cache-Control": "no-store",
    },
  });
}
