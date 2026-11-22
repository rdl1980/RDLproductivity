"use client";

import { XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trackLabel } from "@/lib/kdp";
import { mainTitle } from "@/lib/kdp-books";
import { BOOK_STAGES, type EntryCard, type SeriesRow } from "@/lib/kdp-series-catalog";
import { findLinkableCards, type LinkableCard } from "@/server/actions/kdp-books";
import { saveKdpSeriesBook } from "@/server/actions/kdp-series";
import type { ShelfOption, TaskOption } from "@/server/queries/kdp-series";

import { dateLabel, PublishedLabel, selectClass } from "./series-ui";

/** What the dialog edits: a new planned book, a book from the Bookshelf, or a row. */
export type BookDialogMode =
  { kind: "planned" } | { kind: "shelf" } | { kind: "edit"; row: SeriesRow };

export function SeriesBookDialog({
  seriesId,
  mode,
  shelf,
  tasks,
  onClose,
}: {
  seriesId: string;
  mode: BookDialogMode | null;
  shelf: ShelfOption[];
  tasks: TaskOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const row = mode?.kind === "edit" ? mode.row : null;
  const hasBook = !!row?.book;
  const live = row?.book?.formats.some((f) => f.status === "live") ?? false;
  const [card, setCard] = useState<EntryCard | null>(row?.card ?? null);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? "");
    const optionalDate = (key: string) => (form.has(key) ? text(key) || null : undefined);
    const volume = text("volume").trim();
    const bookId = form.has("bookId") ? text("bookId") || null : undefined;
    const input = {
      seriesId,
      ...(row?.entryId ? { id: row.entryId } : {}),
      ...(row?.book && !row.entryId ? { bookId: row.book.id } : {}),
      ...(bookId !== undefined ? { bookId } : {}),
      ...(form.has("title") ? { title: text("title") } : {}),
      volume: volume ? Number(volume) : null,
      ...(form.has("status") ? { status: text("status") } : {}),
      plannedDate: optionalDate("plannedDate"),
      publishedAt: optionalDate("publishedAt"),
      notes: text("notes"),
      cardId: card?.id ?? null,
      taskId: text("taskId") || null,
    };
    start(async () => {
      const result = await saveKdpSeriesBook(input).catch(() => null);
      if (!result?.ok) {
        toast.error(result?.error ?? "Errore di rete, riprova.");
        return;
      }
      toast.success("Libro salvato");
      onClose();
      router.refresh();
    });
  }

  const title =
    mode?.kind === "planned"
      ? "Nuovo libro in lavorazione"
      : mode?.kind === "shelf"
        ? "Aggiungi dal Bookshelf"
        : "Modifica libro";

  return (
    <Dialog open={mode !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {row?.title ??
              (mode?.kind === "shelf"
                ? "Un libro già su KDP, dello stesso account della collana."
                : "Un libro pianificato o in lavorazione, non ancora sul Bookshelf.")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          {mode?.kind === "shelf" && (
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="book-shelf">Libro KDP</Label>
              <select
                id="book-shelf"
                name="bookId"
                required
                defaultValue=""
                className={selectClass}
              >
                <option value="" disabled>
                  {shelf.length ? "Scegli…" : "Nessun libro disponibile"}
                </option>
                {shelf.map((b) => (
                  <option key={b.id} value={b.id}>
                    {mainTitle(b.title)}
                    {b.series ? ` · serie KDP: ${b.series}` : ""}
                    {b.live ? "" : " · non online"}
                  </option>
                ))}
              </select>
            </div>
          )}
          {mode && !hasBook && mode.kind !== "shelf" && (
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="book-title">Titolo</Label>
              <Input
                id="book-title"
                name="title"
                required
                maxLength={300}
                defaultValue={row?.title ?? ""}
              />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="book-volume">Volume</Label>
            <Input
              id="book-volume"
              name="volume"
              type="number"
              min={1}
              max={999}
              defaultValue={row ? ((hasBook ? row.book!.volume : row.volume) ?? "") : ""}
              placeholder={hasBook && row?.volume ? `${row.volume} (dal titolo)` : undefined}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="book-status">Stato</Label>
            {live ? (
              <p id="book-status" className="flex h-9 items-center text-sm text-muted-foreground">
                Pubblicato (online su KDP)
              </p>
            ) : (
              <select
                id="book-status"
                name="status"
                defaultValue={row?.stage ?? "idea"}
                className={selectClass}
              >
                {BOOK_STAGES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            )}
          </div>
          {!live && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="book-planned">Uscita prevista</Label>
              <Input
                id="book-planned"
                name="plannedDate"
                type="date"
                defaultValue={row?.entryId ? (row.plannedDate ?? "") : ""}
              />
            </div>
          )}
          {hasBook && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="book-published">Data di pubblicazione</Label>
              <Input
                id="book-published"
                name="publishedAt"
                type="date"
                defaultValue={row!.book!.publishedAt ?? ""}
                aria-describedby="book-published-hint"
              />
              <p id="book-published-hint" className="text-xs text-muted-foreground">
                Vuota = ricavata dall&apos;attività Online o dalla prima vendita
                {row!.published && row!.published.source !== "manual" ? (
                  <>
                    {" "}
                    (ora: <PublishedLabel published={row!.published} />)
                  </>
                ) : null}
              </p>
            </div>
          )}
          {mode?.kind === "edit" && !hasBook && (
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="book-link">Libro KDP</Label>
              <select
                id="book-link"
                name="bookId"
                defaultValue={row?.suggestion?.bookId ?? ""}
                className={selectClass}
                aria-describedby="book-link-hint"
              >
                <option value="">Non ancora su KDP</option>
                {shelf.map((b) => (
                  <option key={b.id} value={b.id}>
                    {mainTitle(b.title)}
                    {b.live ? "" : " · non online"}
                  </option>
                ))}
              </select>
              <p id="book-link-hint" className="text-xs text-muted-foreground">
                Quando esce, collegalo al libro del Bookshelf: stato e date seguiranno KDP.
              </p>
            </div>
          )}
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="book-task">Attività del calendario KDP</Label>
            <select
              id="book-task"
              name="taskId"
              defaultValue={row?.task?.id ?? ""}
              className={selectClass}
            >
              <option value="">Nessuna</option>
              {row?.task && !tasks.some((t) => t.id === row.task!.id) && (
                <option value={row.task.id}>{taskText(row.task)}</option>
              )}
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {taskText(t)}
                </option>
              ))}
            </select>
          </div>
          <CardPicker
            card={card}
            onChange={setCard}
            initialQuery={row?.title ?? ""}
            open={mode !== null}
          />
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="book-notes">Note</Label>
            <Textarea
              id="book-notes"
              name="notes"
              maxLength={5000}
              rows={2}
              defaultValue={row?.notes ?? ""}
            />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              Salva
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function taskText(t: { title: string; week: string; track: TaskOption["track"]; done: boolean }) {
  return `Sett. ${dateLabel(t.week)} · ${trackLabel(t.track)} · ${t.title}${t.done ? " (fatta)" : ""}`;
}

/** The board card of the book: shows the linked one, or searches cards to link. */
function CardPicker({
  card,
  onChange,
  initialQuery,
  open,
}: {
  card: EntryCard | null;
  onChange: (card: EntryCard | null) => void;
  initialQuery: string;
  open: boolean;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<LinkableCard[] | null>(null);

  useEffect(() => {
    if (!open || card || !query.trim()) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await findLinkableCards(query).catch(() => null);
      if (!cancelled) setResults(result?.ok ? result.data.slice(0, 6) : []);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, card, query]);

  return (
    <div className="flex flex-col gap-1.5 sm:col-span-2">
      <Label htmlFor="book-card">Card</Label>
      {card ? (
        <div className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-sm">
          <span>
            <span className="font-medium">{card.title}</span>
            <span className="text-muted-foreground"> · {card.boardTitle}</span>
          </span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() => onChange(null)}
            aria-label="Scollega la card"
          >
            <XIcon />
          </Button>
        </div>
      ) : (
        <>
          <Input
            id="book-card"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca una card da collegare"
          />
          {results && (
            <ul className="flex flex-col gap-0.5" aria-live="polite" aria-label="Card trovate">
              {results.length === 0 && (
                <li className="px-2 py-1 text-sm text-muted-foreground">Nessuna card trovata.</li>
              )}
              {results.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        id: c.id,
                        title: c.title,
                        boardId: c.boardId,
                        boardTitle: c.boardTitle,
                      })
                    }
                    className="flex w-full flex-col rounded-md px-2 py-1 text-left text-sm hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <span className="font-medium">{c.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {c.boardTitle} · {c.listTitle}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
