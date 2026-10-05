"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { BOARD_COLOR_VALUES } from "@/lib/board-colors";
import { positionAfter } from "@/lib/position";
import { logActivity, q, snapshot } from "@/server/activity";
import { db } from "@/server/db";
import { isAuthenticated } from "@/server/session";

import { type ActionResult, fail, idSchema, ok, parse, titleSchema, UNAUTHORIZED } from "./result";

const createSchema = z.object({ title: titleSchema, color: z.enum(BOARD_COLOR_VALUES) });

export async function createBoard(
  input: z.input<typeof createSchema>,
): Promise<ActionResult<{ id: string }>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(createSchema, input);
  if (!data) return fail(error);

  const last = await db.board.findFirst({
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const board = await db.board.create({
    data: { title: data.title, color: data.color, position: positionAfter(last?.position ?? null) },
    select: { id: true },
  });
  await logActivity({
    kind: "board.create",
    summary: `Board ${q(data.title)} creata`,
    boardId: board.id,
    entityIds: [board.id],
    undo: [{ op: "update", model: "board", id: board.id, data: { archived: true } }],
  });
  revalidatePath("/boards");
  return ok(board);
}

const updateSchema = z.object({
  id: idSchema,
  title: titleSchema.optional(),
  color: z.enum(BOARD_COLOR_VALUES).optional(),
  archived: z.boolean().optional(),
});

export async function updateBoard(input: z.input<typeof updateSchema>): Promise<ActionResult> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(updateSchema, input);
  if (!data) return fail(error);

  const { id, ...changes } = data;
  const before = await db.board.findUnique({
    where: { id },
    select: { title: true, color: true, archived: true },
  });
  if (!before) return fail("Board non trovata.");
  await db.board.update({ where: { id }, data: changes });
  await logActivity({
    kind: "board.update",
    summary: describeBoardChange(before.title, changes),
    boardId: id,
    entityIds: [id],
    undo: [
      {
        op: "update",
        model: "board",
        id,
        data: snapshot({
          title: changes.title === undefined ? undefined : before.title,
          color: changes.color === undefined ? undefined : before.color,
          archived: changes.archived === undefined ? undefined : before.archived,
        }),
      },
    ],
  });
  revalidatePath("/boards");
  revalidatePath(`/boards/${id}`);
  return ok(undefined);
}

function describeBoardChange(
  title: string,
  changes: { title?: string; color?: string; archived?: boolean },
): string {
  if (changes.archived === true) return `Board ${q(title)} archiviata`;
  if (changes.archived === false) return `Board ${q(title)} ripristinata`;
  if (changes.title !== undefined && changes.title !== title) {
    return `Board ${q(title)} rinominata in ${q(changes.title)}`;
  }
  return `Board ${q(title)}: colore cambiato`;
}
