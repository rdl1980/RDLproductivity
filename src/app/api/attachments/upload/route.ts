import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

import { auth } from "@/auth";
import { ATTACHMENT_STORAGE, MAX_ATTACHMENT_BYTES, storageKey } from "@/lib/attachments";
import { saveLocalFile, uniqueSegment } from "@/server/attachment-storage";
import { db } from "@/server/db";

const unauthorized = () => Response.json({ error: "Non autorizzato" }, { status: 401 });

/** The card id when it names an existing card, else null. */
async function existingCard(cardId: unknown): Promise<string | null> {
  if (typeof cardId !== "string" || cardId.length > 64) return null;
  return (await db.card.count({ where: { id: cardId } })) > 0 ? cardId : null;
}

/**
 * Step one of an upload. With Vercel Blob it issues a short-lived client token
 * scoped to the card's folder (the browser then uploads directly); with the
 * local driver it stores the posted file. Either way the client then calls
 * `registerAttachment`, which verifies the file.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return unauthorized();

  if (ATTACHMENT_STORAGE === "local") {
    const form = await request.formData();
    const file = form.get("file");
    const cardId = await existingCard(form.get("cardId"));
    if (!(file instanceof File) || !cardId) {
      return Response.json({ error: "Richiesta non valida." }, { status: 400 });
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      return Response.json({ error: "Il file è troppo grande." }, { status: 413 });
    }
    const key = storageKey(cardId, file.name, uniqueSegment());
    const url = await saveLocalFile(key, Buffer.from(await file.arrayBuffer()));
    return Response.json({ url });
  }

  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const payload = JSON.parse(clientPayload ?? "{}") as { cardId?: unknown };
        const cardId = await existingCard(payload.cardId);
        if (!cardId || !pathname.startsWith(`cards/${cardId}/`)) {
          throw new Error("Card non valida.");
        }
        return {
          maximumSizeInBytes: MAX_ATTACHMENT_BYTES,
          addRandomSuffix: false,
          allowOverwrite: false,
          validUntil: Date.now() + 10 * 60 * 1000,
        };
      },
    });
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Upload non riuscito." },
      { status: 400 },
    );
  }
}
