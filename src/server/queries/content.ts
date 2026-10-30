import "server-only";

import {
  type Cycle,
  cycleWeekOf,
  DEFAULT_PLAN,
  effectiveStatus,
  emptySlots,
  type LayerDetails,
  type LayerStatus,
  type ManualStatus,
  type PieceStatus,
  type Platform,
  PLATFORMS,
  type PlanRow,
  planSchema,
  plannedSlots,
  type Slot,
  type TodoItem,
  todoItems,
  type VideoFormat,
} from "@/lib/content";
import { addDays } from "@/lib/kdp-sales";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";

export const PLAN_KEY = "content.plan";

export type ContentMetricDTO = {
  id: string;
  measuredAt: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  completion: number | null;
  newFollowers: number | null;
  watchHours: number | null;
};

export type ContentLayerDTO = {
  platform: Platform;
  active: boolean;
  publishStatus: LayerStatus;
  plannedAt: string | null;
  plannedAtManual: boolean;
  publishedAt: string | null;
  url: string | null;
  aiLabel: boolean;
  coverChosen: boolean;
  pinnedComment: string | null;
  pinnedCommentDone: boolean;
  votes: Record<string, number>;
  details: LayerDetails;
  notes: string | null;
  /** Oldest first. */
  metrics: ContentMetricDTO[];
};

export type ContentPieceDTO = {
  id: string;
  code: string;
  title: string;
  rubric: string;
  date: string;
  slot: Slot;
  /** Set by hand. */
  status: ManualStatus;
  /** What the piece shows, from the layers. */
  shown: { status: PieceStatus; partial: boolean };
  cycleWeek: Cycle;
  cycleOverride: Cycle | null;
  durationSeconds: number | null;
  videoFormat: VideoFormat | null;
  summary: string | null;
  videoFile: string | null;
  coverFile: string | null;
  script: string | null;
  question: string | null;
  voteOptions: string[];
  voteResult: string | null;
  voteCloses: string | null;
  notes: string | null;
  createdBy: string;
  updatedBy: string;
  archivedAt: string | null;
  updatedAt: string;
  /** In platform order. */
  layers: ContentLayerDTO[];
};

export type ContentHistoryDTO = { id: string; actor: string; summary: string; at: string };

export type ContentRubricDTO = { value: string; name: string; color: string };

export const pieceInclude = {
  layers: { include: { metrics: { orderBy: { measuredAt: "asc" } } } },
} satisfies Prisma.ContentPieceInclude;

type PieceRow = Prisma.ContentPieceGetPayload<{ include: typeof pieceInclude }>;

const day = (date: Date) => date.toISOString().slice(0, 10);
const iso = (date: Date | null) => (date ? date.toISOString() : null);

export function toPieceDTO(row: PieceRow): ContentPieceDTO {
  const layers = [...row.layers]
    .sort(
      (a, b) =>
        PLATFORMS.indexOf(a.platform as Platform) - PLATFORMS.indexOf(b.platform as Platform),
    )
    .map((layer): ContentLayerDTO => ({
      platform: layer.platform as Platform,
      active: layer.active,
      publishStatus: layer.publishStatus as LayerStatus,
      plannedAt: iso(layer.plannedAt),
      plannedAtManual: layer.plannedAtManual,
      publishedAt: iso(layer.publishedAt),
      url: layer.url,
      aiLabel: layer.aiLabel,
      coverChosen: layer.coverChosen,
      pinnedComment: layer.pinnedComment,
      pinnedCommentDone: layer.pinnedCommentDone,
      votes: (layer.votes ?? {}) as Record<string, number>,
      details: (layer.details ?? {}) as LayerDetails,
      notes: layer.notes,
      metrics: layer.metrics.map((m) => ({
        id: m.id,
        measuredAt: m.measuredAt.toISOString(),
        views: m.views,
        likes: m.likes,
        comments: m.comments,
        shares: m.shares,
        saves: m.saves,
        completion: m.completion,
        newFollowers: m.newFollowers,
        watchHours: m.watchHours,
      })),
    }));
  const date = day(row.releaseDate);
  const status = row.status as ManualStatus;
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    rubric: row.rubric,
    date,
    slot: row.slot as Slot,
    status,
    shown: effectiveStatus(
      status,
      layers.filter((l) => l.active).map((l) => l.publishStatus),
    ),
    cycleWeek: (row.cycleWeek as Cycle | null) ?? cycleWeekOf(date),
    cycleOverride: row.cycleWeek as Cycle | null,
    durationSeconds: row.durationSeconds,
    videoFormat: row.videoFormat as VideoFormat | null,
    summary: row.summary,
    videoFile: row.videoFile,
    coverFile: row.coverFile,
    script: row.script,
    question: row.question,
    voteOptions: row.voteOptions,
    voteResult: row.voteResult,
    voteCloses: row.voteCloses ? day(row.voteCloses) : null,
    notes: row.notes,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    archivedAt: iso(row.archivedAt),
    updatedAt: row.updatedAt.toISOString(),
    layers,
  };
}

const date = (key: string) => new Date(`${key}T00:00:00Z`);

/** Pieces from `from` to `to` (inclusive, any bound optional), in date and slot order. */
export async function getContentPieces({
  from,
  to,
  includeArchived = false,
}: {
  from?: string;
  to?: string;
  includeArchived?: boolean;
} = {}): Promise<ContentPieceDTO[]> {
  const rows = await db.contentPiece.findMany({
    where: {
      releaseDate: { ...(from ? { gte: date(from) } : {}), ...(to ? { lte: date(to) } : {}) },
      ...(includeArchived ? {} : { archivedAt: null }),
    },
    include: pieceInclude,
    orderBy: [{ releaseDate: "asc" }, { slot: "asc" }, { code: "asc" }],
  });
  return rows.map(toPieceDTO);
}

export async function getContentPiece(
  code: string,
): Promise<(ContentPieceDTO & { history: ContentHistoryDTO[] }) | null> {
  const row = await db.contentPiece.findUnique({
    where: { code },
    include: { ...pieceInclude, history: { orderBy: { at: "desc" }, take: 200 } },
  });
  if (!row) return null;
  return {
    ...toPieceDTO(row),
    history: row.history.map((h) => ({
      id: h.id,
      actor: h.actor,
      summary: h.summary,
      at: h.at.toISOString(),
    })),
  };
}

export async function getContentRubrics(): Promise<ContentRubricDTO[]> {
  return db.contentRubric.findMany({
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: { value: true, name: true, color: true },
  });
}

/** The saved weekly plan, or the spec's default until one is saved. */
export async function getContentPlan(): Promise<PlanRow[]> {
  const setting = await db.appSetting.findUnique({ where: { key: PLAN_KEY } });
  if (!setting) return DEFAULT_PLAN;
  try {
    const parsed = planSchema.safeParse(JSON.parse(setting.value));
    return parsed.success ? parsed.data : DEFAULT_PLAN;
  } catch {
    return DEFAULT_PLAN;
  }
}

/** Planned slots from `from` to `to` that no piece fills. */
export async function getEmptySlots(from: string, to: string) {
  const [plan, pieces] = await Promise.all([
    getContentPlan(),
    db.contentPiece.findMany({
      where: { releaseDate: { gte: date(from), lte: date(to) } },
      select: { releaseDate: true, slot: true, rubric: true, status: true, archivedAt: true },
    }),
  ]);
  return emptySlots(
    plannedSlots(plan, from, to),
    pieces.map((p) => ({
      date: day(p.releaseDate),
      slot: p.slot as Slot,
      rubric: p.rubric,
      status: p.status,
      archived: !!p.archivedAt,
    })),
  );
}

/** The "Da fare" panel: pieces of the last 60 days and the next 7, and empty slots. */
export async function getContentTodo(now: Date, today: string): Promise<TodoItem[]> {
  const [pieces, empty, rubrics] = await Promise.all([
    getContentPieces({ from: addDays(today, -60), to: addDays(today, 7) }),
    getEmptySlots(today, addDays(today, 7)),
    getContentRubrics(),
  ]);
  const names = new Map(rubrics.map((r) => [r.value, r.name]));
  return todoItems(
    pieces.map((p) => ({
      code: p.code,
      title: p.title,
      date: p.date,
      question: p.question,
      voteResult: p.voteResult,
      voteCloses: p.voteCloses,
      archived: !!p.archivedAt,
      status: p.status,
      layers: p.layers.map((l) => ({
        platform: l.platform,
        active: l.active,
        publishStatus: l.publishStatus,
        plannedAt: l.plannedAt,
        publishedAt: l.publishedAt,
        pinnedComment: l.pinnedComment,
        pinnedCommentDone: l.pinnedCommentDone,
        metrics: l.metrics.length,
      })),
    })),
    empty,
    now,
    (rubric) => names.get(rubric) ?? rubric,
  );
}
