"use server";

import { z } from "zod";

import { type ActivityItem, listActivity, undoActivity, UndoError } from "@/server/activity";
import { db } from "@/server/db";
import { isAuthenticated } from "@/server/session";

import { type ActionResult, fail, idSchema, ok, parse, UNAUTHORIZED } from "./result";

async function undo(id: string): Promise<ActionResult<{ summary: string }>> {
  try {
    return ok(await undoActivity(id));
  } catch (error) {
    if (error instanceof UndoError) return fail(error.message);
    throw error;
  }
}

/** Undoes one activity, if nothing later touched the same records. */
export async function undoActivityAction(id: string): Promise<ActionResult<{ summary: string }>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(idSchema, id);
  if (error !== null) return fail(error);
  return undo(data);
}

/** Undoes the most recent undoable change, optionally on one board (Ctrl/Cmd+Z). */
export async function undoLatestAction(
  boardId?: string,
): Promise<ActionResult<{ summary: string }>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(idSchema.optional(), boardId);
  if (error !== null) return fail(error);
  const latest = await db.activity.findFirst({
    where: { undoneAt: null, kind: { not: "undo" }, ...(data ? { boardId: data } : {}) },
    orderBy: { createdAt: "desc" },
    select: { id: true, undo: true, summary: true },
  });
  if (!latest) return fail("Niente da annullare.");
  if (latest.undo === null) return fail(`Non si può annullare: ${latest.summary}`);
  return undo(latest.id);
}

const pageSchema = z.object({ before: z.iso.datetime(), cardId: idSchema.optional() });

/** Next page of the activity log. */
export async function loadActivity(
  input: z.input<typeof pageSchema>,
): Promise<ActionResult<ActivityItem[]>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(pageSchema, input);
  if (!data) return fail(error);
  return ok(await listActivity({ before: new Date(data.before), cardId: data.cardId }));
}
