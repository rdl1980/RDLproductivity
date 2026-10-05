"use server";

import { z } from "zod";

import { positionAfter, positionBetween } from "@/lib/position";
import { logActivity, q, snapshot } from "@/server/activity";
import { db } from "@/server/db";
import { isAuthenticated } from "@/server/session";

import { type ActionResult, fail, idSchema, ok, parse, titleSchema, UNAUTHORIZED } from "./result";

// Board pages keep client state as the source of truth while open, so these
// actions return the persisted values instead of revalidating the page.

const createSchema = z.object({ boardId: idSchema, title: titleSchema });

export async function createList(
  input: z.input<typeof createSchema>,
): Promise<ActionResult<{ id: string; position: string }>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(createSchema, input);
  if (!data) return fail(error);

  const board = await db.board.findUnique({ where: { id: data.boardId }, select: { id: true } });
  if (!board) return fail("Board non trovata.");

  const last = await db.list.findFirst({
    where: { boardId: data.boardId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const list = await db.list.create({
    data: {
      boardId: data.boardId,
      title: data.title,
      position: positionAfter(last?.position ?? null),
    },
    select: { id: true, position: true },
  });
  await logActivity({
    kind: "list.create",
    summary: `Lista ${q(data.title)} creata`,
    boardId: data.boardId,
    entityIds: [list.id],
    undo: [{ op: "update", model: "list", id: list.id, data: { archived: true } }],
  });
  return ok(list);
}

const updateSchema = z.object({
  id: idSchema,
  title: titleSchema.optional(),
  archived: z.boolean().optional(),
});

export async function updateList(input: z.input<typeof updateSchema>): Promise<ActionResult> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(updateSchema, input);
  if (!data) return fail(error);

  const { id, ...changes } = data;
  const before = await db.list.findUnique({
    where: { id },
    select: { title: true, archived: true, boardId: true },
  });
  if (!before) return fail("Lista non trovata.");
  await db.list.update({ where: { id }, data: changes });
  const summary =
    changes.archived === true
      ? `Lista ${q(before.title)} archiviata`
      : changes.archived === false
        ? `Lista ${q(before.title)} ripristinata`
        : `Lista ${q(before.title)} rinominata in ${q(changes.title ?? before.title)}`;
  await logActivity({
    kind: "list.update",
    summary,
    boardId: before.boardId,
    entityIds: [id],
    undo: [
      {
        op: "update",
        model: "list",
        id,
        data: snapshot({
          title: changes.title === undefined ? undefined : before.title,
          archived: changes.archived === undefined ? undefined : before.archived,
        }),
      },
    ],
  });
  return ok(undefined);
}

const moveSchema = z.object({
  id: idSchema,
  beforeId: idSchema.nullable(),
  afterId: idSchema.nullable(),
});

/** Places the list between `beforeId` and `afterId` (null = edge of the board). */
export async function moveList(
  input: z.input<typeof moveSchema>,
): Promise<ActionResult<{ position: string }>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(moveSchema, input);
  if (!data) return fail(error);

  const list = await db.list.findUnique({
    where: { id: data.id },
    select: { boardId: true, title: true, position: true },
  });
  if (!list) return fail("Lista non trovata.");

  const neighbourIds = [data.beforeId, data.afterId].filter((id): id is string => id !== null);
  const neighbours = await db.list.findMany({
    where: { id: { in: neighbourIds }, boardId: list.boardId },
    select: { id: true, position: true },
  });
  const positionOf = (id: string | null) =>
    id === null ? null : neighbours.find((n) => n.id === id)?.position;
  const before = positionOf(data.beforeId);
  const after = positionOf(data.afterId);
  if (before === undefined || after === undefined) return fail("Posizione non valida.");

  try {
    const position = positionBetween(before, after);
    await db.list.update({ where: { id: data.id }, data: { position } });
    await logActivity({
      kind: "list.move",
      summary: `Lista ${q(list.title)} spostata`,
      boardId: list.boardId,
      entityIds: [data.id],
      undo: [{ op: "update", model: "list", id: data.id, data: { position: list.position } }],
    });
    return ok({ position });
  } catch {
    return fail("Posizione non valida.");
  }
}
