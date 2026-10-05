"use server";

import { revalidatePath } from "next/cache";

import { logActivity, q } from "@/server/activity";
import { removeUnreferencedFiles } from "@/server/attachment-storage";
import { db, type Prisma } from "@/server/db";
import { isAuthenticated } from "@/server/session";

import { type ActionResult, fail, idSchema, ok, parse, UNAUTHORIZED } from "./result";

/** Files of the attachments about to be deleted with their card, list or board. */
async function attachmentUrls(where: Prisma.AttachmentWhereInput): Promise<string[]> {
  const rows = await db.attachment.findMany({ where, select: { url: true } });
  return rows.map((row) => row.url);
}

function refresh() {
  revalidatePath("/archive");
  revalidatePath("/boards");
}

export async function restoreBoard(id: string): Promise<ActionResult> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data: boardId, error } = parse(idSchema, id);
  if (error !== null) return fail(error);

  const board = await db.board.findUnique({
    where: { id: boardId },
    select: { title: true, archived: true },
  });
  if (!board) return fail("Board non trovata.");
  await db.board.update({ where: { id: boardId }, data: { archived: false } });
  await logActivity({
    kind: "board.restore",
    summary: `Board ${q(board.title)} ripristinata`,
    boardId,
    entityIds: [boardId],
    undo: [{ op: "update", model: "board", id: boardId, data: { archived: board.archived } }],
  });
  refresh();
  return ok(undefined);
}

/** Restores a list and, if needed, its board. */
export async function restoreList(id: string): Promise<ActionResult> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data: listId, error } = parse(idSchema, id);
  if (error !== null) return fail(error);

  const list = await db.list.findUnique({
    where: { id: listId },
    select: { boardId: true, title: true, archived: true, board: { select: { archived: true } } },
  });
  if (!list) return fail("Lista non trovata.");
  await db.$transaction(async (tx) => {
    await tx.list.update({ where: { id: listId }, data: { archived: false } });
    await tx.board.update({ where: { id: list.boardId }, data: { archived: false } });
    await logActivity(
      {
        kind: "list.restore",
        summary: `Lista ${q(list.title)} ripristinata`,
        boardId: list.boardId,
        entityIds: [listId, list.boardId],
        undo: [
          { op: "update", model: "list", id: listId, data: { archived: list.archived } },
          {
            op: "update",
            model: "board",
            id: list.boardId,
            data: { archived: list.board.archived },
          },
        ],
      },
      tx,
    );
  });
  refresh();
  return ok(undefined);
}

// Permanent deletion is only allowed for archived items, as a safety net.

export async function deleteArchivedBoard(id: string): Promise<ActionResult> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data: boardId, error } = parse(idSchema, id);
  if (error !== null) return fail(error);

  const board = await db.board.findFirst({
    where: { id: boardId, archived: true },
    select: { title: true },
  });
  if (!board) return fail("Solo le board archiviate si possono eliminare.");
  const files = await attachmentUrls({ card: { list: { boardId } } });
  await db.board.delete({ where: { id: boardId } });
  await removeUnreferencedFiles(files);
  await logActivity({
    kind: "board.delete",
    summary: `Board ${q(board.title)} eliminata definitivamente`,
    entityIds: [boardId],
  });
  refresh();
  return ok(undefined);
}

export async function deleteArchivedList(id: string): Promise<ActionResult> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data: listId, error } = parse(idSchema, id);
  if (error !== null) return fail(error);

  const list = await db.list.findFirst({
    where: { id: listId, archived: true },
    select: { title: true, boardId: true },
  });
  if (!list) return fail("Solo le liste archiviate si possono eliminare.");
  const files = await attachmentUrls({ card: { listId } });
  await db.list.delete({ where: { id: listId } });
  await removeUnreferencedFiles(files);
  await logActivity({
    kind: "list.delete",
    summary: `Lista ${q(list.title)} eliminata definitivamente`,
    boardId: list.boardId,
    entityIds: [listId],
  });
  refresh();
  return ok(undefined);
}

export async function deleteArchivedCard(id: string): Promise<ActionResult> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data: cardId, error } = parse(idSchema, id);
  if (error !== null) return fail(error);

  const card = await db.card.findFirst({
    where: { id: cardId, archived: true },
    select: { title: true, list: { select: { boardId: true } } },
  });
  if (!card) return fail("Solo le card archiviate si possono eliminare.");
  const files = await attachmentUrls({ cardId });
  await db.card.delete({ where: { id: cardId } });
  await removeUnreferencedFiles(files);
  await logActivity({
    kind: "card.delete",
    summary: `Card ${q(card.title)} eliminata definitivamente`,
    boardId: card.list.boardId,
    entityIds: [cardId],
  });
  refresh();
  return ok(undefined);
}
