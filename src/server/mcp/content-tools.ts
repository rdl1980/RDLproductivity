import "server-only";

import { z } from "zod";

import {
  CYCLES,
  isoInZone,
  LAYER_STATUSES,
  MANUAL_STATUSES,
  PIECE_STATUSES,
  type Platform,
  PLATFORMS,
  SLOTS,
  VIDEO_FORMATS,
  voteTotals,
  WEEKDAYS,
} from "@/lib/content";
import { daysBetween } from "@/lib/kdp-sales";
import {
  addContentMetric,
  archiveContentPiece,
  type LayerFields,
  type PieceFields,
  recordContentVotes,
  restoreContentPiece,
  saveContentPiece,
  saveContentPlan,
  saveContentRubric,
  updateContentLayer,
} from "@/server/actions/content";
import { type ActionResult, fail, ok } from "@/server/actions/result";
import {
  type ContentLayerDTO,
  type ContentMetricDTO,
  type ContentPieceDTO,
  getContentPiece,
  getContentPieces,
  getContentPlan,
  getContentRubrics,
  getEmptySlots,
} from "@/server/queries/content";

/**
 * MCP tools of the Robotti e Robotte calendar. Names and fields are the
 * Italian ones of the spec (docs/specifiche-calendario-contenuti.md); they map
 * onto the app's actions, so every write is logged with "claude" as author.
 */

type Annotations = { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean };
type Define = <S extends z.ZodObject>(
  name: string,
  config: { title: string; description: string; inputSchema: S; annotations: Annotations },
  run: (input: z.output<S>) => Promise<ActionResult<unknown>>,
) => void;

const READ: Annotations = { readOnlyHint: true };
const WRITE: Annotations = { readOnlyHint: false, destructiveHint: false };

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("Data AAAA-MM-GG (Europe/Rome)");
const dateTime = z.iso
  .datetime({ offset: true })
  .describe("Data e ora ISO 8601 con fuso, es. 2026-11-02T19:00:00+01:00");
const code = z.string().min(1).max(60).describe("Codice della scheda, es. ep002");
const platform = z.enum(PLATFORMS).describe("tiktok, youtube o instagram");

// --- Input (Italian) → actions ----------------------------------------------------------

const pieceFields = {
  titolo: z.string().max(200).optional(),
  rubrica: z.string().max(60).optional().describe("Valore della rubrica, es. il-trono"),
  data_uscita: day.optional(),
  fascia: z.enum(SLOTS).optional(),
  stato: z
    .enum(MANUAL_STATUSES)
    .optional()
    .describe("idea … pronto o scartato; programmato e pubblicato si calcolano dai layer"),
  settimana_ciclo: z.enum(CYCLES).nullable().optional().describe("null = calcolata dalla data"),
  durata_secondi: z.number().int().min(0).nullable().optional(),
  formato_video: z.enum(VIDEO_FORMATS).nullable().optional(),
  riassunto: z.string().nullable().optional(),
  file_video: z.string().nullable().optional(),
  file_copertina: z.string().nullable().optional(),
  copione: z.string().nullable().optional(),
  domanda: z.string().nullable().optional(),
  opzioni_voto: z.array(z.string()).optional(),
  esito_voto: z.string().nullable().optional(),
  voto_chiude: day.nullable().optional(),
  note: z.string().nullable().optional(),
};
const PIECE_KEYS: Record<keyof typeof pieceFields, keyof PieceFields> = {
  titolo: "title",
  rubrica: "rubric",
  data_uscita: "releaseDate",
  fascia: "slot",
  stato: "status",
  settimana_ciclo: "cycleWeek",
  durata_secondi: "durationSeconds",
  formato_video: "videoFormat",
  riassunto: "summary",
  file_video: "videoFile",
  file_copertina: "coverFile",
  copione: "script",
  domanda: "question",
  opzioni_voto: "voteOptions",
  esito_voto: "voteResult",
  voto_chiude: "voteCloses",
  note: "notes",
};

const layerSchema = z
  .object({
    attivo: z.boolean().optional(),
    stato_pubblicazione: z.enum(LAYER_STATUSES).optional(),
    data_ora_prevista: dateTime.nullable().optional().describe("null = data e fascia della scheda"),
    data_ora_pubblicazione: dateTime.nullable().optional(),
    url: z.string().nullable().optional(),
    etichetta_ia: z.boolean().optional(),
    copertina_scelta: z.boolean().optional(),
    commento_fissato: z.string().nullable().optional(),
    commento_fissato_fatto: z.boolean().optional(),
    voti: z.record(z.string(), z.number().int().min(0)).optional(),
    note_piattaforma: z.string().nullable().optional(),
    // Platform fields.
    didascalia: z.string().optional().describe("TikTok e Instagram, hashtag compresi"),
    copertina_istante: z.number().min(0).nullable().optional().describe("TikTok, secondi"),
    tipo: z
      .string()
      .optional()
      .describe("YouTube: Short | Video lungo; Instagram: Reel | Carosello | Storia"),
    titolo_yt: z.string().max(100).optional(),
    descrizione: z.string().optional(),
    capitoli: z.string().optional(),
    playlist: z.string().optional(),
    contenuto_sintetico_dichiarato: z.boolean().optional(),
    non_per_bambini: z.boolean().optional(),
    numero_immagini: z.number().int().min(1).nullable().optional(),
  })
  .strict();
type LayerInput = z.infer<typeof layerSchema>;

const LAYER_KEYS = {
  attivo: "active",
  stato_pubblicazione: "publishStatus",
  data_ora_prevista: "plannedAt",
  data_ora_pubblicazione: "publishedAt",
  url: "url",
  etichetta_ia: "aiLabel",
  copertina_scelta: "coverChosen",
  commento_fissato: "pinnedComment",
  commento_fissato_fatto: "pinnedCommentDone",
  voti: "votes",
  note_piattaforma: "notes",
} as const;
const DETAIL_KEYS = {
  didascalia: "caption",
  copertina_istante: "coverAt",
  tipo: "kind",
  titolo_yt: "title",
  descrizione: "description",
  capitoli: "chapters",
  playlist: "playlist",
  contenuto_sintetico_dichiarato: "syntheticDeclared",
  non_per_bambini: "notForKids",
  numero_immagini: "imageCount",
} as const;

function toLayerFields(input: LayerInput): LayerFields {
  const fields: Record<string, unknown> = {};
  const details: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (key in LAYER_KEYS) fields[LAYER_KEYS[key as keyof typeof LAYER_KEYS]] = value;
    else if (key in DETAIL_KEYS) details[DETAIL_KEYS[key as keyof typeof DETAIL_KEYS]] = value;
  }
  if (Object.keys(details).length) fields.details = details;
  return fields as LayerFields;
}

function toPieceFields(input: Record<string, unknown>): PieceFields {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || !(key in PIECE_KEYS)) continue;
    fields[PIECE_KEYS[key as keyof typeof PIECE_KEYS]] = value;
  }
  return fields as PieceFields;
}

// --- Actions → output (Italian) -------------------------------------------------------------

const rome = (iso: string | null) => (iso ? isoInZone(new Date(iso)) : null);

function metricOut(m: ContentMetricDTO) {
  return {
    rilevato_il: rome(m.measuredAt),
    visualizzazioni: m.views,
    mi_piace: m.likes,
    commenti: m.comments,
    condivisioni: m.shares,
    salvataggi: m.saves,
    completamento_percentuale: m.completion,
    nuovi_follower: m.newFollowers,
    ore_di_visione: m.watchHours,
  };
}

function layerOut(layer: ContentLayerDTO, allMetrics: boolean) {
  const d = layer.details;
  const platformFields =
    layer.platform === "tiktok"
      ? { didascalia: d.caption ?? null, copertina_istante: d.coverAt ?? null }
      : layer.platform === "youtube"
        ? {
            tipo: d.kind ?? null,
            titolo_yt: d.title ?? null,
            descrizione: d.description ?? null,
            capitoli: d.chapters ?? null,
            playlist: d.playlist ?? null,
            contenuto_sintetico_dichiarato: d.syntheticDeclared ?? false,
            non_per_bambini: d.notForKids ?? true,
          }
        : {
            tipo: d.kind ?? null,
            didascalia: d.caption ?? null,
            numero_immagini: d.imageCount ?? null,
          };
  const last = layer.metrics.at(-1);
  return {
    attivo: layer.active,
    stato_pubblicazione: layer.publishStatus,
    data_ora_prevista: rome(layer.plannedAt),
    data_ora_prevista_manuale: layer.plannedAtManual,
    data_ora_pubblicazione: rome(layer.publishedAt),
    url: layer.url,
    etichetta_ia: layer.aiLabel,
    copertina_scelta: layer.coverChosen,
    commento_fissato: layer.pinnedComment,
    commento_fissato_fatto: layer.pinnedCommentDone,
    voti: layer.votes,
    note_piattaforma: layer.notes,
    ...platformFields,
    ...(allMetrics
      ? { metriche: layer.metrics.map(metricOut) }
      : { ultima_rilevazione: last ? metricOut(last) : null }),
  };
}

function pieceOut(piece: ContentPieceDTO, allMetrics = false) {
  return {
    codice: piece.code,
    titolo: piece.title,
    rubrica: piece.rubric,
    data_uscita: piece.date,
    fascia: piece.slot,
    stato: piece.shown.status,
    in_parte: piece.shown.partial,
    stato_manuale: piece.status,
    settimana_ciclo: piece.cycleWeek,
    settimana_ciclo_manuale: piece.cycleOverride !== null,
    durata_secondi: piece.durationSeconds,
    formato_video: piece.videoFormat,
    riassunto: piece.summary,
    file_video: piece.videoFile,
    file_copertina: piece.coverFile,
    copione: piece.script,
    domanda: piece.question,
    opzioni_voto: piece.voteOptions,
    esito_voto: piece.voteResult,
    voto_chiude: piece.voteCloses,
    totale_voti: piece.question
      ? voteTotals(
          piece.voteOptions,
          piece.layers.filter((l) => l.active),
        ).map((t) => ({ opzione: t.option, voti: t.count }))
      : null,
    note: piece.notes,
    creato_da: piece.createdBy,
    modificato_da: piece.updatedBy,
    archiviata: piece.archivedAt !== null,
    modificata_il: rome(piece.updatedAt),
    layers: Object.fromEntries(piece.layers.map((l) => [l.platform, layerOut(l, allMetrics)])),
  };
}

async function full(code: string) {
  const piece = await getContentPiece(code);
  if (!piece) return fail(`Scheda «${code}» non trovata.`);
  return ok({
    ...pieceOut(piece, true),
    cronologia: piece.history.map((h) => ({ chi: h.actor, quando: rome(h.at), cosa: h.summary })),
  });
}

const then = async (
  action: Promise<ActionResult<ContentPieceDTO>>,
): Promise<ActionResult<unknown>> => {
  const result = await action;
  return result.ok ? full(result.data.code) : result;
};

function range(dal: string, al: string): string | null {
  if (al < dal) return "«al» deve essere uguale o successivo a «dal».";
  if (daysBetween(dal, al) > 366) return "Intervallo troppo lungo: al massimo un anno.";
  return null;
}

const planRowIn = z
  .object({
    giorno: z.number().int().min(1).max(7).describe("1 = lunedì … 7 = domenica"),
    fascia: z.enum(SLOTS),
    rubrica: z.string().min(1).max(60),
    settimane_ciclo: z
      .array(z.enum(CYCLES))
      .optional()
      .describe("Settimane A/B/C/D in cui vale; assente = tutte"),
    attivo_dal: day.optional().describe("Prima data in cui lo slot compare"),
  })
  .strict();

export function registerContentTools(define: Define) {
  define(
    "calendario_elenco",
    {
      title: "Robotti e Robotte: list calendar pieces",
      description:
        "Pieces (schede) of the Robotti e Robotte content calendar between two dates, with their " +
        "platform layers and the latest metrics reading of each. Optional filters: platform " +
        "(active layer), shown status, rubric.",
      inputSchema: z.object({
        dal: day,
        al: day,
        piattaforma: platform.optional(),
        stato: z.enum(PIECE_STATUSES).optional(),
        rubrica: z.string().optional(),
      }),
      annotations: READ,
    },
    async ({ dal, al, piattaforma, stato, rubrica }) => {
      const invalid = range(dal, al);
      if (invalid) return fail(invalid);
      const pieces = (await getContentPieces({ from: dal, to: al })).filter(
        (p) =>
          (!piattaforma || p.layers.some((l) => l.platform === piattaforma && l.active)) &&
          (!stato || p.shown.status === stato) &&
          (!rubrica || p.rubric === rubrica),
      );
      return ok(pieces.map((p) => pieceOut(p)));
    },
  );

  define(
    "calendario_slot_vuoti",
    {
      title: "Robotti e Robotte: empty planned slots",
      description:
        "Slots the weekly plan expects between two dates (day, time slot, rubric) that no piece " +
        "fills yet, with the A/B/C/D cycle rotation and activation dates applied.",
      inputSchema: z.object({ dal: day, al: day }),
      annotations: READ,
    },
    async ({ dal, al }) => {
      const invalid = range(dal, al);
      if (invalid) return fail(invalid);
      const [slots, rubrics] = await Promise.all([getEmptySlots(dal, al), getContentRubrics()]);
      const names = new Map(rubrics.map((r) => [r.value, r.name]));
      return ok(
        slots.map((s) => ({
          data: s.date,
          fascia: s.slot,
          rubrica: s.rubric,
          nome_rubrica: names.get(s.rubric) ?? s.rubric,
        })),
      );
    },
  );

  define(
    "contributo_leggi",
    {
      title: "Robotti e Robotte: read a piece",
      description:
        "One piece by code: common fields, every layer with all its metrics readings, vote " +
        "totals and the change history.",
      inputSchema: z.object({ codice: code }),
      annotations: READ,
    },
    ({ codice }) => full(codice),
  );

  define(
    "contributo_salva",
    {
      title: "Robotti e Robotte: create or update a piece",
      description:
        "Creates the piece with this code, or updates it (idempotent, partial: fields not " +
        "passed stay as they are). Creating needs titolo, rubrica, data_uscita and fascia; the " +
        "default layers follow the rubric and slot (19:00 TikTok+YouTube Short+Instagram Reel, " +
        "13:00 TikTok+YouTube Short, compilation YouTube long video, carosello Instagram " +
        "carousel). `layers` updates or activates single platforms. Fields may also be nested " +
        "in `campi`. Returns the saved piece.",
      inputSchema: z
        .object({
          codice: code,
          ...pieceFields,
          campi: z.object(pieceFields).strict().optional(),
          layers: z.partialRecord(platform, layerSchema).optional(),
        })
        .strict(),
      annotations: { ...WRITE, idempotentHint: true },
    },
    ({ codice, campi, layers, ...flat }) =>
      then(
        saveContentPiece({
          code: codice,
          fields: toPieceFields({ ...flat, ...(campi ?? {}) }),
          layers: layers
            ? Object.fromEntries(
                Object.entries(layers).map(([p, l]) => [p, toLayerFields(l as LayerInput)]),
              )
            : undefined,
        }),
      ),
  );

  define(
    "layer_aggiorna",
    {
      title: "Robotti e Robotte: update one platform layer",
      description:
        "Updates one platform layer of a piece (texts, publication status, times, URL, " +
        "checklist); activates it if it is not active. Returns the saved piece.",
      inputSchema: z.object({ codice: code, piattaforma: platform, campi: layerSchema }),
      annotations: { ...WRITE, idempotentHint: true },
    },
    ({ codice, piattaforma, campi }) =>
      then(
        updateContentLayer({
          code: codice,
          platform: piattaforma as Platform,
          fields: toLayerFields(campi),
        }),
      ),
  );

  define(
    "metriche_aggiungi",
    {
      title: "Robotti e Robotte: add a metrics reading",
      description:
        "Adds a reading of a layer's numbers (earlier readings stay): views, likes, comments, " +
        "shares, saves, completion %, new followers, watch hours. rilevato_il defaults to now.",
      inputSchema: z.object({
        codice: code,
        piattaforma: platform,
        rilevazione: z
          .object({
            rilevato_il: dateTime.optional(),
            visualizzazioni: z.number().int().min(0).nullable().optional(),
            mi_piace: z.number().int().min(0).nullable().optional(),
            commenti: z.number().int().min(0).nullable().optional(),
            condivisioni: z.number().int().min(0).nullable().optional(),
            salvataggi: z.number().int().min(0).nullable().optional(),
            completamento_percentuale: z.number().min(0).max(100).nullable().optional(),
            nuovi_follower: z.number().int().nullable().optional(),
            ore_di_visione: z.number().min(0).nullable().optional(),
          })
          .strict(),
      }),
      annotations: WRITE,
    },
    ({ codice, piattaforma, rilevazione: r }) =>
      then(
        addContentMetric({
          code: codice,
          platform: piattaforma as Platform,
          reading: {
            measuredAt: r.rilevato_il,
            views: r.visualizzazioni,
            likes: r.mi_piace,
            comments: r.commenti,
            shares: r.condivisioni,
            saves: r.salvataggi,
            completion: r.completamento_percentuale,
            newFollowers: r.nuovi_follower,
            watchHours: r.ore_di_visione,
          },
        }),
      ),
  );

  define(
    "voto_registra",
    {
      title: "Robotti e Robotte: record votes",
      description:
        "Saves the vote counts per platform (option → count; replaces that platform's counts) " +
        "and, if given, the outcome (esito).",
      inputSchema: z.object({
        codice: code,
        conteggi_per_piattaforma: z.partialRecord(
          platform,
          z.record(z.string(), z.number().int().min(0)),
        ),
        esito: z.string().nullable().optional(),
      }),
      annotations: { ...WRITE, idempotentHint: true },
    },
    ({ codice, conteggi_per_piattaforma, esito }) =>
      then(
        recordContentVotes({
          code: codice,
          counts: conteggi_per_piattaforma as Partial<Record<Platform, Record<string, number>>>,
          result: esito,
        }),
      ),
  );

  define(
    "contributo_archivia",
    {
      title: "Robotti e Robotte: archive a piece",
      description:
        "Hides a piece from the calendar. Nothing is deleted: contributo_ripristina undoes it.",
      inputSchema: z.object({ codice: code }),
      annotations: { ...WRITE, idempotentHint: true },
    },
    ({ codice }) => then(archiveContentPiece(codice)),
  );

  define(
    "contributo_ripristina",
    {
      title: "Robotti e Robotte: restore a piece",
      description: "Brings an archived piece back into the calendar.",
      inputSchema: z.object({ codice: code }),
      annotations: { ...WRITE, idempotentHint: true },
    },
    ({ codice }) => then(restoreContentPiece(codice)),
  );

  define(
    "rubriche_elenco",
    {
      title: "Robotti e Robotte: list rubrics",
      description: "The rubrics (formats) of the channel: value, name and color.",
      inputSchema: z.object({}),
      annotations: READ,
    },
    async () =>
      ok(
        (await getContentRubrics()).map((r) => ({
          valore: r.value,
          nome: r.name,
          colore: r.color,
        })),
      ),
  );

  define(
    "rubrica_salva",
    {
      title: "Robotti e Robotte: add or edit a rubric",
      description:
        "Adds a rubric, or renames / recolors an existing one (by value). Color as #RRGGBB.",
      inputSchema: z.object({
        valore: z.string().min(1).max(60).describe("Chiave stabile, es. il-trono"),
        nome: z.string().min(1).max(100),
        colore: z.string().describe("#RRGGBB"),
      }),
      annotations: { ...WRITE, idempotentHint: true },
    },
    async ({ valore, nome, colore }) => {
      const result = await saveContentRubric({ value: valore, name: nome, color: colore });
      return result.ok
        ? ok(result.data.map((r) => ({ valore: r.value, nome: r.name, colore: r.color })))
        : result;
    },
  );

  define(
    "piano_leggi",
    {
      title: "Robotti e Robotte: read the weekly plan",
      description:
        "The weekly plan that generates the empty slots: one row per day (1 = Monday … 7 = " +
        "Sunday), time slot and rubric, with optional A/B/C/D cycle weeks and activation date.",
      inputSchema: z.object({}),
      annotations: READ,
    },
    async () =>
      ok(
        (await getContentPlan()).map((row) => ({
          giorno: row.weekday,
          nome_giorno: WEEKDAYS[row.weekday - 1],
          fascia: row.slot,
          rubrica: row.rubric,
          settimane_ciclo: row.cycles ?? [],
          attivo_dal: row.activeFrom ?? null,
        })),
      ),
  );

  define(
    "piano_salva",
    {
      title: "Robotti e Robotte: replace the weekly plan",
      description:
        "Replaces the whole weekly plan (read it first with piano_leggi). Two rows in the same " +
        "day and slot mean two pieces there (e.g. Sunday 19:00 compilation and carousel).",
      inputSchema: z.object({ modello: z.array(planRowIn).max(100) }),
      annotations: WRITE,
    },
    async ({ modello }) => {
      const result = await saveContentPlan(
        modello.map((row) => ({
          weekday: row.giorno,
          slot: row.fascia,
          rubric: row.rubrica,
          ...(row.settimane_ciclo?.length ? { cycles: row.settimane_ciclo } : {}),
          ...(row.attivo_dal ? { activeFrom: row.attivo_dal } : {}),
        })),
      );
      return result.ok ? ok({ righe: result.data.length }) : result;
    },
  );
}
