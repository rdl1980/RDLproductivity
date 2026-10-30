import { z } from "zod";

import { addDays, daysBetween } from "./kdp-sales";

/**
 * Robotti e Robotte editorial calendar: pieces (schede) on a date and slot,
 * one layer per platform. Pure logic shared by the app, the actions and the
 * MCP tools. Days are "YYYY-MM-DD" strings; weeks run Monday to Sunday.
 */

export const CONTENT_TIME_ZONE = "Europe/Rome";

// --- Vocabulary ------------------------------------------------------------------

export const PLATFORMS = ["tiktok", "youtube", "instagram"] as const;
export type Platform = (typeof PLATFORMS)[number];
export const PLATFORM_LABELS: Record<Platform, string> = {
  tiktok: "TikTok",
  youtube: "YouTube",
  instagram: "Instagram",
};

export const SLOTS = ["13:00", "19:00"] as const;
export type Slot = (typeof SLOTS)[number];
export const SLOT_LABELS: Record<Slot, string> = {
  "13:00": "13:00 extra",
  "19:00": "19:00 principale",
};

/** Every piece status, in workflow order. */
export const PIECE_STATUSES = [
  "idea",
  "in scrittura",
  "da approvare",
  "approvato",
  "pronto",
  "programmato",
  "pubblicato",
  "scartato",
] as const;
export type PieceStatus = (typeof PIECE_STATUSES)[number];
/** The statuses set by hand: "programmato" and "pubblicato" come from the layers. */
export const MANUAL_STATUSES = [
  "idea",
  "in scrittura",
  "da approvare",
  "approvato",
  "pronto",
  "scartato",
] as const;
export type ManualStatus = (typeof MANUAL_STATUSES)[number];

export const LAYER_STATUSES = [
  "da preparare",
  "pronto",
  "programmato",
  "pubblicato",
  "problema",
] as const;
export type LayerStatus = (typeof LAYER_STATUSES)[number];

export const VIDEO_FORMATS = ["9:16", "16:9", "immagini"] as const;
export type VideoFormat = (typeof VIDEO_FORMATS)[number];

export const CYCLES = ["A", "B", "C", "D"] as const;
export type Cycle = (typeof CYCLES)[number];
/** Monday of the first "A" week. */
export const CYCLE_ORIGIN = "2026-11-02";

export const ACTORS = ["rosario", "claude"] as const;
export type Actor = (typeof ACTORS)[number];

export const WEEKDAYS = [
  "Lunedì",
  "Martedì",
  "Mercoledì",
  "Giovedì",
  "Venerdì",
  "Sabato",
  "Domenica",
] as const;

// --- Platform details ----------------------------------------------------------------

const text = (max: number) => z.string().max(max);

export const tiktokDetailsSchema = z.object({
  caption: text(4000).optional(),
  coverAt: z.number().min(0).max(36_000).nullable().optional(),
});
export const youtubeDetailsSchema = z.object({
  kind: z.enum(["Short", "Video lungo"]).optional(),
  title: text(100).optional(),
  description: text(5000).optional(),
  chapters: text(5000).optional(),
  playlist: text(200).optional(),
  syntheticDeclared: z.boolean().optional(),
  notForKids: z.boolean().optional(),
});
export const instagramDetailsSchema = z.object({
  kind: z.enum(["Reel", "Carosello", "Storia"]).optional(),
  caption: text(4000).optional(),
  imageCount: z.number().int().min(1).max(20).nullable().optional(),
});
export const DETAILS_SCHEMAS = {
  tiktok: tiktokDetailsSchema,
  youtube: youtubeDetailsSchema,
  instagram: instagramDetailsSchema,
} as const;

export type TiktokDetails = z.infer<typeof tiktokDetailsSchema>;
export type YoutubeDetails = z.infer<typeof youtubeDetailsSchema>;
export type InstagramDetails = z.infer<typeof instagramDetailsSchema>;
/** Any platform's details (each platform uses its own subset; `kind` differs per platform). */
export type LayerDetails = TiktokDetails &
  Omit<YoutubeDetails, "kind"> &
  Omit<InstagramDetails, "kind"> & { kind?: string };

/** Texts to publish of a layer, with their labels: each gets a Copy button. */
export function publishTexts(
  platform: Platform,
  details: LayerDetails,
  pinnedComment: string | null,
): { label: string; value: string }[] {
  const texts: { label: string; value: string | null | undefined }[] =
    platform === "youtube"
      ? [
          { label: "Titolo", value: details.title },
          { label: "Descrizione", value: details.description },
          { label: "Capitoli", value: details.chapters },
        ]
      : [{ label: "Didascalia", value: details.caption }];
  texts.push({ label: "Commento fissato", value: pinnedComment });
  return texts.filter((t): t is { label: string; value: string } => !!t.value?.trim());
}

// --- Dates ---------------------------------------------------------------------------

/** Monday of the week of `day`. */
export function mondayOf(day: string): string {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}

/** 1 = Monday … 7 = Sunday. */
export function isoWeekday(day: string): number {
  return ((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
}

/** A/B/C/D week of the cycle that contains `day` (the week of 2 November 2026 is A). */
export function cycleWeekOf(day: string): Cycle {
  const weeks = Math.floor(daysBetween(CYCLE_ORIGIN, mondayOf(day)) / 7);
  return CYCLES[((weeks % 4) + 4) % 4];
}

/** Offset of `timeZone` from UTC at `instant`, in minutes. */
function zoneOffset(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/** The instant of `day` at `time` ("HH:MM") in `timeZone`. */
export function zonedInstant(day: string, time: string, timeZone = CONTENT_TIME_ZONE): Date {
  const [y, m, d] = day.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, min);
  let instant = guess - zoneOffset(new Date(guess), timeZone) * 60_000;
  // Near a DST change the offset at the guess differs from the one at the result.
  instant = guess - zoneOffset(new Date(instant), timeZone) * 60_000;
  return new Date(instant);
}

/** ISO 8601 date-time of `instant` with the offset of `timeZone`, e.g. 2026-11-02T19:00:00+01:00. */
export function isoInZone(instant: Date, timeZone = CONTENT_TIME_ZONE): string {
  const offset = zoneOffset(instant, timeZone);
  const local = new Date(instant.getTime() + offset * 60_000).toISOString().slice(0, 19);
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  return `${local}${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/** Calendar day of `instant` in `timeZone`. */
export function dayIn(instant: Date, timeZone = CONTENT_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(instant);
}

// --- Layers and status -----------------------------------------------------------------

/** Layers a new piece gets (section 4 of the spec), with their kinds. */
export function defaultLayers(
  rubric: string,
  slot: Slot,
): { platform: Platform; details: LayerDetails }[] {
  if (rubric === "compilation") return [{ platform: "youtube", details: { kind: "Video lungo" } }];
  if (rubric === "carosello") return [{ platform: "instagram", details: { kind: "Carosello" } }];
  const layers: { platform: Platform; details: LayerDetails }[] = [
    { platform: "tiktok", details: {} },
    { platform: "youtube", details: { kind: "Short", notForKids: true } },
  ];
  if (slot === "19:00") layers.push({ platform: "instagram", details: { kind: "Reel" } });
  return layers;
}

const LAYER_RANK: Record<LayerStatus, number> = {
  problema: 0,
  "da preparare": 0,
  pronto: 1,
  programmato: 2,
  pubblicato: 3,
};

/**
 * What a piece shows: "programmato" once every active layer is scheduled,
 * "pubblicato" once every one is out, otherwise the manual status. `partial`
 * flags layers ahead of the rest (e.g. TikTok out, YouTube not yet).
 */
export function effectiveStatus(
  manual: ManualStatus,
  activeLayers: LayerStatus[],
): { status: PieceStatus; partial: boolean } {
  if (manual === "scartato" || activeLayers.length === 0) return { status: manual, partial: false };
  const ranks = activeLayers.map((s) => LAYER_RANK[s]);
  const min = Math.min(...ranks);
  const max = Math.max(...ranks);
  if (min >= 2) return { status: min === 3 ? "pubblicato" : "programmato", partial: max > min };
  return { status: manual, partial: max >= 2 };
}

/** Sum of the votes of the layers, per option (the options first, in order). */
export function voteTotals(
  options: string[],
  layers: { votes: Record<string, number> }[],
): { option: string; count: number }[] {
  const totals = new Map<string, number>(options.map((o) => [o, 0]));
  for (const layer of layers) {
    for (const [option, count] of Object.entries(layer.votes)) {
      totals.set(option, (totals.get(option) ?? 0) + count);
    }
  }
  return [...totals].map(([option, count]) => ({ option, count }));
}

// --- Weekly plan ------------------------------------------------------------------------

export const planRowSchema = z.object({
  /** 1 = Monday … 7 = Sunday. */
  weekday: z.number().int().min(1).max(7),
  slot: z.enum(SLOTS),
  rubric: z.string().min(1).max(60),
  /** Weeks of the cycle it applies to; empty or absent = every week. */
  cycles: z.array(z.enum(CYCLES)).max(4).optional(),
  /** First day it applies ("YYYY-MM-DD"); absent = always. */
  activeFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export const planSchema = z.array(planRowSchema).max(100);
export type PlanRow = z.infer<typeof planRowSchema>;

const from19 = "2026-11-02";
const from13 = "2026-11-16";

/** The plan of the spec (section 6), used until one is saved. */
export const DEFAULT_PLAN: PlanRow[] = [
  { weekday: 1, slot: "13:00", rubric: "lo-studio-esplode", activeFrom: from13 },
  { weekday: 1, slot: "19:00", rubric: "il-trono", activeFrom: from19 },
  { weekday: 2, slot: "13:00", rubric: "pov", activeFrom: from13 },
  { weekday: 2, slot: "19:00", rubric: "il-confessionale", activeFrom: from19 },
  { weekday: 3, slot: "13:00", rubric: "indovina-l-elettrodomestico", activeFrom: from13 },
  { weekday: 3, slot: "19:00", rubric: "cafoni-umani", activeFrom: from19 },
  { weekday: 4, slot: "13:00", rubric: "prima-e-dopo", activeFrom: from13 },
  {
    weekday: 4,
    slot: "19:00",
    rubric: "recensioni-a-una-stella",
    cycles: ["A"],
    activeFrom: from19,
  },
  { weekday: 4, slot: "19:00", rubric: "tg-delle-macchine", cycles: ["B"], activeFrom: from19 },
  { weekday: 4, slot: "19:00", rubric: "galateo-per-umani", cycles: ["C"], activeFrom: from19 },
  { weekday: 4, slot: "19:00", rubric: "origliana-ha-sentito", cycles: ["D"], activeFrom: from19 },
  { weekday: 5, slot: "13:00", rubric: "pov", activeFrom: from13 },
  { weekday: 5, slot: "19:00", rubric: "il-trono", activeFrom: from19 },
  {
    weekday: 6,
    slot: "19:00",
    rubric: "consigli-di-gemma",
    cycles: ["A", "C"],
    activeFrom: from19,
  },
  { weekday: 6, slot: "19:00", rubric: "trono-obsoleto", cycles: ["B", "D"], activeFrom: from19 },
  { weekday: 7, slot: "13:00", rubric: "speed-date", activeFrom: from13 },
  { weekday: 7, slot: "19:00", rubric: "compilation", activeFrom: from19 },
  { weekday: 7, slot: "19:00", rubric: "carosello", activeFrom: from19 },
];

export type PlannedSlot = { date: string; slot: Slot; rubric: string };

/** What the plan expects on each day from `from` to `to`. */
export function plannedSlots(plan: PlanRow[], from: string, to: string): PlannedSlot[] {
  const slots: PlannedSlot[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const weekday = isoWeekday(day);
    const cycle = cycleWeekOf(day);
    for (const row of plan) {
      if (row.weekday !== weekday) continue;
      if (row.activeFrom && day < row.activeFrom) continue;
      if (row.cycles?.length && !row.cycles.includes(cycle)) continue;
      slots.push({ date: day, slot: row.slot, rubric: row.rubric });
    }
  }
  return slots.sort((a, b) => a.date.localeCompare(b.date) || a.slot.localeCompare(b.slot));
}

/**
 * Planned slots no piece fills. In a day and slot, a piece of the planned
 * rubric fills its slot first; pieces of other rubrics fill what is left.
 * Discarded and archived pieces fill nothing.
 */
export function emptySlots(
  planned: PlannedSlot[],
  pieces: { date: string; slot: Slot; rubric: string; status: string; archived: boolean }[],
): PlannedSlot[] {
  const byCell = new Map<string, { rubric: string }[]>();
  for (const p of pieces) {
    if (p.archived || p.status === "scartato") continue;
    const key = `${p.date}|${p.slot}`;
    byCell.set(key, [...(byCell.get(key) ?? []), { rubric: p.rubric }]);
  }
  const empty: PlannedSlot[] = [];
  const cells = new Map<string, PlannedSlot[]>();
  for (const s of planned) {
    const key = `${s.date}|${s.slot}`;
    cells.set(key, [...(cells.get(key) ?? []), s]);
  }
  for (const [key, slots] of cells) {
    const left = [...(byCell.get(key) ?? [])];
    const open: PlannedSlot[] = [];
    for (const s of slots) {
      const match = left.findIndex((p) => p.rubric === s.rubric);
      if (match >= 0) left.splice(match, 1);
      else open.push(s);
    }
    // Pieces of other rubrics take the remaining slots of the cell.
    empty.push(...open.slice(left.length));
  }
  return empty.sort((a, b) => a.date.localeCompare(b.date) || a.slot.localeCompare(b.slot));
}

// --- To do ----------------------------------------------------------------------------------

export type TodoKind = "schedule" | "pin" | "vote" | "metrics" | "slot";

export type TodoItem = {
  kind: TodoKind;
  code: string | null;
  platform: Platform | null;
  date: string;
  text: string;
  /** For an empty slot, to create the piece. */
  slot?: PlannedSlot;
};

export type TodoPiece = {
  code: string;
  title: string;
  date: string;
  question: string | null;
  voteResult: string | null;
  voteCloses: string | null;
  archived: boolean;
  status: string;
  layers: {
    platform: Platform;
    active: boolean;
    publishStatus: LayerStatus;
    plannedAt: string | null;
    publishedAt: string | null;
    pinnedComment: string | null;
    pinnedCommentDone: boolean;
    metrics: number;
  }[];
};

/** What needs an action (section 5.5 of the spec), soonest first. */
export function todoItems(
  pieces: TodoPiece[],
  empty: PlannedSlot[],
  now: Date,
  rubricName: (rubric: string) => string,
): TodoItem[] {
  const today = dayIn(now);
  const inWeek = addDays(today, 7);
  const items: TodoItem[] = [];
  for (const piece of pieces) {
    if (piece.archived || piece.status === "scartato") continue;
    for (const layer of piece.layers) {
      if (!layer.active) continue;
      const label = `${piece.title} · ${PLATFORM_LABELS[layer.platform]}`;
      const planned = layer.plannedAt ? dayIn(new Date(layer.plannedAt)) : piece.date;
      if (layer.publishStatus === "pronto" && planned >= today && planned <= inWeek) {
        items.push({
          kind: "schedule",
          code: piece.code,
          platform: layer.platform,
          date: planned,
          text: `Da programmare: ${label}`,
        });
      }
      if (layer.publishStatus !== "pubblicato") continue;
      if (layer.pinnedComment?.trim() && !layer.pinnedCommentDone) {
        items.push({
          kind: "pin",
          code: piece.code,
          platform: layer.platform,
          date: piece.date,
          text: `Commento da fissare: ${label}`,
        });
      }
      const out = layer.publishedAt ?? layer.plannedAt;
      if (out && layer.metrics === 0 && now.getTime() - Date.parse(out) > 48 * 3600_000) {
        items.push({
          kind: "metrics",
          code: piece.code,
          platform: layer.platform,
          date: dayIn(new Date(out)),
          text: `Numeri da rilevare: ${label}`,
        });
      }
    }
    if (piece.question && piece.voteCloses && piece.voteCloses < today && !piece.voteResult) {
      items.push({
        kind: "vote",
        code: piece.code,
        platform: null,
        date: piece.voteCloses,
        text: `Voto chiuso senza esito: ${piece.title}`,
      });
    }
  }
  for (const slot of empty) {
    if (slot.date < today || slot.date > inWeek) continue;
    items.push({
      kind: "slot",
      code: null,
      platform: null,
      date: slot.date,
      text: `Slot vuoto: ${rubricName(slot.rubric)} (${slot.slot})`,
      slot,
    });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

// --- Validation shared by actions and tools ---------------------------------------------------

export const codeSchema = z
  .string()
  .trim()
  .regex(
    /^[a-z0-9][a-z0-9-]{0,59}$/,
    "Codice non valido: minuscole, cifre e trattini (es. ep002).",
  );
/** Code prefixes of the rubrics with an established naming (ep001, conf001, …). */
const CODE_PREFIXES: Record<string, string> = {
  "il-trono": "ep",
  "il-confessionale": "conf",
  "cafoni-umani": "caf",
  "recensioni-a-una-stella": "rec",
  "tg-delle-macchine": "tg",
  "galateo-per-umani": "gal",
  "origliana-ha-sentito": "ori",
  "consigli-di-gemma": "gem",
  "trono-obsoleto": "obs",
  "lo-studio-esplode": "studio",
  pov: "pov",
  "indovina-l-elettrodomestico": "ind",
  "prima-e-dopo": "agg",
  "speed-date": "spd",
  compilation: "comp",
  carosello: "car",
  speciale: "spec",
};

/** Prefix of the generated codes of a rubric; unknown rubrics use their value without dashes. */
export function codePrefix(rubric: string): string {
  return CODE_PREFIXES[rubric] ?? (rubric.replace(/-/g, "").slice(0, 12) || "c");
}

/** Next free code of the prefix: one more than the highest number taken ("ep003" → "ep004"). */
export function nextCode(prefix: string, taken: readonly string[]): string {
  const pattern = new RegExp(`^${prefix}(\\d+)$`);
  const highest = taken.reduce((max, code) => {
    const match = pattern.exec(code);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${prefix}${String(highest + 1).padStart(3, "0")}`;
}

export const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida (AAAA-MM-GG).");
export const colorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Colore non valido (#RRGGBB).");

/** Text color readable on `background` ("#RRGGBB"), black or white. */
export function textOn(background: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(background.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  // The one with more contrast: either is at least 4.5:1 on any color.
  const onWhite = 1.05 / (luminance + 0.05);
  const onBlack = (luminance + 0.05) / 0.05;
  return onBlack >= onWhite ? "#000000" : "#FFFFFF";
}
