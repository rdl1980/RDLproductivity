import { auth } from "@/auth";
import { isImage } from "@/lib/attachments";
import { readFileStream } from "@/server/attachment-storage";
import { db } from "@/server/db";

/**
 * Serves a private attachment to the signed-in user. Images render inline;
 * everything else downloads, and nothing may run scripts on our origin.
 */
export async function GET(
  request: Request,
  { params }: RouteContext<"/api/attachments/[attachmentId]">,
) {
  const session = await auth();
  if (!session?.user) return new Response("Non autorizzato", { status: 401 });

  const { attachmentId } = await params;
  const attachment = await db.attachment.findUnique({ where: { id: attachmentId } });
  if (!attachment) return new Response("Non trovato", { status: 404 });
  const file = await readFileStream(attachment.url);
  if (!file) return new Response("File non disponibile", { status: 404 });

  const download = new URL(request.url).searchParams.has("download");
  const inline = isImage(attachment.contentType) && !download;
  const headers = new Headers({
    "Content-Type": inline ? attachment.contentType : "application/octet-stream",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; img-src 'self'; sandbox",
  });
  if (file.size !== null) headers.set("Content-Length", String(file.size));
  return new Response(file.body as BodyInit, { headers });
}
