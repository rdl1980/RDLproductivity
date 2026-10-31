"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  type Actor,
  codePrefix,
  codeSchema,
  colorSchema,
  CYCLES,
  daySchema,
  defaultLayers,
  DETAILS_SCHEMAS,
  LAYER_STATUSES,
  type LayerDetails,
  MANUAL_STATUSES,
  nextCode,
  PLATFORM_LABELS,
  type Platform,
  PLATFORMS,
  planSchema,
  SLOTS,
  type Slot,
  TODO_KINDS_WITH_ACTION,
  VIDEO_FORMATS,
  zonedInstant,
} from "@/lib/content";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { getMcpUser } from "@/server/mcp-context";
import {
  type ContentHistoryDTO,
  type ContentPieceDTO,
  type ContentRubricDTO,
  getContentPiece,
  getContentPlan,
  getContentRubrics,
  getTodoDone,
  PLAN_KEY,
  pieceInclude,
  TODO_DONE_KEY,
  toPieceDTO,
} from "@/server/queries/content";
import { isAuthenticated } from "@/server/session";

import { type ActionResult, fail, ok, parse, UNAUTHORIZED } from "./result";

/** Changes from Claude come through MCP; everything else is Rosario in the browser. */
const actor = (): Actor => (getMcpUser() ? "claude" : "rosario");

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const isoDateTime = z.iso.datetime({ offset: true });

const pieceFieldsSchema = z
  .object({
    title: z.string().trim().min(1, "Il titolo non può essere vuoto.").max(200),
    rubric: z.string().min(1).max(60),
    releaseDate: daySchema,
    slot: z.enum(SLOTS, "Fascia non valida (13:00 o 19:00)."),
    status: z.enum(MANUAL_STATUSES, {
      message:
        "Stato non valido: idea, in scrittura, da approvare, approvato, pronto o scartato (programmato e pubblicato si calcolano dai layer).",
    }),
    cycleWeek: z.enum(CYCLES).nullable(),
    durationSeconds: z.number().int().min(0).max(36_000).nullable(),
    videoFormat: z.enum(VIDEO_FORMATS).nullable(),
    summary: optionalText(2000),
    videoFile: optionalText(500),
    coverFile: optionalText(500),
    script: optionalText(500),
    question: optionalText(300),
    voteOptions: z.array(z.string().trim().min(1).max(100)).max(10),
    voteResult: optionalText(300),
    voteCloses: daySchema.nullable(),
    notes: optionalText(10_000),
  })
  .partial();

const metricsSchema = z.object({
  measuredAt: isoDateTime.optional(),
  views: z.number().int().min(0).nullable().optional(),
  likes: z.number().int().min(0).nullable().optional(),
  comments: z.number().int().min(0).nullable().optional(),
  shares: z.number().int().min(0).nullable().optional(),
  saves: z.number().int().min(0).nullable().optional(),
  completion: z.number().min(0).max(100).nullable().optional(),
  newFollowers: z.number().int().nullable().optional(),
  watchHours: z.number().min(0).nullable().optional(),
});

const layerFieldsSchema = z
  .object({
    active: z.boolean(),
    publishStatus: z.enum(LAYER_STATUSES, {
      message:
        "Stato di pubblicazione non valido: da preparare, pronto, programmato, pubblicato o problema.",
    }),
    plannedAt: isoDateTime.nullable(),
    publishedAt: isoDateTime.nullable(),
    url: z.string().trim().max(500).nullable(),
    aiLabel: z.boolean(),
    coverChosen: z.boolean(),
    pinnedComment: optionalText(2000),
    pinnedCommentDone: z.boolean(),
    votes: z.record(z.string().min(1).max(100), z.number().int().min(0)),
    notes: optionalText(5000),
    details: z.record(z.string(), z.unknown()),
  })
  .partial();

export type PieceFields = z.input<typeof pieceFieldsSchema>;
export type LayerFields = z.input<typeof layerFieldsSchema>;
export type MetricReading = z.input<typeof metricsSchema>;

const platformSchema = z.enum(PLATFORMS, "Piattaforma non valida: tiktok, youtube o instagram.");

const saveSchema = z.object({
  code: codeSchema,
  fields: pieceFieldsSchema.default({}),
  layers: z.partialRecord(platformSchema, layerFieldsSchema).optional(),
});

const FIELD_LABELS: Record<string, string> = {
  title: "titolo",
  rubric: "rubrica",
  releaseDate: "data di uscita",
  slot: "fascia",
  status: "stato",
  cycleWeek: "settimana del ciclo",
  durationSeconds: "durata",
  videoFormat: "formato",
  summary: "riassunto",
  videoFile: "file video",
  coverFile: "copertina",
  script: "copione",
  question: "domanda",
  voteOptions: "opzioni di voto",
  voteResult: "esito del voto",
  voteCloses: "chiusura del voto",
  notes: "note",
  active: "attivo",
  publishStatus: "stato di pubblicazione",
  plannedAt: "data prevista",
  publishedAt: "data di pubblicazione",
  url: "link",
  aiLabel: "etichetta IA",
  coverChosen: "copertina scelta",
  pinnedComment: "commento fissato",
  pinnedCommentDone: "commento fissato fatto",
  votes: "voti",
  details: "testi",
};

const toDate = (key: string) => new Date(`${key}T00:00:00Z`);
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

type Tx = Prisma.TransactionClient;
type LayerRow = Prisma.ContentLayerGetPayload<object>;

function done() {
  revalidatePath("/robotti", "layout");
}

async function result(code: string): Promise<ActionResult<ContentPieceDTO>> {
  const row = await db.contentPiece.findUnique({ where: { code }, include: pieceInclude });
  return row ? ok(toPieceDTO(row)) : fail(`Scheda «${code}» non trovata.`);
}

async function rubricExists(tx: Tx, rubric: string) {
  return !!(await tx.contentRubric.findUnique({ where: { value: rubric } }));
}

/** Validates the platform fields of `details` and merges them into `current`. */
function mergeDetails(
  platform: Platform,
  current: LayerDetails,
  details: Record<string, unknown> | undefined,
): { details: LayerDetails } | { error: string } {
  if (!details) return { details: current };
  const parsed = DETAILS_SCHEMAS[platform].strict().safeParse(details);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      error: `${PLATFORM_LABELS[platform]}: ${issue?.path.join(".") || "campi"} non validi (${issue?.message ?? "valore non valido"}).`,
    };
  }
  return { details: { ...current, ...parsed.data } };
}

/** Creates or updates a layer; returns the changed field labels. */
async function applyLayer(
  tx: Tx,
  piece: { id: string; rubric: string; releaseDate: Date; slot: string },
  existing: LayerRow | undefined,
  platform: Platform,
  fields: z.output<typeof layerFieldsSchema>,
  activate: boolean,
): Promise<{ changed: string[] } | { error: string }> {
  const fallback =
    defaultLayers(piece.rubric, piece.slot as Slot).find((l) => l.platform === platform)?.details ??
    (platform === "youtube"
      ? { kind: "Short", notForKids: true }
      : platform === "instagram"
        ? { kind: "Reel" }
        : {});
  const merged = mergeDetails(
    platform,
    (existing?.details as LayerDetails | undefined) ?? fallback,
    fields.details,
  );
  if ("error" in merged) return merged;

  const data: Prisma.ContentLayerUncheckedUpdateInput = {};
  const changed: string[] = [];
  const set = (key: string, value: unknown, current: unknown) => {
    if (value === undefined || same(value, current)) return;
    (data as Record<string, unknown>)[key] = value;
    changed.push(FIELD_LABELS[key] ?? key);
  };
  const active = fields.active ?? (activate ? true : undefined);
  set("active", active, existing?.active);
  set("publishStatus", fields.publishStatus, existing?.publishStatus);
  set("url", fields.url === "" ? null : fields.url, existing?.url);
  set("aiLabel", fields.aiLabel, existing?.aiLabel);
  set("coverChosen", fields.coverChosen, existing?.coverChosen);
  set("pinnedComment", fields.pinnedComment, existing?.pinnedComment);
  set("pinnedCommentDone", fields.pinnedCommentDone, existing?.pinnedCommentDone);
  set("votes", fields.votes, existing?.votes);
  set("notes", fields.notes, existing?.notes);
  if (fields.details) set("details", merged.details, existing?.details);
  if (fields.plannedAt !== undefined) {
    const manual = fields.plannedAt !== null;
    const plannedAt = manual
      ? new Date(fields.plannedAt!)
      : zonedInstant(piece.releaseDate.toISOString().slice(0, 10), piece.slot);
    set("plannedAt", plannedAt.toISOString(), existing?.plannedAt?.toISOString());
    data.plannedAtManual = manual;
  }
  if (fields.publishedAt !== undefined) {
    set("publishedAt", fields.publishedAt, existing?.publishedAt?.toISOString() ?? null);
  }
  // Marked published without a date: it went out now.
  if (fields.publishStatus === "pubblicato" && !fields.publishedAt && !existing?.publishedAt) {
    data.publishedAt = new Date();
  }

  if (existing) {
    if (Object.keys(data).length)
      await tx.contentLayer.update({ where: { id: existing.id }, data });
  } else {
    await tx.contentLayer.create({
      data: {
        pieceId: piece.id,
        platform,
        active: true,
        details: merged.details as Prisma.InputJsonValue,
        plannedAt: zonedInstant(piece.releaseDate.toISOString().slice(0, 10), piece.slot),
        ...(data as Omit<Prisma.ContentLayerUncheckedCreateInput, "pieceId" | "platform">),
      },
    });
    if (!changed.length) changed.push("attivato");
  }
  return { changed };
}

async function log(tx: Tx, pieceId: string, who: Actor, summary: string) {
  await tx.contentHistory.create({ data: { pieceId, actor: who, summary } });
}

/**
 * Creates the piece with `code`, or updates it: only the given fields change
 * (idempotent). A new piece gets the default layers of its rubric and slot;
 * `layers` then updates (or activates) single platforms.
 */
export async function saveContentPiece(
  input: z.input<typeof saveSchema>,
): Promise<ActionResult<ContentPieceDTO>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(saveSchema, input);
  if (!data) return fail(error);
  const who = actor();
  const { code, fields } = data;

  const outcome = await db.$transaction(async (tx): Promise<string | null> => {
    if (fields.rubric && !(await rubricExists(tx, fields.rubric))) {
      return `Rubrica sconosciuta: «${fields.rubric}». Vedi l'elenco delle rubriche.`;
    }
    let piece = await tx.contentPiece.findUnique({ where: { code }, include: { layers: true } });
    const notes: string[] = [];

    if (!piece) {
      if (!fields.title || !fields.rubric || !fields.releaseDate || !fields.slot) {
        return `La scheda «${code}» non esiste: per crearla servono titolo, rubrica, data di uscita e fascia.`;
      }
      const { voteCloses, releaseDate, ...rest } = fields;
      const created = await tx.contentPiece.create({
        data: {
          ...rest,
          code,
          title: fields.title,
          rubric: fields.rubric,
          slot: fields.slot,
          releaseDate: toDate(releaseDate),
          voteCloses: voteCloses ? toDate(voteCloses) : null,
          createdBy: who,
          updatedBy: who,
        },
      });
      const plannedAt = zonedInstant(releaseDate, fields.slot);
      for (const layer of defaultLayers(fields.rubric, fields.slot)) {
        await tx.contentLayer.create({
          data: {
            pieceId: created.id,
            platform: layer.platform,
            details: layer.details as Prisma.InputJsonValue,
            plannedAt,
          },
        });
      }
      piece = await tx.contentPiece.findUniqueOrThrow({
        where: { id: created.id },
        include: { layers: true },
      });
      notes.push("Scheda creata");
    } else {
      const update: Prisma.ContentPieceUncheckedUpdateInput = {};
      const changed: string[] = [];
      for (const [key, value] of Object.entries(fields)) {
        if (value === undefined) continue;
        const current = (piece as Record<string, unknown>)[key];
        const stored =
          (key === "releaseDate" || key === "voteCloses") && value !== null
            ? toDate(value as string)
            : value;
        const currentComparable =
          current instanceof Date ? current.toISOString().slice(0, 10) : current;
        if (same(value, currentComparable)) continue;
        (update as Record<string, unknown>)[key] = stored;
        changed.push(FIELD_LABELS[key] ?? key);
      }
      if (changed.length) {
        update.updatedBy = who;
        piece = await tx.contentPiece.update({
          where: { id: piece.id },
          data: update,
          include: { layers: true },
        });
        // Moved: the layers follow, unless their time was set by hand.
        if (update.releaseDate !== undefined || update.slot !== undefined) {
          const plannedAt = zonedInstant(piece.releaseDate.toISOString().slice(0, 10), piece.slot);
          await tx.contentLayer.updateMany({
            where: { pieceId: piece.id, plannedAtManual: false },
            data: { plannedAt },
          });
        }
        notes.push(`Modificati: ${changed.join(", ")}`);
      }
    }

    for (const platform of PLATFORMS) {
      const layerFields = data.layers?.[platform];
      if (!layerFields) continue;
      const applied = await applyLayer(
        tx,
        piece,
        piece.layers.find((l) => l.platform === platform),
        platform,
        layerFields,
        true,
      );
      if ("error" in applied) return applied.error;
      if (applied.changed.length) {
        notes.push(`${PLATFORM_LABELS[platform]}: ${applied.changed.join(", ")}`);
      }
    }
    if (notes.length) {
      await tx.contentPiece.update({ where: { id: piece.id }, data: { updatedBy: who } });
      await log(tx, piece.id, who, notes.join(" · "));
    }
    return null;
  });
  if (outcome) return fail(outcome);
  done();
  return result(code);
}

const layerUpdateSchema = z.object({
  code: codeSchema,
  platform: platformSchema,
  fields: layerFieldsSchema,
});

/** Updates one layer of a piece; activates (or creates) it if needed. */
export async function updateContentLayer(
  input: z.input<typeof layerUpdateSchema>,
): Promise<ActionResult<ContentPieceDTO>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(layerUpdateSchema, input);
  if (!data) return fail(error);
  return saveContentPiece({ code: data.code, layers: { [data.platform]: data.fields } });
}

const metricSchema = z.object({
  code: codeSchema,
  platform: platformSchema,
  reading: metricsSchema,
});

/** Adds a reading to a layer's numbers; earlier readings stay. */
export async function addContentMetric(
  input: z.input<typeof metricSchema>,
): Promise<ActionResult<ContentPieceDTO>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(metricSchema, input);
  if (!data) return fail(error);
  const who = actor();
  const piece = await db.contentPiece.findUnique({
    where: { code: data.code },
    include: { layers: true },
  });
  if (!piece) return fail(`Scheda «${data.code}» non trovata.`);
  const layer = piece.layers.find((l) => l.platform === data.platform);
  if (!layer) {
    return fail(`La scheda «${data.code}» non ha il layer ${PLATFORM_LABELS[data.platform]}.`);
  }
  const { measuredAt, ...numbers } = data.reading;
  if (Object.values(numbers).every((v) => v === undefined || v === null)) {
    return fail("Indica almeno un numero (visualizzazioni, mi piace, …).");
  }
  await db.$transaction(async (tx) => {
    await tx.contentMetric.create({
      data: {
        layerId: layer.id,
        measuredAt: measuredAt ? new Date(measuredAt) : new Date(),
        ...numbers,
      },
    });
    await tx.contentPiece.update({ where: { id: piece.id }, data: { updatedBy: who } });
    await log(
      tx,
      piece.id,
      who,
      `${PLATFORM_LABELS[data.platform]}: nuova rilevazione${numbers.views != null ? ` (${numbers.views} visualizzazioni)` : ""}`,
    );
  });
  done();
  return result(data.code);
}

const votesSchema = z.object({
  code: codeSchema,
  counts: z.partialRecord(
    platformSchema,
    z.record(z.string().min(1).max(100), z.number().int().min(0)),
  ),
  result: z.string().trim().max(300).nullable().optional(),
});

/** Saves the vote counts per platform and, if given, the outcome. */
export async function recordContentVotes(
  input: z.input<typeof votesSchema>,
): Promise<ActionResult<ContentPieceDTO>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(votesSchema, input);
  if (!data) return fail(error);
  const piece = await db.contentPiece.findUnique({
    where: { code: data.code },
    include: { layers: true },
  });
  if (!piece) return fail(`Scheda «${data.code}» non trovata.`);
  for (const platform of Object.keys(data.counts) as Platform[]) {
    if (!piece.layers.some((l) => l.platform === platform)) {
      return fail(`La scheda «${data.code}» non ha il layer ${PLATFORM_LABELS[platform]}.`);
    }
  }
  return saveContentPiece({
    code: data.code,
    fields: data.result !== undefined ? { voteResult: data.result } : {},
    layers: Object.fromEntries(
      Object.entries(data.counts).map(([platform, votes]) => [platform, { votes }]),
    ),
  });
}

const quickSchema = z.object({
  title: z.string().trim().min(1, "Il titolo è obbligatorio.").max(200),
  rubric: z.string().min(1),
  date: daySchema,
  slot: z.enum(SLOTS),
});

/**
 * Creates a piece straight from a calendar cell: the code is the next free
 * one of the rubric's prefix (ep001, ep002, …).
 */
export async function addContentPiece(
  input: z.input<typeof quickSchema>,
): Promise<ActionResult<ContentPieceDTO>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(quickSchema, input);
  if (!data) return fail(error);
  const prefix = codePrefix(data.rubric);
  const taken = await db.contentPiece.findMany({
    where: { code: { startsWith: prefix } },
    select: { code: true },
  });
  return saveContentPiece({
    code: nextCode(
      prefix,
      taken.map((p) => p.code),
    ),
    fields: {
      title: data.title,
      rubric: data.rubric,
      releaseDate: data.date,
      slot: data.slot,
      status: "idea",
    },
  });
}

/** Moves a piece to another day or slot (drag and drop). */
export async function moveContentPiece(input: {
  code: string;
  date: string;
  slot: string;
}): Promise<ActionResult<ContentPieceDTO>> {
  return saveContentPiece({
    code: input.code,
    fields: { releaseDate: input.date, slot: input.slot as Slot },
  });
}

async function setArchived(code: string, archived: boolean) {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const parsed = codeSchema.safeParse(code);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Codice non valido.");
  const piece = await db.contentPiece.findUnique({ where: { code: parsed.data } });
  if (!piece) return fail(`Scheda «${parsed.data}» non trovata.`);
  if (!!piece.archivedAt === archived) return result(parsed.data);
  const who = actor();
  await db.$transaction(async (tx) => {
    await tx.contentPiece.update({
      where: { id: piece.id },
      data: { archivedAt: archived ? new Date() : null, updatedBy: who },
    });
    await log(tx, piece.id, who, archived ? "Archiviata" : "Ripristinata");
  });
  done();
  return result(parsed.data);
}

/** Hides a piece from the calendar; it can be restored, nothing is deleted. */
export async function archiveContentPiece(code: string): Promise<ActionResult<ContentPieceDTO>> {
  return setArchived(code, true);
}

export async function restoreContentPiece(code: string): Promise<ActionResult<ContentPieceDTO>> {
  return setArchived(code, false);
}

const duplicateSchema = z.object({ code: codeSchema, newCode: codeSchema });

/** Copies a piece under a new code: texts and layers, not publication data or numbers. */
export async function duplicateContentPiece(
  input: z.input<typeof duplicateSchema>,
): Promise<ActionResult<ContentPieceDTO>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(duplicateSchema, input);
  if (!data) return fail(error);
  const source = await db.contentPiece.findUnique({
    where: { code: data.code },
    include: { layers: true },
  });
  if (!source) return fail(`Scheda «${data.code}» non trovata.`);
  if (await db.contentPiece.findUnique({ where: { code: data.newCode } })) {
    return fail(`Il codice «${data.newCode}» è già usato.`);
  }
  const who = actor();
  await db.$transaction(async (tx) => {
    /* eslint-disable @typescript-eslint/no-unused-vars -- left out of the copy */
    const { id, code, createdAt, updatedAt, archivedAt, layers, voteResult, ...fields } = source;
    /* eslint-enable @typescript-eslint/no-unused-vars */
    const copy = await tx.contentPiece.create({
      data: { ...fields, code: data.newCode, status: "idea", createdBy: who, updatedBy: who },
    });
    for (const layer of layers) {
      await tx.contentLayer.create({
        data: {
          pieceId: copy.id,
          platform: layer.platform,
          active: layer.active,
          plannedAt: layer.plannedAt,
          plannedAtManual: layer.plannedAtManual,
          aiLabel: layer.aiLabel,
          pinnedComment: layer.pinnedComment,
          details: layer.details as Prisma.InputJsonValue,
          notes: layer.notes,
        },
      });
    }
    await log(tx, copy.id, who, `Duplicata da «${data.code}»`);
  });
  done();
  return result(data.newCode);
}

/** The piece with its history, for the detail dialog. */
export async function loadContentPiece(
  code: string,
): Promise<ActionResult<ContentPieceDTO & { history: ContentHistoryDTO[] }>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const piece = await getContentPiece(code);
  return piece ? ok(piece) : fail(`Scheda «${code}» non trovata.`);
}

const rubricSchema = z.object({
  value: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{0,59}$/, "Valore non valido: minuscole, cifre e trattini."),
  name: z.string().trim().min(1, "Il nome non può essere vuoto.").max(100),
  color: colorSchema,
});

/** Adds a rubric, or renames / recolors an existing one. */
export async function saveContentRubric(
  input: z.input<typeof rubricSchema>,
): Promise<ActionResult<ContentRubricDTO[]>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(rubricSchema, input);
  if (!data) return fail(error);
  const last = await db.contentRubric.aggregate({ _max: { position: true } });
  await db.contentRubric.upsert({
    where: { value: data.value },
    create: { ...data, position: (last._max.position ?? 0) + 1 },
    update: { name: data.name, color: data.color },
  });
  done();
  return ok(await getContentRubrics());
}

/** Replaces the weekly plan that generates the empty slots. */
export async function saveContentPlan(
  rows: z.input<typeof planSchema>,
): Promise<ActionResult<Awaited<ReturnType<typeof getContentPlan>>>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(planSchema, rows);
  if (!data) return fail(error);
  const known = new Set((await getContentRubrics()).map((r) => r.value));
  const unknown = data.find((row) => !known.has(row.rubric));
  if (unknown) return fail(`Rubrica sconosciuta nel piano: «${unknown.rubric}».`);
  const value = JSON.stringify(data);
  await db.appSetting.upsert({
    where: { key: PLAN_KEY },
    create: { key: PLAN_KEY, value },
    update: { value },
  });
  done();
  return ok(data);
}

const todoSchema = z.object({
  kind: z.enum(["schedule", "pin", "vote", "metrics", "slot"]),
  key: z.string().min(1).max(300),
  code: codeSchema.nullable(),
  platform: platformSchema.nullable(),
});

/** Keeps the done marks of the last 90 days. */
async function saveTodoDone(update: (list: { key: string; at: string }[]) => typeof list) {
  const since = Date.now() - 90 * 86_400_000;
  const list = update((await getTodoDone()).filter((d) => Date.parse(d.at) >= since));
  const value = JSON.stringify(list);
  await db.appSetting.upsert({
    where: { key: TODO_DONE_KEY },
    create: { key: TODO_DONE_KEY, value },
    update: { value },
  });
}

/**
 * Marks a to-do item done. "Da programmare" and "Commento da fissare" change the
 * layer (programmato, commento fissato); the others are remembered as done.
 */
export async function completeContentTodo(
  input: z.input<typeof todoSchema>,
): Promise<ActionResult<null>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(todoSchema, input);
  if (!data) return fail(error);
  if (TODO_KINDS_WITH_ACTION.includes(data.kind)) {
    if (!data.code || !data.platform) return fail("Scheda o piattaforma mancante.");
    const r = await updateContentLayer({
      code: data.code,
      platform: data.platform,
      fields:
        data.kind === "schedule" ? { publishStatus: "programmato" } : { pinnedCommentDone: true },
    });
    if (!r.ok) return r;
  } else {
    await saveTodoDone((list) => [
      ...list.filter((d) => d.key !== data.key),
      { key: data.key, at: new Date().toISOString() },
    ]);
  }
  done();
  return ok(null);
}

/** Puts back a to-do item that was only remembered as done. */
export async function reopenContentTodo(key: string): Promise<ActionResult<null>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  await saveTodoDone((list) => list.filter((d) => d.key !== key));
  done();
  return ok(null);
}
