"use client";

import { ArchiveIcon, ArchiveRestoreIcon, CopyPlusIcon, ExternalLinkIcon } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { LocalDateTime } from "@/components/local-date-time";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  CYCLES,
  cycleWeekOf,
  LAYER_STATUSES,
  MANUAL_STATUSES,
  PLATFORM_LABELS,
  type Platform,
  PLATFORMS,
  publishTexts,
  SLOT_LABELS,
  SLOTS,
  type Slot,
  VIDEO_FORMATS,
  voteTotals,
} from "@/lib/content";
import {
  addContentMetric,
  archiveContentPiece,
  duplicateContentPiece,
  type LayerFields,
  loadContentPiece,
  type PieceFields,
  restoreContentPiece,
  saveContentPiece,
} from "@/server/actions/content";
import type { ActionResult } from "@/server/actions/result";
import type {
  ContentHistoryDTO,
  ContentLayerDTO,
  ContentPieceDTO,
  ContentRubricDTO,
} from "@/server/queries/content";

import {
  CopyButton,
  fromLocalInput,
  LayerBadge,
  RubricChip,
  StatusText,
  toLocalInput,
} from "./content-ui";

export type PieceDraft = { date: string; slot: Slot; rubric: string };
type Detail = ContentPieceDTO & { history: ContentHistoryDTO[] };

const NETWORK = "Errore di rete, riprova.";
const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

function Field({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className ? `flex flex-col gap-1 ${className}` : "flex flex-col gap-1"}>
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

const str = (form: FormData, key: string) => {
  const value = String(form.get(key) ?? "").trim();
  return value === "" ? null : value;
};
const num = (form: FormData, key: string) => {
  const value = str(form, key);
  return value === null ? null : Number(value.replace(",", "."));
};

/**
 * Detail of a piece: common fields, one tab per active layer with its texts
 * (Copy buttons), checklist, votes and metrics, then the history. With a
 * draft and no code, the short form that creates the piece.
 */
export function PieceDialog({
  code,
  draft,
  rubrics,
  onClose,
  onSaved,
}: {
  code: string | null;
  draft: PieceDraft | null;
  rubrics: ContentRubricDTO[];
  onClose: () => void;
  onSaved: (piece: ContentPieceDTO) => void;
}) {
  const open = code !== null || draft !== null;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [currentCode, setCurrentCode] = useState<string | null>(code);
  const [pending, start] = useTransition();
  if (code !== currentCode && code !== null) {
    setCurrentCode(code);
    setDetail(null);
  }

  useEffect(() => {
    if (!currentCode) return;
    let cancelled = false;
    void loadContentPiece(currentCode)
      .then((r) => {
        if (cancelled) return;
        if (r.ok) setDetail(r.data);
        else toast.error(r.error);
      })
      .catch(() => toast.error(NETWORK));
    return () => {
      cancelled = true;
    };
  }, [currentCode]);

  function close() {
    setCurrentCode(null);
    setDetail(null);
    onClose();
  }

  /** Runs an action that returns the piece, then reloads the detail with its history. */
  function run(action: () => Promise<ActionResult<ContentPieceDTO>>, message?: string) {
    start(async () => {
      const r = await action().catch((): ActionResult<ContentPieceDTO> => ({
        ok: false,
        error: NETWORK,
      }));
      if (!r.ok) return void toast.error(r.error);
      onSaved(r.data);
      if (message) toast.success(message);
      if (r.data.code !== currentCode) setCurrentCode(r.data.code);
      const reloaded = await loadContentPiece(r.data.code).catch(() => null);
      if (reloaded?.ok) setDetail(reloaded.data);
    });
  }

  const rubricOf = (value: string) => rubrics.find((r) => r.value === value);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent
        className="max-h-[92vh] overflow-y-auto sm:max-w-3xl"
        data-testid="piece-dialog"
      >
        {!currentCode && draft ? (
          <CreateForm
            draft={draft}
            rubrics={rubrics}
            pending={pending}
            onCreate={(created) =>
              run(
                () => saveContentPiece({ code: created.code, fields: created.fields }),
                "Scheda creata",
              )
            }
          />
        ) : !detail ? (
          <>
            <DialogHeader>
              <DialogTitle>Scheda</DialogTitle>
              <DialogDescription>Caricamento…</DialogDescription>
            </DialogHeader>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2">
                <RubricChip rubric={rubricOf(detail.rubric)} />
                <span className="font-mono text-xs text-muted-foreground">{detail.code}</span>
                {detail.archivedAt && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs">archiviata</span>
                )}
              </div>
              <DialogTitle>{detail.title}</DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-2">
                <StatusText piece={detail} />
                <span>· settimana {detail.cycleWeek}</span>
                {detail.layers
                  .filter((l) => l.active)
                  .map((l) => (
                    <LayerBadge key={l.platform} layer={l} />
                  ))}
              </DialogDescription>
            </DialogHeader>

            <CommonForm
              key={`common-${detail.updatedAt}`}
              piece={detail}
              rubrics={rubrics}
              pending={pending}
              onSave={(fields) =>
                run(() => saveContentPiece({ code: detail.code, fields }), "Scheda salvata")
              }
            />

            <Layers
              piece={detail}
              pending={pending}
              onLayer={(platform, fields, message) =>
                run(
                  () => saveContentPiece({ code: detail.code, layers: { [platform]: fields } }),
                  message,
                )
              }
              onMetric={(platform, reading) =>
                run(
                  () => addContentMetric({ code: detail.code, platform, reading }),
                  "Rilevazione aggiunta",
                )
              }
            />

            {detail.question && <Votes piece={detail} />}

            <PieceActions
              piece={detail}
              pending={pending}
              onArchive={() =>
                run(
                  () =>
                    detail.archivedAt
                      ? restoreContentPiece(detail.code)
                      : archiveContentPiece(detail.code),
                  detail.archivedAt ? "Scheda ripristinata" : "Scheda archiviata",
                )
              }
              onDuplicate={(newCode) =>
                run(
                  () => duplicateContentPiece({ code: detail.code, newCode }),
                  `Duplicata come ${newCode}`,
                )
              }
            />

            <section aria-label="Cronologia" className="flex flex-col gap-1.5 border-t pt-3">
              <h3 className="text-sm font-semibold">Cronologia</h3>
              <ul
                className="flex max-h-48 flex-col gap-1 overflow-y-auto text-xs"
                data-testid="piece-history"
              >
                {detail.history.map((h) => (
                  <li key={h.id} className="flex gap-2">
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      <LocalDateTime value={new Date(h.at)} />
                    </span>
                    <span className="shrink-0 font-medium">{h.actor}</span>
                    <span className="min-w-0">{h.summary}</span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreateForm({
  draft,
  rubrics,
  pending,
  onCreate,
}: {
  draft: PieceDraft;
  rubrics: ContentRubricDTO[];
  pending: boolean;
  onCreate: (input: { code: string; fields: PieceFields }) => void;
}) {
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        onCreate({
          code: String(form.get("code") ?? "").trim(),
          fields: {
            title: String(form.get("title") ?? "").trim(),
            rubric: String(form.get("rubric")),
            releaseDate: String(form.get("releaseDate")),
            slot: String(form.get("slot")) as Slot,
            status: String(form.get("status")) as PieceFields["status"],
          },
        });
      }}
    >
      <DialogHeader>
        <DialogTitle>Nuova scheda</DialogTitle>
        <DialogDescription>
          I layer si attivano in base a rubrica e fascia; poi si completano nella scheda.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Codice (es. ep002)" htmlFor="new-code">
          <Input id="new-code" name="code" required pattern="[a-z0-9][a-z0-9\-]*" autoFocus />
        </Field>
        <Field label="Titolo" htmlFor="new-title">
          <Input id="new-title" name="title" required maxLength={200} />
        </Field>
        <Field label="Rubrica" htmlFor="new-rubric">
          <select id="new-rubric" name="rubric" defaultValue={draft.rubric} className={selectClass}>
            {rubrics.map((r) => (
              <option key={r.value} value={r.value}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Stato" htmlFor="new-status">
          <select id="new-status" name="status" defaultValue="idea" className={selectClass}>
            {MANUAL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Data di uscita" htmlFor="new-date">
          <Input id="new-date" name="releaseDate" type="date" defaultValue={draft.date} required />
        </Field>
        <Field label="Fascia" htmlFor="new-slot">
          <select id="new-slot" name="slot" defaultValue={draft.slot} className={selectClass}>
            {SLOTS.map((s) => (
              <option key={s} value={s}>
                {SLOT_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        Crea scheda
      </Button>
    </form>
  );
}

function CommonForm({
  piece,
  rubrics,
  pending,
  onSave,
}: {
  piece: Detail;
  rubrics: ContentRubricDTO[];
  pending: boolean;
  onSave: (fields: PieceFields) => void;
}) {
  return (
    <form
      className="flex flex-col gap-3"
      aria-label="Campi comuni"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const cycle = str(form, "cycleWeek");
        onSave({
          title: String(form.get("title") ?? "").trim(),
          rubric: String(form.get("rubric")),
          releaseDate: String(form.get("releaseDate")),
          slot: String(form.get("slot")) as Slot,
          status: String(form.get("status")) as PieceFields["status"],
          cycleWeek: cycle as PieceFields["cycleWeek"],
          durationSeconds: num(form, "durationSeconds"),
          videoFormat: str(form, "videoFormat") as PieceFields["videoFormat"],
          summary: str(form, "summary"),
          videoFile: str(form, "videoFile"),
          coverFile: str(form, "coverFile"),
          script: str(form, "script"),
          question: str(form, "question"),
          voteOptions: String(form.get("voteOptions") ?? "")
            .split(",")
            .map((o) => o.trim())
            .filter(Boolean),
          voteCloses: str(form, "voteCloses"),
          voteResult: str(form, "voteResult"),
          notes: str(form, "notes"),
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Titolo" htmlFor="f-title" className="sm:col-span-2">
          <Input id="f-title" name="title" defaultValue={piece.title} required maxLength={200} />
        </Field>
        <Field label="Rubrica" htmlFor="f-rubric">
          <select id="f-rubric" name="rubric" defaultValue={piece.rubric} className={selectClass}>
            {rubrics.map((r) => (
              <option key={r.value} value={r.value}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Stato" htmlFor="f-status">
          <select id="f-status" name="status" defaultValue={piece.status} className={selectClass}>
            {MANUAL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Data di uscita" htmlFor="f-date">
          <Input id="f-date" name="releaseDate" type="date" defaultValue={piece.date} required />
        </Field>
        <Field label="Fascia" htmlFor="f-slot">
          <select id="f-slot" name="slot" defaultValue={piece.slot} className={selectClass}>
            {SLOTS.map((s) => (
              <option key={s} value={s}>
                {SLOT_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Settimana del ciclo" htmlFor="f-cycle">
          <select
            id="f-cycle"
            name="cycleWeek"
            defaultValue={piece.cycleOverride ?? ""}
            className={selectClass}
          >
            <option value="">Automatica ({cycleWeekOf(piece.date)})</option>
            {CYCLES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Formato" htmlFor="f-format">
          <select
            id="f-format"
            name="videoFormat"
            defaultValue={piece.videoFormat ?? ""}
            className={selectClass}
          >
            <option value="">—</option>
            {VIDEO_FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Durata (secondi)" htmlFor="f-duration">
          <Input
            id="f-duration"
            name="durationSeconds"
            type="number"
            min={0}
            defaultValue={piece.durationSeconds ?? ""}
          />
        </Field>
        <Field label="File video" htmlFor="f-video">
          <Input id="f-video" name="videoFile" defaultValue={piece.videoFile ?? ""} />
        </Field>
        <Field label="File copertina" htmlFor="f-cover">
          <Input id="f-cover" name="coverFile" defaultValue={piece.coverFile ?? ""} />
        </Field>
        <Field label="Copione" htmlFor="f-script">
          <Input id="f-script" name="script" defaultValue={piece.script ?? ""} />
        </Field>
        <Field label="Riassunto" htmlFor="f-summary" className="sm:col-span-4">
          <Textarea id="f-summary" name="summary" rows={2} defaultValue={piece.summary ?? ""} />
        </Field>
        <Field label="Domanda del voto" htmlFor="f-question" className="sm:col-span-2">
          <Input id="f-question" name="question" defaultValue={piece.question ?? ""} />
        </Field>
        <Field label="Opzioni (separate da virgola)" htmlFor="f-options">
          <Input id="f-options" name="voteOptions" defaultValue={piece.voteOptions.join(", ")} />
        </Field>
        <Field label="Il voto chiude il" htmlFor="f-closes">
          <Input
            id="f-closes"
            name="voteCloses"
            type="date"
            defaultValue={piece.voteCloses ?? ""}
          />
        </Field>
        <Field label="Esito del voto" htmlFor="f-result" className="sm:col-span-2">
          <Input id="f-result" name="voteResult" defaultValue={piece.voteResult ?? ""} />
        </Field>
        <Field label="Note" htmlFor="f-notes" className="sm:col-span-4">
          <Textarea id="f-notes" name="notes" rows={2} defaultValue={piece.notes ?? ""} />
        </Field>
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        Salva scheda
      </Button>
    </form>
  );
}

function Layers({
  piece,
  pending,
  onLayer,
  onMetric,
}: {
  piece: Detail;
  pending: boolean;
  onLayer: (platform: Platform, fields: LayerFields, message?: string) => void;
  onMetric: (
    platform: Platform,
    reading: Parameters<typeof addContentMetric>[0]["reading"],
  ) => void;
}) {
  const active = piece.layers.filter((l) => l.active);
  const inactive = PLATFORMS.filter((p) => !active.some((l) => l.platform === p));
  const [tab, setTab] = useState<string>(active[0]?.platform ?? "");
  const current = active.some((l) => l.platform === tab) ? tab : (active[0]?.platform ?? "");

  return (
    <section aria-label="Piattaforme" className="flex flex-col gap-2 border-t pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Piattaforme</h3>
        {inactive.map((p) => (
          <Button
            key={p}
            type="button"
            size="xs"
            variant="outline"
            disabled={pending}
            onClick={() => {
              setTab(p);
              onLayer(p, { active: true }, `${PLATFORM_LABELS[p]} attivato`);
            }}
          >
            Attiva {PLATFORM_LABELS[p]}
          </Button>
        ))}
      </div>
      {active.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nessuna piattaforma attiva.</p>
      ) : (
        <Tabs value={current} onValueChange={setTab}>
          <TabsList>
            {active.map((l) => (
              <TabsTrigger key={l.platform} value={l.platform}>
                {PLATFORM_LABELS[l.platform]}
              </TabsTrigger>
            ))}
          </TabsList>
          {active.map((l) => (
            <TabsContent key={l.platform} value={l.platform}>
              <LayerPanel
                key={`${l.platform}-${piece.updatedAt}`}
                piece={piece}
                layer={l}
                pending={pending}
                onSave={(fields, message) => onLayer(l.platform, fields, message)}
                onMetric={(reading) => onMetric(l.platform, reading)}
              />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </section>
  );
}

function LayerPanel({
  piece,
  layer,
  pending,
  onSave,
  onMetric,
}: {
  piece: Detail;
  layer: ContentLayerDTO;
  pending: boolean;
  onSave: (fields: LayerFields, message?: string) => void;
  onMetric: (reading: Parameters<typeof addContentMetric>[0]["reading"]) => void;
}) {
  const p = layer.platform;
  const d = layer.details;
  const id = (key: string) => `${p}-${key}`;
  const scheduled = layer.publishStatus === "programmato" || layer.publishStatus === "pubblicato";
  const texts = publishTexts(p, d, layer.pinnedComment);

  return (
    <div className="flex flex-col gap-4" data-testid={`layer-${p}`}>
      <fieldset className="flex flex-wrap gap-x-5 gap-y-2 rounded-lg bg-muted/50 p-3 text-sm">
        <legend className="sr-only">Checklist di pubblicazione</legend>
        {(
          [
            ["Copertina scelta", layer.coverChosen, { coverChosen: !layer.coverChosen }],
            ["Etichetta IA attiva", layer.aiLabel, { aiLabel: !layer.aiLabel }],
            ["Programmato", scheduled, { publishStatus: scheduled ? "pronto" : "programmato" }],
            [
              "Commento fissato",
              layer.pinnedCommentDone,
              { pinnedCommentDone: !layer.pinnedCommentDone },
            ],
          ] as [string, boolean, LayerFields][]
        ).map(([label, checked, fields]) => (
          <label key={label} className="flex items-center gap-2">
            <Checkbox
              checked={checked}
              disabled={
                pending || (label === "Programmato" && layer.publishStatus === "pubblicato")
              }
              onCheckedChange={() => onSave(fields)}
              aria-label={`${label} (${PLATFORM_LABELS[p]})`}
            />
            {label}
          </label>
        ))}
      </fieldset>

      {texts.length > 0 && (
        <div className="flex flex-col gap-2" aria-label="Testi da pubblicare">
          {texts.map((t) => (
            <div key={t.label} className="flex items-start gap-2 rounded-lg border p-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">{t.label}</p>
                <p className="text-sm break-words whitespace-pre-wrap">{t.value}</p>
              </div>
              <CopyButton value={t.value} label={t.label} />
            </div>
          ))}
        </div>
      )}

      <form
        className="grid gap-3 sm:grid-cols-4"
        aria-label={`Layer ${PLATFORM_LABELS[p]}`}
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          // Only the fields on screen: hidden ones (e.g. chapters of a Short) keep their value.
          const details: Record<string, unknown> = {};
          const textKeys = ["kind", "title", "description", "chapters", "playlist", "caption"];
          for (const key of textKeys) {
            if (form.has(key)) details[key] = String(form.get(key) ?? "");
          }
          for (const key of ["coverAt", "imageCount"]) {
            if (form.has(key)) details[key] = num(form, key);
          }
          if (p === "youtube") {
            details.syntheticDeclared = form.get("syntheticDeclared") === "on";
            details.notForKids = form.get("notForKids") === "on";
          }
          const plannedAt = fromLocalInput(String(form.get("plannedAt") ?? ""));
          onSave(
            {
              publishStatus: String(form.get("publishStatus")) as LayerFields["publishStatus"],
              ...(toLocalInput(layer.plannedAt) !== String(form.get("plannedAt") ?? "")
                ? { plannedAt }
                : {}),
              publishedAt: fromLocalInput(String(form.get("publishedAt") ?? "")),
              url: str(form, "url"),
              pinnedComment: str(form, "pinnedComment"),
              notes: str(form, "notes"),
              votes: Object.fromEntries(
                piece.voteOptions.map((o) => [o, Math.max(0, num(form, `vote-${o}`) ?? 0)]),
              ),
              details,
            },
            `${PLATFORM_LABELS[p]} salvato`,
          );
        }}
      >
        <Field label="Stato di pubblicazione" htmlFor={id("status")}>
          <select
            id={id("status")}
            name="publishStatus"
            defaultValue={layer.publishStatus}
            className={selectClass}
          >
            {LAYER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label={layer.plannedAtManual ? "Prevista (spostata a mano)" : "Prevista"}
          htmlFor={id("planned")}
        >
          <Input
            id={id("planned")}
            name="plannedAt"
            type="datetime-local"
            defaultValue={toLocalInput(layer.plannedAt)}
          />
        </Field>
        <Field label="Pubblicata il" htmlFor={id("published")}>
          <Input
            id={id("published")}
            name="publishedAt"
            type="datetime-local"
            defaultValue={toLocalInput(layer.publishedAt)}
          />
        </Field>
        <Field label="Link al post" htmlFor={id("url")}>
          <div className="flex gap-1">
            <Input id={id("url")} name="url" type="url" defaultValue={layer.url ?? ""} />
            {layer.url && (
              <Button asChild variant="ghost" size="icon" aria-label="Apri il post">
                <a href={layer.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLinkIcon />
                </a>
              </Button>
            )}
          </div>
        </Field>

        {p === "youtube" ? (
          <>
            <Field label="Tipo" htmlFor={id("kind")}>
              <select
                id={id("kind")}
                name="kind"
                defaultValue={d.kind ?? "Short"}
                className={selectClass}
              >
                <option>Short</option>
                <option>Video lungo</option>
              </select>
            </Field>
            <Field label="Titolo YouTube (max 100)" htmlFor={id("title")} className="sm:col-span-3">
              <Input id={id("title")} name="title" maxLength={100} defaultValue={d.title ?? ""} />
            </Field>
            <Field label="Descrizione" htmlFor={id("description")} className="sm:col-span-4">
              <Textarea
                id={id("description")}
                name="description"
                rows={3}
                defaultValue={d.description ?? ""}
              />
            </Field>
            {d.kind === "Video lungo" && (
              <Field
                label="Capitoli (uno per riga)"
                htmlFor={id("chapters")}
                className="sm:col-span-4"
              >
                <Textarea
                  id={id("chapters")}
                  name="chapters"
                  rows={3}
                  defaultValue={d.chapters ?? ""}
                />
              </Field>
            )}
            <Field label="Playlist" htmlFor={id("playlist")} className="sm:col-span-2">
              <Input id={id("playlist")} name="playlist" defaultValue={d.playlist ?? ""} />
            </Field>
            <label className="flex items-center gap-2 self-end text-sm">
              <input
                type="checkbox"
                name="syntheticDeclared"
                defaultChecked={d.syntheticDeclared ?? false}
                className="size-4 accent-primary"
              />
              Contenuto sintetico dichiarato
            </label>
            <label className="flex items-center gap-2 self-end text-sm">
              <input
                type="checkbox"
                name="notForKids"
                defaultChecked={d.notForKids ?? true}
                className="size-4 accent-primary"
              />
              Non per bambini
            </label>
          </>
        ) : (
          <>
            {p === "instagram" && (
              <>
                <Field label="Tipo" htmlFor={id("kind")}>
                  <select
                    id={id("kind")}
                    name="kind"
                    defaultValue={d.kind ?? "Reel"}
                    className={selectClass}
                  >
                    <option>Reel</option>
                    <option>Carosello</option>
                    <option>Storia</option>
                  </select>
                </Field>
                <Field label="Numero di immagini" htmlFor={id("images")}>
                  <Input
                    id={id("images")}
                    name="imageCount"
                    type="number"
                    min={1}
                    max={20}
                    defaultValue={d.imageCount ?? ""}
                  />
                </Field>
              </>
            )}
            {p === "tiktok" && (
              <Field label="Copertina al secondo" htmlFor={id("coverAt")}>
                <Input
                  id={id("coverAt")}
                  name="coverAt"
                  type="number"
                  min={0}
                  step="0.1"
                  defaultValue={d.coverAt ?? ""}
                />
              </Field>
            )}
            <Field
              label="Didascalia (con hashtag)"
              htmlFor={id("caption")}
              className="sm:col-span-4"
            >
              <Textarea id={id("caption")} name="caption" rows={3} defaultValue={d.caption ?? ""} />
            </Field>
          </>
        )}

        <Field label="Commento fissato" htmlFor={id("pinned")} className="sm:col-span-4">
          <Input id={id("pinned")} name="pinnedComment" defaultValue={layer.pinnedComment ?? ""} />
        </Field>
        {piece.voteOptions.map((option) => (
          <Field key={option} label={`Voti ${option}`} htmlFor={id(`vote-${option}`)}>
            <Input
              id={id(`vote-${option}`)}
              name={`vote-${option}`}
              type="number"
              min={0}
              defaultValue={layer.votes[option] ?? ""}
            />
          </Field>
        ))}
        <Field label="Note della piattaforma" htmlFor={id("notes")} className="sm:col-span-4">
          <Textarea id={id("notes")} name="notes" rows={2} defaultValue={layer.notes ?? ""} />
        </Field>
        <div className="flex flex-wrap gap-2 sm:col-span-4">
          <Button type="submit" disabled={pending}>
            Salva {PLATFORM_LABELS[p]}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => onSave({ active: false }, `${PLATFORM_LABELS[p]} disattivato`)}
          >
            Disattiva {PLATFORM_LABELS[p]}
          </Button>
        </div>
      </form>

      <Metrics layer={layer} pending={pending} onAdd={onMetric} />
    </div>
  );
}

const METRIC_FIELDS = [
  ["views", "Visualizzazioni"],
  ["likes", "Mi piace"],
  ["comments", "Commenti"],
  ["shares", "Condivisioni"],
  ["saves", "Salvataggi"],
  ["completion", "Completamento %"],
  ["newFollowers", "Nuovi follower"],
  ["watchHours", "Ore di visione"],
] as const;

function Metrics({
  layer,
  pending,
  onAdd,
}: {
  layer: ContentLayerDTO;
  pending: boolean;
  onAdd: (reading: Parameters<typeof addContentMetric>[0]["reading"]) => void;
}) {
  const [history, setHistory] = useState(false);
  const [adding, setAdding] = useState(false);
  const fields = METRIC_FIELDS.filter(
    ([key]) =>
      (key !== "saves" || layer.platform !== "youtube") &&
      (key !== "watchHours" || layer.platform === "youtube"),
  );
  const last = layer.metrics.at(-1);
  const shown = history ? [...layer.metrics].reverse() : last ? [last] : [];

  return (
    <section
      aria-label={`Numeri ${PLATFORM_LABELS[layer.platform]}`}
      className="flex flex-col gap-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold">Numeri</h4>
        {layer.metrics.length > 1 && (
          <Button type="button" size="xs" variant="ghost" onClick={() => setHistory((h) => !h)}>
            {history ? "Solo l'ultima" : `Tutte le rilevazioni (${layer.metrics.length})`}
          </Button>
        )}
        <Button type="button" size="xs" variant="outline" onClick={() => setAdding((a) => !a)}>
          Aggiungi rilevazione
        </Button>
      </div>
      {shown.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nessuna rilevazione.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs" data-testid="metrics-table">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 pr-2 font-medium">Rilevato</th>
                {fields.map(([, label]) => (
                  <th key={label} className="py-1 pr-2 text-right font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="py-1 pr-2">
                    <LocalDateTime value={new Date(m.measuredAt)} />
                  </td>
                  {fields.map(([key]) => (
                    <td key={key} className="py-1 pr-2 text-right tabular-nums">
                      {m[key] ?? "–"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {adding && (
        <form
          className="grid gap-2 sm:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const measuredAt = fromLocalInput(String(form.get("measuredAt") ?? ""));
            onAdd({
              ...(measuredAt ? { measuredAt } : {}),
              ...Object.fromEntries(fields.map(([key]) => [key, num(form, key)])),
            });
            setAdding(false);
          }}
        >
          <Field label="Rilevato il" htmlFor={`${layer.platform}-measured`}>
            <Input id={`${layer.platform}-measured`} name="measuredAt" type="datetime-local" />
          </Field>
          {fields.map(([key, label]) => (
            <Field key={key} label={label} htmlFor={`${layer.platform}-m-${key}`}>
              <Input
                id={`${layer.platform}-m-${key}`}
                name={key}
                type="number"
                min={key === "newFollowers" ? undefined : 0}
                step="any"
              />
            </Field>
          ))}
          <Button type="submit" disabled={pending} className="self-end">
            Salva rilevazione
          </Button>
        </form>
      )}
    </section>
  );
}

function Votes({ piece }: { piece: Detail }) {
  const active = piece.layers.filter((l) => l.active);
  const totals = voteTotals(piece.voteOptions, active);
  return (
    <section aria-label="Voti" className="flex flex-col gap-2 border-t pt-3" data-testid="votes">
      <h3 className="text-sm font-semibold">
        Voto: {piece.question}
        {piece.voteCloses && (
          <span className="font-normal text-muted-foreground"> · chiude il {piece.voteCloses}</span>
        )}
      </h3>
      <div className="overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-1 pr-4 font-medium">Opzione</th>
              {active.map((l) => (
                <th key={l.platform} className="py-1 pr-4 text-right font-medium">
                  {PLATFORM_LABELS[l.platform]}
                </th>
              ))}
              <th className="py-1 text-right font-medium">Totale</th>
            </tr>
          </thead>
          <tbody>
            {totals.map((t) => (
              <tr key={t.option} className="border-t">
                <td className="py-1 pr-4 font-medium">{t.option}</td>
                {active.map((l) => (
                  <td key={l.platform} className="py-1 pr-4 text-right tabular-nums">
                    {l.votes[t.option] ?? 0}
                  </td>
                ))}
                <td className="py-1 text-right font-semibold tabular-nums">{t.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {piece.voteResult && <p className="text-sm">Esito: {piece.voteResult}</p>}
    </section>
  );
}

function PieceActions({
  piece,
  pending,
  onArchive,
  onDuplicate,
}: {
  piece: Detail;
  pending: boolean;
  onArchive: () => void;
  onDuplicate: (newCode: string) => void;
}) {
  const [duplicating, setDuplicating] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2 border-t pt-3">
      {duplicating ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const value = String(new FormData(event.currentTarget).get("newCode") ?? "").trim();
            if (value) onDuplicate(value);
            setDuplicating(false);
          }}
        >
          <Input
            name="newCode"
            aria-label="Codice della copia"
            placeholder="Nuovo codice"
            autoFocus
            className="h-8 w-40"
          />
          <Button type="submit" size="sm" disabled={pending}>
            Duplica
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setDuplicating(false)}>
            Annulla
          </Button>
        </form>
      ) : (
        <Button type="button" size="sm" variant="outline" onClick={() => setDuplicating(true)}>
          <CopyPlusIcon />
          Duplica
        </Button>
      )}
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={onArchive}>
        {piece.archivedAt ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
        {piece.archivedAt ? "Ripristina" : "Archivia"}
      </Button>
      <span className="ml-auto text-xs text-muted-foreground">
        Creata da {piece.createdBy} · modificata da {piece.updatedBy}
      </span>
    </div>
  );
}
