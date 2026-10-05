"use server";

import { z } from "zod";

import { ATTACHMENT_STORAGE, isImage, MAX_ATTACHMENTS_PER_CARD } from "@/lib/attachments";
import { logActivity, q } from "@/server/activity";
import { inspectUpload, removeUnreferencedFiles } from "@/server/attachment-storage";
import { db } from "@/server/db";
import { isAuthenticated } from "@/server/session";

import { type ActionResult, fail, idSchema, ok, parse, UNAUTHORIZED } from "./result";

export type AttachmentItem = {
  id: string;
  name: string;
  contentType: string;
  size: number;
  /** ISO string (UTC). */
  createdAt: string;
};

const registerSchema = z.object({
  cardId: idSchema,
  url: z.string().min(1).max(1000),
  name: z.string().trim().min(1).max(255),
  /** Trusted only with the local driver; Vercel Blob reports its own. */
  contentType: z.string().max(100),
});

/** Step two of an upload: verifies the stored file and attaches it to the card. */
export async function registerAttachment(
  input: z.input<typeof registerSchema>,
): Promise<ActionResult<AttachmentItem>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(registerSchema, input);
  if (!data) return fail(error);

  const card = await db.card.findUnique({
    where: { id: data.cardId },
    select: {
      title: true,
      list: { select: { boardId: true } },
      _count: { select: { attachments: true } },
    },
  });
  if (!card) return fail("Card non trovata.");
  if (card._count.attachments >= MAX_ATTACHMENTS_PER_CARD) {
    return fail(`Una card può avere al massimo ${MAX_ATTACHMENTS_PER_CARD} allegati.`);
  }
  // The upload token only allowed this card's folder; check the file is really there.
  const prefix = `cards/${data.cardId}/`;
  const path = data.url.startsWith("local:")
    ? data.url.slice(6)
    : new URL(data.url).pathname.slice(1);
  if (!path.startsWith(prefix)) return fail("File non valido.");
  const stored = await inspectUpload(data.url);
  if (!stored) return fail("Il file caricato non è stato trovato.");

  const contentType =
    ATTACHMENT_STORAGE === "local"
      ? data.contentType || "application/octet-stream"
      : stored.contentType;
  const attachment = await db.attachment.create({
    data: {
      cardId: data.cardId,
      name: data.name,
      url: stored.url,
      contentType,
      size: stored.size,
    },
  });
  await logActivity({
    kind: "attachment.create",
    summary: `Card ${q(card.title)}: allegato ${q(data.name)} aggiunto`,
    boardId: card.list.boardId,
    cardId: data.cardId,
    entityIds: [attachment.id],
  });
  return ok({
    id: attachment.id,
    name: attachment.name,
    contentType: attachment.contentType,
    size: attachment.size,
    createdAt: attachment.createdAt.toISOString(),
  });
}

/** Deletes an attachment and its file (cannot be undone). */
export async function deleteAttachment(id: string): Promise<ActionResult> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data: attachmentId, error } = parse(idSchema, id);
  if (error !== null) return fail(error);

  const attachment = await db.attachment.findUnique({
    where: { id: attachmentId },
    select: {
      name: true,
      url: true,
      cardId: true,
      card: { select: { title: true, list: { select: { boardId: true } } } },
    },
  });
  if (!attachment) return fail("Allegato non trovato.");
  await db.attachment.delete({ where: { id: attachmentId } });
  await removeUnreferencedFiles([attachment.url]);
  await logActivity({
    kind: "attachment.delete",
    summary: `Card ${q(attachment.card.title)}: allegato ${q(attachment.name)} eliminato`,
    boardId: attachment.card.list.boardId,
    cardId: attachment.cardId,
    entityIds: [attachmentId],
  });
  return ok(undefined);
}

const coverSchema = z.object({ cardId: idSchema, attachmentId: idSchema.nullable() });

/** Shows an image attachment on the card in the board (null removes the cover). */
export async function setCardCover(input: z.input<typeof coverSchema>): Promise<ActionResult> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(coverSchema, input);
  if (!data) return fail(error);

  const card = await db.card.findUnique({
    where: { id: data.cardId },
    select: { title: true, coverId: true, list: { select: { boardId: true } } },
  });
  if (!card) return fail("Card non trovata.");
  if (data.attachmentId) {
    const attachment = await db.attachment.findFirst({
      where: { id: data.attachmentId, cardId: data.cardId },
      select: { contentType: true },
    });
    if (!attachment) return fail("Allegato non trovato.");
    if (!isImage(attachment.contentType)) return fail("La copertina deve essere un'immagine.");
  }
  await db.card.update({ where: { id: data.cardId }, data: { coverId: data.attachmentId } });
  await logActivity({
    kind: "card.cover",
    summary: `Card ${q(card.title)}: copertina ${data.attachmentId ? "impostata" : "rimossa"}`,
    boardId: card.list.boardId,
    cardId: data.cardId,
    entityIds: [data.cardId],
    undo: [{ op: "update", model: "card", id: data.cardId, data: { coverId: card.coverId } }],
  });
  return ok(undefined);
}
