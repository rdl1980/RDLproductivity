"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { BOARD_COLOR_VALUES } from "@/lib/board-colors";
import { positionAfter } from "@/lib/position";
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
  const { count } = await db.board.updateMany({ where: { id }, data: changes });
  if (count === 0) return fail("Board non trovata.");
  revalidatePath("/boards");
  revalidatePath(`/boards/${id}`);
  return ok(undefined);
}
