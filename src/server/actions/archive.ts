"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/server/db";
import { isAuthenticated } from "@/server/session";

import { type ActionResult, fail, idSchema, ok, parse, UNAUTHORIZED } from "./result";

function refresh() {
  revalidatePath("/archive");
  revalidatePath("/boards");
}

export async function restoreBoard(id: string): Promise<ActionResult> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data: boardId, error } = parse(idSchema, id);
  if (error !== null) return fail(error);

  const { count } = await db.board.updateMany({
    where: { id: boardId },
    data: { archived: false },
  });
  if (count === 0) return fail("Board non trovata.");
  refresh();
  return ok(undefined);
}

/** Restores a list and, if needed, its board. */
export async function restoreList(id: string): Promise<ActionResult> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data: listId, error } = parse(idSchema, id);
  if (error !== null) return fail(error);

  const list = await db.list.findUnique({ where: { id: listId }, select: { boardId: true } });
  if (!list) return fail("Lista non trovata.");
  await db.$transaction([
    db.list.update({ where: { id: listId }, data: { archived: false } }),
    db.board.update({ where: { id: list.boardId }, data: { archived: false } }),
  ]);
  refresh();
  return ok(undefined);
}

// Permanent deletion is only allowed for archived items, as a safety net.

export async function deleteArchivedBoard(id: string): Promise<ActionResult> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data: boardId, error } = parse(idSchema, id);
  if (error !== null) return fail(error);

  const { count } = await db.board.deleteMany({ where: { id: boardId, archived: true } });
  if (count === 0) return fail("Solo le board archiviate si possono eliminare.");
  refresh();
  return ok(undefined);
}

export async function deleteArchivedList(id: string): Promise<ActionResult> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data: listId, error } = parse(idSchema, id);
  if (error !== null) return fail(error);

  const { count } = await db.list.deleteMany({ where: { id: listId, archived: true } });
  if (count === 0) return fail("Solo le liste archiviate si possono eliminare.");
  refresh();
  return ok(undefined);
}

export async function deleteArchivedCard(id: string): Promise<ActionResult> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data: cardId, error } = parse(idSchema, id);
  if (error !== null) return fail(error);

  const { count } = await db.card.deleteMany({ where: { id: cardId, archived: true } });
  if (count === 0) return fail("Solo le card archiviate si possono eliminare.");
  refresh();
  return ok(undefined);
}
