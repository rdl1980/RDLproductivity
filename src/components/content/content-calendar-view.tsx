"use client";

import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  BotIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ListChecksIcon,
  PaletteIcon,
  PlusIcon,
  RepeatIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  cycleWeekOf,
  defaultLayers,
  emptySlots,
  PIECE_STATUSES,
  type PlannedSlot,
  plannedSlots,
  PLATFORM_LABELS,
  type Platform,
  PLATFORMS,
  type PlanRow,
  SLOT_LABELS,
  SLOTS,
  type Slot,
  textOn,
  type TodoItem,
  WEEKDAYS,
} from "@/lib/content";
import { addDays } from "@/lib/kdp-sales";
import { cn } from "@/lib/utils";
import { addContentPiece, moveContentPiece } from "@/server/actions/content";
import type { ActionResult } from "@/server/actions/result";
import type { ContentPieceDTO, ContentRubricDTO } from "@/server/queries/content";

import { dayLabel, LayerBadge, pieceVisible, StatusText, visibleLayers } from "./content-ui";
import { type PieceDraft, PieceDialog } from "./piece-dialog";
import { PlanDialog, RubricsDialog } from "./settings-dialogs";

export type ContentView = "settimana" | "mese" | "elenco";

type Props = {
  view: ContentView;
  /** Monday of the week shown, or first day of the month shown. */
  anchor: string;
  today: string;
  /** Visible range of the week and month views (inclusive). */
  from: string;
  to: string;
  pieces: ContentPieceDTO[];
  plan: PlanRow[];
  rubrics: ContentRubricDTO[];
  todo: TodoItem[];
};

const NETWORK = "Errore di rete, modifica annullata.";

const monthTitle = (anchor: string) => {
  const label = new Intl.DateTimeFormat("it-IT", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${anchor}T00:00:00Z`));
  return label.charAt(0).toUpperCase() + label.slice(1);
};
const shiftMonth = (anchor: string, step: number) => {
  const [y, m] = anchor.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + step, 1)).toISOString().slice(0, 10);
};
const href = (view: ContentView, date: string) => `/robotti?view=${view}&date=${date}`;

export function ContentCalendarView(props: Props) {
  const { view, anchor, today, from, to, plan, rubrics, todo } = props;
  const router = useRouter();
  // Local copy for optimistic moves; reset when the server sends new data.
  const [source, setSource] = useState(props.pieces);
  const [pieces, setPieces] = useState(props.pieces);
  if (source !== props.pieces) {
    setSource(props.pieces);
    setPieces(props.pieces);
  }
  const [platforms, setPlatforms] = useState<ReadonlySet<Platform>>(new Set(PLATFORMS));
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [draft, setDraft] = useState<PieceDraft | null>(null);
  const [rubricsOpen, setRubricsOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);

  const rubricOf = useMemo(() => {
    const map = new Map(rubrics.map((r) => [r.value, r]));
    return (value: string) => map.get(value);
  }, [rubrics]);

  const empty = useMemo(
    () =>
      emptySlots(
        plannedSlots(plan, from, to),
        pieces.map((p) => ({
          date: p.date,
          slot: p.slot,
          rubric: p.rubric,
          status: p.status,
          archived: !!p.archivedAt,
        })),
      ).filter(
        (s) =>
          platforms.size === 3 ||
          defaultLayers(s.rubric, s.slot).some((l) => platforms.has(l.platform)),
      ),
    [plan, from, to, pieces, platforms],
  );

  function togglePlatform(platform: Platform) {
    setPlatforms((current) => {
      const next = new Set(current);
      if (next.has(platform)) {
        if (next.size > 1) next.delete(platform);
      } else next.add(platform);
      return next;
    });
  }

  async function move(code: string, date: string, slot: Slot) {
    const piece = pieces.find((p) => p.code === code);
    if (!piece || (piece.date === date && piece.slot === slot)) return;
    const previous = { date: piece.date, slot: piece.slot };
    const patch = (fields: { date: string; slot: Slot }) => (current: ContentPieceDTO[]) =>
      current.map((p) =>
        p.code === code ? { ...p, ...fields, cycleWeek: cycleWeekOf(fields.date) } : p,
      );
    setPieces(patch({ date, slot }));
    const result = await moveContentPiece({ code, date, slot }).catch(
      (): ActionResult<ContentPieceDTO> => ({ ok: false, error: NETWORK }),
    );
    if (!result.ok) {
      setPieces(patch(previous));
      toast.error(result.error);
      return;
    }
    router.refresh();
  }

  async function add(input: { title: string; rubric: string; date: string; slot: Slot }) {
    const result = await addContentPiece(input).catch((): ActionResult<ContentPieceDTO> => ({
      ok: false,
      error: "Errore di rete, riprova.",
    }));
    if (!result.ok) {
      toast.error(result.error);
      return false;
    }
    setPieces((current) => [...current.filter((p) => p.code !== result.data.code), result.data]);
    toast.success(`Scheda ${result.data.code} creata`);
    router.refresh();
    return true;
  }

  const step = view === "mese" ? shiftMonth : (d: string, n: number) => addDays(d, 7 * n);
  const title =
    view === "mese"
      ? monthTitle(anchor)
      : view === "settimana"
        ? `${dayLabel(from)} – ${dayLabel(to)}`
        : "Tutte le schede";

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 sm:p-6">
      <PageHeader
        icon={BotIcon}
        title="Robotti & Robotte"
        description="Calendario editoriale del canale: una scheda per contenuto, un layer per piattaforma. Claude crea e aggiorna le schede via MCP."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setRubricsOpen(true)}>
              <PaletteIcon />
              Rubriche
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPlanOpen(true)}>
              <RepeatIcon />
              Piano
            </Button>
            <Button
              size="sm"
              onClick={() =>
                setDraft({ date: today, slot: "19:00", rubric: rubrics[0]?.value ?? "" })
              }
            >
              <PlusIcon />
              Nuova scheda
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Vista" className="inline-flex rounded-lg bg-muted p-[3px] text-sm">
          {(
            [
              ["settimana", "Settimana"],
              ["mese", "Mese"],
              ["elenco", "Elenco"],
            ] as const
          ).map(([key, label]) => (
            <Link
              key={key}
              href={href(key, view === "elenco" ? today : anchor)}
              aria-current={view === key ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1 font-medium",
                view === key
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div
          role="group"
          aria-label="Piattaforme mostrate"
          className="inline-flex gap-1"
          data-testid="platform-toggles"
        >
          {PLATFORMS.map((p) => (
            <Button
              key={p}
              type="button"
              size="sm"
              variant={platforms.has(p) ? "default" : "outline"}
              aria-pressed={platforms.has(p)}
              onClick={() => togglePlatform(p)}
            >
              {PLATFORM_LABELS[p]}
            </Button>
          ))}
        </div>
      </div>

      {view !== "elenco" && (
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="icon" aria-label="Precedente">
            <Link href={href(view, step(anchor, -1))}>
              <ChevronLeftIcon />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={href(view, today)}>Oggi</Link>
          </Button>
          <Button asChild variant="outline" size="icon" aria-label="Successiva">
            <Link href={href(view, step(anchor, 1))}>
              <ChevronRightIcon />
            </Link>
          </Button>
          <h2 className="ml-1 text-lg font-semibold" data-testid="content-range">
            {title}
          </h2>
          {view === "settimana" && (
            <span
              className="rounded-md bg-accent px-2 py-0.5 text-sm font-semibold text-accent-foreground"
              data-testid="cycle-week"
            >
              Settimana {cycleWeekOf(from)}
            </span>
          )}
        </div>
      )}

      <TodoPanel
        items={todo}
        onOpen={(item) =>
          item.code
            ? setOpenCode(item.code)
            : item.slot &&
              setDraft({ date: item.slot.date, slot: item.slot.slot, rubric: item.slot.rubric })
        }
      />

      {view === "settimana" && (
        <WeekGrid
          from={from}
          today={today}
          pieces={pieces.filter((p) => !p.archivedAt && pieceVisible(p, platforms))}
          empty={empty}
          platforms={platforms}
          rubrics={rubrics}
          rubricOf={rubricOf}
          onOpen={setOpenCode}
          onDraft={setDraft}
          onMove={move}
          onAdd={add}
        />
      )}
      {view === "mese" && (
        <MonthGrid
          anchor={anchor}
          from={from}
          to={to}
          today={today}
          pieces={pieces.filter((p) => !p.archivedAt && pieceVisible(p, platforms))}
          rubricOf={rubricOf}
        />
      )}
      {view === "elenco" && (
        <PieceList
          pieces={pieces}
          platforms={platforms}
          rubrics={rubrics}
          rubricOf={rubricOf}
          onOpen={setOpenCode}
        />
      )}

      <PieceDialog
        code={openCode}
        draft={draft}
        rubrics={rubrics}
        onClose={() => {
          setOpenCode(null);
          setDraft(null);
        }}
        onSaved={(piece) => {
          setDraft(null);
          setOpenCode(piece.code);
          router.refresh();
        }}
      />
      <RubricsDialog open={rubricsOpen} onOpenChange={setRubricsOpen} rubrics={rubrics} />
      <PlanDialog open={planOpen} onOpenChange={setPlanOpen} plan={plan} rubrics={rubrics} />
    </main>
  );
}

function TodoPanel({ items, onOpen }: { items: TodoItem[]; onOpen: (item: TodoItem) => void }) {
  return (
    <details
      className="rounded-xl border bg-card p-3 [&[open]>summary]:mb-2"
      open={items.length > 0}
      data-testid="todo-panel"
    >
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
        <ListChecksIcon className="size-4 text-muted-foreground" />
        Da fare ({items.length})
      </summary>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Niente in sospeso.</p>
      ) : (
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          {items.map((item, i) => (
            <li key={`${item.kind}-${item.code}-${item.platform}-${item.date}-${i}`}>
              <button
                type="button"
                onClick={() => onOpen(item)}
                className="flex w-full items-baseline gap-2 rounded px-1.5 py-1 text-left hover:bg-muted"
              >
                <span className="w-24 shrink-0 text-xs text-muted-foreground">
                  {dayLabel(item.date)}
                </span>
                <span className="min-w-0">{item.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

function WeekGrid({
  from,
  today,
  pieces,
  empty,
  platforms,
  rubrics,
  rubricOf,
  onOpen,
  onDraft,
  onMove,
  onAdd,
}: {
  from: string;
  today: string;
  pieces: ContentPieceDTO[];
  empty: PlannedSlot[];
  platforms: ReadonlySet<Platform>;
  rubrics: ContentRubricDTO[];
  rubricOf: (value: string) => ContentRubricDTO | undefined;
  onOpen: (code: string) => void;
  onDraft: (draft: PieceDraft) => void;
  onMove: (code: string, date: string, slot: Slot) => void;
  onAdd: AddPiece;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const [dragging, setDragging] = useState<ContentPieceDTO | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    setDragging(null);
    const [, date, slot] = String(over?.id ?? "").split("|");
    if (date && slot) onMove(String(active.id), date, slot as Slot);
  }

  return (
    <DndContext
      id="content-dnd"
      sensors={sensors}
      onDragStart={({ active }) => setDragging(pieces.find((p) => p.code === active.id) ?? null)}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        <div
          role="table"
          aria-label="Settimana dei contenuti"
          data-testid="content-week"
          className="grid min-w-[60rem] grid-cols-[6.5rem_repeat(7,minmax(0,1fr))] gap-1.5"
        >
          <div role="row" className="contents">
            <div role="columnheader">
              <span className="sr-only">Fascia</span>
            </div>
            {days.map((day, i) => (
              <div
                key={day}
                role="columnheader"
                aria-current={day === today ? "date" : undefined}
                className={cn(
                  "rounded-lg px-2 py-1.5 text-center text-sm font-semibold",
                  day === today ? "bg-accent text-accent-foreground" : "bg-muted",
                )}
              >
                {WEEKDAYS[i]}
                <span className="block text-xs font-normal text-muted-foreground">
                  {dayLabel(day)}
                </span>
              </div>
            ))}
          </div>
          {SLOTS.map((slot) => (
            <div key={slot} role="row" className="contents">
              <div role="rowheader" className="px-1 py-2 text-sm font-semibold">
                {SLOT_LABELS[slot]}
              </div>
              {days.map((day) => (
                <Cell
                  key={day}
                  id={`cell|${day}|${slot}`}
                  label={`${dayLabel(day)}, ${SLOT_LABELS[slot]}`}
                  rubrics={rubrics}
                  defaultRubric={
                    empty.find((s) => s.date === day && s.slot === slot)?.rubric ??
                    rubrics[0]?.value ??
                    ""
                  }
                  onAdd={(title, rubric) => onAdd({ title, rubric, date: day, slot })}
                >
                  {pieces
                    .filter((p) => p.date === day && p.slot === slot)
                    .map((piece) => (
                      <PieceCard
                        key={piece.code}
                        piece={piece}
                        rubric={rubricOf(piece.rubric)}
                        platforms={platforms}
                        onOpen={() => onOpen(piece.code)}
                      />
                    ))}
                  {empty
                    .filter((s) => s.date === day && s.slot === slot)
                    .map((s) => (
                      <button
                        key={s.rubric}
                        type="button"
                        data-testid="empty-slot"
                        onClick={() => onDraft({ date: s.date, slot: s.slot, rubric: s.rubric })}
                        className="rounded-lg border-2 border-dashed px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted"
                        style={{ borderColor: rubricOf(s.rubric)?.color }}
                      >
                        {rubricOf(s.rubric)?.name ?? s.rubric} — da fare
                      </button>
                    ))}
                </Cell>
              ))}
            </div>
          ))}
        </div>
      </div>
      <DragOverlay>
        {dragging ? (
          <div className="rotate-2 rounded-lg border bg-card px-2 py-1.5 text-sm font-medium shadow-xl">
            {dragging.title}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

type AddPiece = (input: {
  title: string;
  rubric: string;
  date: string;
  slot: Slot;
}) => Promise<boolean>;

function Cell({
  id,
  label,
  rubrics,
  defaultRubric,
  onAdd,
  children,
}: {
  id: string;
  label: string;
  rubrics: ContentRubricDTO[];
  /** The rubric planned in the cell, if any. */
  defaultRubric: string;
  onAdd: (title: string, rubric: string) => Promise<boolean>;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [rubric, setRubric] = useState(defaultRubric);
  const [pending, setPending] = useState(false);

  function open() {
    setRubric(defaultRubric);
    setAdding(true);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = title.trim();
    if (!value || pending) return;
    setPending(true);
    const created = await onAdd(value, rubric);
    setPending(false);
    if (created) setTitle("");
  }

  return (
    <div
      ref={setNodeRef}
      role="cell"
      aria-label={label}
      data-testid="content-cell"
      className={cn(
        "flex min-h-28 min-w-0 flex-col gap-1.5 rounded-xl bg-list p-1.5 ring-1 ring-black/5 dark:ring-white/5",
        isOver && "ring-2 ring-ring",
      )}
    >
      {children}
      {adding ? (
        <form
          onSubmit={submit}
          onKeyDown={(event) => {
            if (event.key === "Escape") setAdding(false);
          }}
          className="flex flex-col gap-1.5"
        >
          <Input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Titolo del contenuto"
            aria-label={`Nuovo contenuto, ${label}`}
            maxLength={200}
            className="h-8 bg-background"
          />
          <select
            aria-label={`Rubrica del nuovo contenuto, ${label}`}
            value={rubric}
            onChange={(event) => setRubric(event.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {rubrics.map((r) => (
              <option key={r.value} value={r.value}>
                {r.name}
              </option>
            ))}
          </select>
          <div className="flex gap-1.5">
            <Button type="submit" size="sm" disabled={pending}>
              Aggiungi
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Annulla
            </Button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={open}
          aria-label={`Aggiungi contenuto, ${label}`}
          className="mt-auto flex items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
        >
          <PlusIcon className="size-3.5" />
          Aggiungi
        </button>
      )}
    </div>
  );
}

function PieceCard({
  piece,
  rubric,
  platforms,
  onOpen,
}: {
  piece: ContentPieceDTO;
  rubric: ContentRubricDTO | undefined;
  platforms: ReadonlySet<Platform>;
  onOpen: () => void;
}) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: piece.code,
  });
  const { onKeyDown: dragKeyDown, ...pointerListeners } = listeners ?? {};
  return (
    <div
      ref={setNodeRef}
      {...pointerListeners}
      data-testid="content-piece"
      data-code={piece.code}
      className={cn(
        "flex overflow-hidden rounded-lg border border-black/[0.06] bg-list-card text-xs shadow-card select-none dark:border-white/[0.06]",
        isDragging && "opacity-40",
      )}
    >
      <span aria-hidden className="w-1.5 shrink-0" style={{ backgroundColor: rubric?.color }} />
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key === "Enter") onOpen();
          else (dragKeyDown as React.KeyboardEventHandler | undefined)?.(event);
        }}
        className="flex min-w-0 flex-1 cursor-pointer flex-col gap-1 px-2 py-1.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <span className="line-clamp-2 text-sm leading-snug font-medium">{piece.title}</span>
        <span className="flex flex-wrap items-center gap-x-1.5 text-muted-foreground">
          <span className="font-mono">{piece.code}</span>
          <StatusText piece={piece} />
        </span>
        <span className="flex flex-wrap gap-1">
          {visibleLayers(piece, platforms).map((l) => (
            <LayerBadge key={l.platform} layer={l} />
          ))}
        </span>
      </button>
    </div>
  );
}

function MonthGrid({
  anchor,
  from,
  to,
  today,
  pieces,
  rubricOf,
}: {
  anchor: string;
  from: string;
  to: string;
  today: string;
  pieces: ContentPieceDTO[];
  rubricOf: (value: string) => ContentRubricDTO | undefined;
}) {
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const month = anchor.slice(0, 7);
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="grid min-w-[42rem] grid-cols-7 gap-1.5" data-testid="content-month">
        {WEEKDAYS.map((name) => (
          <div key={name} className="px-1 text-center text-xs font-semibold text-muted-foreground">
            {name}
          </div>
        ))}
        {days.map((day) => {
          const own = pieces.filter((p) => p.date === day);
          return (
            <Link
              key={day}
              href={href("settimana", day)}
              data-testid="month-day"
              aria-label={`${dayLabel(day)}: ${own.length} contenuti`}
              className={cn(
                "flex min-h-20 flex-col gap-1 rounded-lg border p-1.5 hover:bg-muted",
                day.slice(0, 7) !== month && "bg-muted/50 text-muted-foreground",
                day === today && "ring-2 ring-primary/40",
              )}
            >
              <span className="flex items-center justify-between text-xs">
                <span className="font-semibold">{Number(day.slice(8))}</span>
                {own.length > 0 && <span className="text-muted-foreground">{own.length}</span>}
              </span>
              <span className="flex flex-wrap gap-1">
                {own.map((p) => (
                  <span
                    key={p.code}
                    title={`${p.title} (${rubricOf(p.rubric)?.name ?? p.rubric})`}
                    className="size-2.5 rounded-full ring-1 ring-black/10"
                    style={{ backgroundColor: rubricOf(p.rubric)?.color }}
                  />
                ))}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

type SortKey = "date" | "code" | "title" | "rubric" | "status" | "views";

function PieceList({
  pieces,
  platforms,
  rubrics,
  rubricOf,
  onOpen,
}: {
  pieces: ContentPieceDTO[];
  platforms: ReadonlySet<Platform>;
  rubrics: ContentRubricDTO[];
  rubricOf: (value: string) => ContentRubricDTO | undefined;
  onOpen: (code: string) => void;
}) {
  const [status, setStatus] = useState("");
  const [rubric, setRubric] = useState("");
  const [fromDay, setFromDay] = useState("");
  const [toDay, setToDay] = useState("");
  const [archived, setArchived] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "date", desc: false });

  const views = (p: ContentPieceDTO) =>
    visibleLayers(p, platforms).reduce((sum, l) => sum + (l.metrics.at(-1)?.views ?? 0), 0);
  const rows = pieces
    .filter(
      (p) =>
        (archived ? !!p.archivedAt : !p.archivedAt) &&
        pieceVisible(p, platforms) &&
        (!status || p.shown.status === status) &&
        (!rubric || p.rubric === rubric) &&
        (!fromDay || p.date >= fromDay) &&
        (!toDay || p.date <= toDay),
    )
    .sort((a, b) => {
      const value = (p: ContentPieceDTO): string | number =>
        sort.key === "date"
          ? `${p.date} ${p.slot}`
          : sort.key === "rubric"
            ? (rubricOf(p.rubric)?.name ?? p.rubric)
            : sort.key === "status"
              ? PIECE_STATUSES.indexOf(p.shown.status)
              : sort.key === "views"
                ? views(p)
                : p[sort.key];
      const [x, y] = [value(a), value(b)];
      const order = typeof x === "number" ? x - (y as number) : x.localeCompare(String(y));
      return sort.desc ? -order : order;
    });

  const header = (key: SortKey, label: string, className = "") => (
    <th className={cn("py-2 pr-3 font-medium", className)}>
      <button
        type="button"
        onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : false }))}
        className="hover:text-foreground"
        aria-label={`Ordina per ${label}`}
      >
        {label}
        {sort.key === key ? (sort.desc ? " ↓" : " ↑") : ""}
      </button>
    </th>
  );
  const select =
    "h-8 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none";

  return (
    <section className="flex flex-col gap-3" aria-label="Elenco">
      <div className="flex flex-wrap items-end gap-2 text-sm">
        <select
          aria-label="Filtra per stato"
          className={select}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Tutti gli stati</option>
          {PIECE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtra per rubrica"
          className={select}
          value={rubric}
          onChange={(e) => setRubric(e.target.value)}
        >
          <option value="">Tutte le rubriche</option>
          {rubrics.map((r) => (
            <option key={r.value} value={r.value}>
              {r.name}
            </option>
          ))}
        </select>
        <Input
          type="date"
          aria-label="Dal"
          className="h-8 w-40"
          value={fromDay}
          onChange={(e) => setFromDay(e.target.value)}
        />
        <Input
          type="date"
          aria-label="Al"
          className="h-8 w-40"
          value={toDay}
          onChange={(e) => setToDay(e.target.value)}
        />
        <label className="flex h-8 items-center gap-1.5">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />
          Archiviate
        </label>
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[52rem] text-left text-sm" data-testid="content-list">
          <thead>
            <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
              {header("date", "Data")}
              <th className="py-2 pr-3 font-medium">Fascia</th>
              {header("code", "Codice")}
              {header("title", "Titolo")}
              {header("rubric", "Rubrica")}
              {header("status", "Stato")}
              <th className="py-2 pr-3 font-medium">Piattaforme</th>
              {header("views", "Visualizzazioni", "text-right")}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-4 text-center text-muted-foreground">
                  Nessuna scheda.
                </td>
              </tr>
            ) : (
              rows.map((p) => {
                const r = rubricOf(p.rubric);
                return (
                  <tr key={p.code} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="py-2 pr-3 pl-3 whitespace-nowrap">{dayLabel(p.date)}</td>
                    <td className="py-2 pr-3">{p.slot}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{p.code}</td>
                    <td className="py-2 pr-3">
                      <button
                        type="button"
                        onClick={() => onOpen(p.code)}
                        className="text-left font-medium hover:underline"
                      >
                        {p.title}
                      </button>
                    </td>
                    <td className="py-2 pr-3">
                      {r && (
                        <span
                          className="rounded px-1.5 py-0.5 text-xs"
                          style={{ backgroundColor: r.color, color: textOn(r.color) }}
                        >
                          {r.name}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <StatusText piece={p} />
                    </td>
                    <td className="py-2 pr-3">
                      <span className="flex gap-1">
                        {visibleLayers(p, platforms).map((l) => (
                          <LayerBadge key={l.platform} layer={l} />
                        ))}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {views(p) ? views(p).toLocaleString("it-IT") : "–"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
