"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { accountLabel, KDP_ACCOUNT_VALUES, type KdpAccount, mondayOf } from "@/lib/kdp";
import { positionAfter, positionBetween } from "@/lib/position";
import { logActivity, q, snapshot } from "@/server/activity";
import { db } from "@/server/db";
import { isAuthenticated } from "@/server/session";

import { type ActionResult, fail, idSchema, ok, parse, titleSchema, UNAUTHORIZED } from "./result";

const accountSchema = z.enum(KDP_ACCOUNT_VALUES);
/** Any day of the week; stored as its Monday. */
const weekSchema = z.string().transform((value, ctx) => {
  const monday = mondayOf(value);
  if (!monday) {
    ctx.addIssue({ code: "custom", message: "Settimana non valida (usa AAAA-MM-GG)." });
    return z.NEVER;
  }
  return monday;
});
const notesSchema = z.string().max(5000, "Le note sono troppo lunghe.").nullable();

const weekDate = (week: string) => new Date(`${week}T00:00:00Z`);
const weekKey = (date: Date) => date.toISOString().slice(0, 10);

async function lastPosition(week: string, account: KdpAccount, excludeId?: string) {
  const last = await db.kdpTask.findFirst({
    where: { week: weekDate(week), account, ...(excludeId ? { id: { not: excludeId } } : {}) },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return last?.position ?? null;
}

function done() {
  revalidatePath("/kdp");
}

const createSchema = z.object({
  title: titleSchema,
  week: weekSchema,
  account: accountSchema,
  notes: notesSchema.optional(),
});

export type KdpTaskResult = {
  id: string;
  title: string;
  notes: string | null;
  account: KdpAccount;
  week: string;
  position: string;
  done: boolean;
};

function toResult(task: {
  id: string;
  title: string;
  notes: string | null;
  account: string;
  week: Date;
  position: string;
  done: boolean;
}): KdpTaskResult {
  return { ...task, account: task.account as KdpAccount, week: weekKey(task.week) };
}

export async function createKdpTask(
  input: z.input<typeof createSchema>,
): Promise<ActionResult<KdpTaskResult>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(createSchema, input);
  if (!data) return fail(error);

  const position = positionAfter(await lastPosition(data.week, data.account));
  const task = await db.kdpTask.create({
    data: {
      title: data.title,
      notes: data.notes || null,
      account: data.account,
      week: weekDate(data.week),
      position,
    },
  });
  await logActivity({
    kind: "kdp.create",
    summary: `Attività KDP ${q(task.title)} aggiunta (${accountLabel(data.account)}, settimana del ${data.week})`,
    entityIds: [task.id],
    undo: [{ op: "delete", model: "kdpTask", id: task.id }],
  });
  done();
  return ok(toResult(task));
}

const updateSchema = z.object({
  id: idSchema,
  title: titleSchema.optional(),
  notes: notesSchema.optional(),
  done: z.boolean().optional(),
});

export async function updateKdpTask(input: z.input<typeof updateSchema>): Promise<ActionResult> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(updateSchema, input);
  if (!data) return fail(error);

  const { id, ...changes } = data;
  if (changes.notes !== undefined) changes.notes = changes.notes || null;
  const before = await db.kdpTask.findUnique({
    where: { id },
    select: { title: true, notes: true, done: true },
  });
  if (!before) return fail("Attività non trovata.");
  await db.kdpTask.update({ where: { id }, data: changes });

  const keys = Object.keys(changes) as (keyof typeof changes)[];
  const summary =
    keys.length === 1 && keys[0] === "done"
      ? `Attività KDP ${q(before.title)} segnata come ${changes.done ? "fatta" : "da fare"}`
      : `Attività KDP ${q(before.title)} modificata`;
  await logActivity({
    kind: "kdp.update",
    summary,
    entityIds: [id],
    undo: [
      {
        op: "update",
        model: "kdpTask",
        id,
        data: snapshot(Object.fromEntries(keys.map((key) => [key, before[key]]))),
      },
    ],
  });
  done();
  return ok(undefined);
}

const moveSchema = z.object({
  id: idSchema,
  week: weekSchema,
  account: accountSchema,
  /** Neighbours in the target cell; both null = append at the end. */
  beforeId: idSchema.nullable().default(null),
  afterId: idSchema.nullable().default(null),
});

export async function moveKdpTask(
  input: z.input<typeof moveSchema>,
): Promise<ActionResult<{ position: string }>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(moveSchema, input);
  if (!data) return fail(error);

  const task = await db.kdpTask.findUnique({
    where: { id: data.id },
    select: { title: true, week: true, account: true, position: true },
  });
  if (!task) return fail("Attività non trovata.");

  let position: string;
  if (data.beforeId === null && data.afterId === null) {
    position = positionAfter(await lastPosition(data.week, data.account, data.id));
  } else {
    const ids = [data.beforeId, data.afterId].filter((id): id is string => id !== null);
    const neighbours = await db.kdpTask.findMany({
      where: { id: { in: ids }, week: weekDate(data.week), account: data.account },
      select: { id: true, position: true },
    });
    const positionOf = (id: string | null) =>
      id === null ? null : neighbours.find((n) => n.id === id)?.position;
    const before = positionOf(data.beforeId);
    const after = positionOf(data.afterId);
    if (before === undefined || after === undefined) return fail("Posizione non valida.");
    try {
      position = positionBetween(before, after);
    } catch {
      return fail("Posizione non valida.");
    }
  }

  await db.kdpTask.update({
    where: { id: data.id },
    data: { week: weekDate(data.week), account: data.account, position },
  });
  await logActivity({
    kind: "kdp.move",
    summary: `Attività KDP ${q(task.title)} spostata (${accountLabel(data.account)}, settimana del ${data.week})`,
    entityIds: [data.id],
    undo: [
      {
        op: "update",
        model: "kdpTask",
        id: data.id,
        data: snapshot({ week: task.week, account: task.account, position: task.position }),
      },
    ],
  });
  done();
  return ok({ position });
}

export async function deleteKdpTask(id: string): Promise<ActionResult> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data: taskId, error } = parse(idSchema, id);
  if (error !== null) return fail(error);

  const task = await db.kdpTask.findUnique({ where: { id: taskId } });
  if (!task) return fail("Attività non trovata.");
  await db.kdpTask.delete({ where: { id: taskId } });
  await logActivity({
    kind: "kdp.delete",
    summary: `Attività KDP ${q(task.title)} eliminata`,
    entityIds: [taskId],
    undo: [
      {
        op: "restoreKdpTask",
        task: {
          id: task.id,
          title: task.title,
          notes: task.notes,
          account: task.account,
          week: weekKey(task.week),
          position: task.position,
          done: task.done,
        },
      },
    ],
  });
  done();
  return ok(undefined);
}
