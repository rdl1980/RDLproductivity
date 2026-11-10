"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  accountLabel,
  addWeeks,
  KDP_ACCOUNT_VALUES,
  KDP_TRACK_VALUES,
  type KdpAccount,
  type KdpTrack,
  laneLabel,
  weekStartOf,
} from "@/lib/kdp";
import { KDP_FORMATS, type KdpFormat } from "@/lib/kdp-books";
import { adjustmentKey, SLOT_FORMAT_LABELS, slotLimitsSchema } from "@/lib/kdp-slots";
import { positionAfter, positionBetween, positionsAfter } from "@/lib/position";
import { logActivity, q, snapshot } from "@/server/activity";
import { db } from "@/server/db";
import { getKdpSlotSettings, SLOT_ADJUST_KEY, SLOT_LIMITS_KEY } from "@/server/queries/kdp";
import { isAuthenticated } from "@/server/session";

import { type ActionResult, fail, idSchema, ok, parse, titleSchema, UNAUTHORIZED } from "./result";

const accountSchema = z.enum(KDP_ACCOUNT_VALUES);
const trackSchema = z.enum(KDP_TRACK_VALUES);
/** Any day of the week; stored as its Sunday. */
const weekSchema = z.string().transform((value, ctx) => {
  const start = weekStartOf(value);
  if (!start) {
    ctx.addIssue({ code: "custom", message: "Settimana non valida (usa AAAA-MM-GG)." });
    return z.NEVER;
  }
  return start;
});
const notesSchema = z.string().max(5000, "Le note sono troppo lunghe.").nullable();
const formatsSchema = z
  .array(z.enum(KDP_FORMATS))
  .max(3)
  .transform((formats) => KDP_FORMATS.filter((f) => formats.includes(f)));

const weekDate = (week: string) => new Date(`${week}T00:00:00Z`);
const weekKey = (date: Date) => date.toISOString().slice(0, 10);

async function lastPosition(
  week: string,
  account: KdpAccount,
  track: KdpTrack,
  excludeId?: string,
) {
  const last = await db.kdpTask.findFirst({
    where: {
      week: weekDate(week),
      account,
      track,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
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
  track: trackSchema.default("planned"),
  notes: notesSchema.optional(),
  formats: formatsSchema.optional(),
});

export type KdpTaskResult = {
  id: string;
  title: string;
  notes: string | null;
  account: KdpAccount;
  track: KdpTrack;
  week: string;
  position: string;
  done: boolean;
  formats: KdpFormat[];
};

function toResult(task: {
  id: string;
  title: string;
  notes: string | null;
  account: string;
  track: string;
  week: Date;
  position: string;
  done: boolean;
  formats: string[];
}): KdpTaskResult {
  return {
    ...task,
    formats: task.formats as KdpFormat[],
    account: task.account as KdpAccount,
    track: task.track as KdpTrack,
    week: weekKey(task.week),
  };
}

export async function createKdpTask(
  input: z.input<typeof createSchema>,
): Promise<ActionResult<KdpTaskResult>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(createSchema, input);
  if (!data) return fail(error);

  const position = positionAfter(await lastPosition(data.week, data.account, data.track));
  const task = await db.kdpTask.create({
    data: {
      title: data.title,
      notes: data.notes || null,
      account: data.account,
      track: data.track,
      week: weekDate(data.week),
      position,
      formats: data.formats ?? [],
    },
  });
  await logActivity({
    kind: "kdp.create",
    summary: `Attività KDP ${q(task.title)} aggiunta (${laneLabel(data.account, data.track)}, settimana del ${data.week})`,
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
  formats: formatsSchema.optional(),
});

export async function updateKdpTask(input: z.input<typeof updateSchema>): Promise<ActionResult> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(updateSchema, input);
  if (!data) return fail(error);

  const { id, ...changes } = data;
  if (changes.notes !== undefined) changes.notes = changes.notes || null;
  const before = await db.kdpTask.findUnique({
    where: { id },
    select: { title: true, notes: true, done: true, formats: true },
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
  /** Omitted: the task keeps its track. */
  track: trackSchema.optional(),
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
    select: { title: true, week: true, account: true, track: true, position: true },
  });
  if (!task) return fail("Attività non trovata.");
  const track = data.track ?? (task.track as KdpTrack);

  let position: string;
  if (data.beforeId === null && data.afterId === null) {
    position = positionAfter(await lastPosition(data.week, data.account, track, data.id));
  } else {
    const ids = [data.beforeId, data.afterId].filter((id): id is string => id !== null);
    const neighbours = await db.kdpTask.findMany({
      where: { id: { in: ids }, week: weekDate(data.week), account: data.account, track },
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
    data: { week: weekDate(data.week), account: data.account, track, position },
  });
  await logActivity({
    kind: "kdp.move",
    summary: `Attività KDP ${q(task.title)} spostata (${laneLabel(data.account, track)}, settimana del ${data.week})`,
    entityIds: [data.id],
    undo: [
      {
        op: "update",
        model: "kdpTask",
        id: data.id,
        data: snapshot({
          week: task.week,
          account: task.account,
          track: task.track,
          position: task.position,
        }),
      },
    ],
  });
  done();
  return ok({ position });
}

const shiftSchema = z.object({ week: weekSchema, account: accountSchema });

/**
 * Moves every task of a "Pianificato" cell to the following week, after the
 * ones already there, keeping their order. Done tasks move too.
 */
export async function shiftKdpPlannedWeek(
  input: z.input<typeof shiftSchema>,
): Promise<ActionResult<{ week: string; tasks: KdpTaskResult[] }>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(shiftSchema, input);
  if (!data) return fail(error);

  const next = addWeeks(data.week, 1);
  const tasks = await db.kdpTask.findMany({
    where: { week: weekDate(data.week), account: data.account, track: "planned" },
    orderBy: { position: "asc" },
  });
  if (tasks.length === 0) return fail("Nessuna attività pianificata in questa settimana.");
  const positions = positionsAfter(await lastPosition(next, data.account, "planned"), tasks.length);

  const moved = await db.$transaction(
    tasks.map((task, i) =>
      db.kdpTask.update({
        where: { id: task.id },
        data: { week: weekDate(next), position: positions[i] },
      }),
    ),
  );
  await logActivity({
    kind: "kdp.shift",
    summary: `${tasks.length === 1 ? "1 attività pianificata" : `${tasks.length} attività pianificate`} di ${q(accountLabel(data.account))} spostate dalla settimana del ${data.week} a quella del ${next}`,
    entityIds: tasks.map((task) => task.id),
    undo: tasks.map((task) => ({
      op: "update" as const,
      model: "kdpTask" as const,
      id: task.id,
      data: snapshot({ week: task.week, position: task.position }),
    })),
  });
  done();
  return ok({ week: next, tasks: moved.map(toResult) });
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
          track: task.track,
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

// --- Weekly slots ---------------------------------------------------------------

const saveSetting = (key: string, value: unknown) =>
  db.appSetting.upsert({
    where: { key },
    create: { key, value: JSON.stringify(value) },
    update: { value: JSON.stringify(value) },
  });

/** The weekly slot limits: the base for every account and per-account overrides. */
export async function setKdpSlotLimits(input: unknown): Promise<ActionResult> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(slotLimitsSchema, input);
  if (!data) return fail(error);
  await saveSetting(SLOT_LIMITS_KEY, data);
  await logActivity({
    kind: "kdp.slots",
    summary: `Limiti settimanali KDP: ${KDP_FORMATS.map((f) => `${data.base[f]} ${SLOT_FORMAT_LABELS[f].short.toLowerCase()}`).join(", ")}${Object.keys(data.accounts).length ? " (con eccezioni per account)" : ""}`,
    entityIds: [],
  });
  done();
  return ok(undefined);
}

const adjustSchema = z.object({
  account: accountSchema,
  week: weekSchema,
  format: z.enum(KDP_FORMATS),
  /** The correction to store (not a delta on it): used = tasks + adjustment. */
  adjustment: z.number().int().min(-50).max(50),
});

/** Corrects by hand the used slots of a format in an account's week. */
export async function setKdpSlotAdjustment(
  input: z.input<typeof adjustSchema>,
): Promise<ActionResult> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(adjustSchema, input);
  if (!data) return fail(error);
  const { adjustments } = await getKdpSlotSettings();
  const key = adjustmentKey(data.account, data.week, data.format);
  if (data.adjustment === 0) delete adjustments[key];
  else adjustments[key] = data.adjustment;
  // Corrections older than a year are of no use.
  const yearAgo = new Date(Date.now() - 370 * 24 * 3600_000).toISOString().slice(0, 10);
  for (const k of Object.keys(adjustments)) if (k.split("|")[1] < yearAgo) delete adjustments[k];
  await saveSetting(SLOT_ADJUST_KEY, adjustments);
  done();
  return ok(undefined);
}
