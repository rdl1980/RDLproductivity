"use client";

import {
  ArrowLeftIcon,
  BookPlusIcon,
  LibraryIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { BookFormats } from "@/components/kdp/book-formats";
import { PageHeader } from "@/components/page-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { accountLabel } from "@/lib/kdp";
import type { SeriesRow, SeriesView } from "@/lib/kdp-series-catalog";
import {
  deleteKdpSeries,
  deleteKdpSeriesBook,
  saveKdpSeriesBook,
} from "@/server/actions/kdp-series";
import type { ShelfOption, TaskOption } from "@/server/queries/kdp-series";

import { type BookDialogMode, SeriesBookDialog } from "./series-book-dialog";
import { SeriesDialog } from "./series-dialog";
import { dateLabel, PublishedLabel, SeriesStatusBadge, StageBadge } from "./series-ui";

export function SeriesDetailView({
  series,
  penNames,
  shelf,
  tasks,
}: {
  series: SeriesView;
  penNames: string[];
  shelf: ShelfOption[];
  tasks: TaskOption[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [dialog, setDialog] = useState<BookDialogMode | null>(null);
  const [dialogKey, setDialogKey] = useState(0);
  const [pending, start] = useTransition();

  function openBook(mode: BookDialogMode) {
    setDialogKey((k) => k + 1);
    setDialog(mode);
  }

  function run(action: () => Promise<{ ok: boolean; error?: string } | null>, done: string) {
    start(async () => {
      const result = await action().catch(() => null);
      if (!result?.ok) {
        toast.error((result && "error" in result && result.error) || "Errore di rete, riprova.");
        return;
      }
      toast.success(done);
      router.refresh();
    });
  }

  function remove() {
    start(async () => {
      const result = await deleteKdpSeries({ id: series.id }).catch(() => null);
      if (!result?.ok) {
        toast.error(result?.error ?? "Errore di rete, riprova.");
        return;
      }
      toast.success("Collana eliminata");
      router.push("/collane");
    });
  }

  const facts: [string, React.ReactNode][] = [
    ["Account", accountLabel(series.account)],
    [
      "Pen name",
      series.penName ? (
        <Link href="/kdp/pen-name/anagrafica" className="text-primary hover:underline">
          {series.penName}
        </Link>
      ) : (
        "—"
      ),
    ],
    ["Serie su KDP", series.kdpName ?? "non ancora su KDP"],
    [
      "Volumi",
      `${series.counts.published} pubblicati${series.plannedVolumes ? ` di ${series.plannedVolumes} previsti` : ""}`,
    ],
    ["Lingua", series.language ?? "—"],
    ["Genere", series.genre ?? "—"],
  ];

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 p-4 sm:p-6">
      <Link
        href="/collane"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        Tutte le collane
      </Link>
      <PageHeader
        icon={LibraryIcon}
        title={<span data-testid="series-title">{series.name}</span>}
        description={series.description ?? undefined}
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => setEditing(true)}>
              <PencilIcon />
              Modifica
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="Elimina la collana">
                  <Trash2Icon />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Eliminare la collana?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Spariscono la collana e i libri pianificati. I libri del Bookshelf restano in
                    Libri KDP. Non si può annullare.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                  <AlertDialogAction onClick={remove}>Elimina</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        }
      />

      <dl className="grid gap-x-6 gap-y-2 rounded-xl border p-4 text-sm sm:grid-cols-3">
        <div className="flex flex-col">
          <dt className="text-xs text-muted-foreground">Stato</dt>
          <dd>
            <SeriesStatusBadge status={series.status} />
          </dd>
        </div>
        {facts.map(([label, value]) => (
          <div key={label} className="flex flex-col">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
        {series.notes && (
          <div className="flex flex-col sm:col-span-3">
            <dt className="text-xs text-muted-foreground">Note</dt>
            <dd className="whitespace-pre-wrap">{series.notes}</dd>
          </div>
        )}
      </dl>

      <section className="flex flex-col gap-3" aria-labelledby="books-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="books-title" className="text-lg font-semibold">
            Libri ({series.counts.total})
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => openBook({ kind: "shelf" })}>
              <BookPlusIcon />
              Aggiungi dal Bookshelf
            </Button>
            <Button type="button" onClick={() => openBook({ kind: "planned" })}>
              <PlusIcon />
              Libro in lavorazione
            </Button>
          </div>
        </div>
        {series.rows.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nessun libro: aggiungine uno in lavorazione o dal Bookshelf.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm" data-testid="series-books">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Vol.</th>
                  <th className="px-3 py-2 font-medium">Titolo</th>
                  <th className="px-3 py-2 font-medium">Stato</th>
                  <th className="px-3 py-2 font-medium">Pubblicazione</th>
                  <th className="px-3 py-2 font-medium">Formati su KDP</th>
                  <th className="px-3 py-2 font-medium">Collegamenti</th>
                  <th className="px-3 py-2">
                    <span className="sr-only">Azioni</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {series.rows.map((row) => (
                  <BookRow
                    key={row.key}
                    row={row}
                    pending={pending}
                    onEdit={() => openBook({ kind: "edit", row })}
                    onLink={(bookId) =>
                      run(
                        () => saveKdpSeriesBook({ seriesId: series.id, id: row.entryId!, bookId }),
                        "Libro collegato",
                      )
                    }
                    onRemove={() =>
                      run(() => deleteKdpSeriesBook({ id: row.entryId! }), "Tolto dalla collana")
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          La data di pubblicazione è quella impostata a mano o, se manca, la prima prova che il
          libro era online: la settimana dell&apos;attività «Online» aggiunta dall&apos;import del
          Bookshelf o il giorno della prima vendita (KDP non la espone nel Bookshelf).
        </p>
      </section>

      <SeriesDialog
        key={editing ? "edit" : "closed"}
        open={editing}
        series={series}
        penNames={penNames}
        onOpenChange={setEditing}
      />
      <SeriesBookDialog
        key={dialogKey}
        seriesId={series.id}
        mode={dialog}
        shelf={shelf}
        tasks={tasks}
        onClose={() => setDialog(null)}
      />
    </main>
  );
}

function BookRow({
  row,
  pending,
  onEdit,
  onLink,
  onRemove,
}: {
  row: SeriesRow;
  pending: boolean;
  onEdit: () => void;
  onLink: (bookId: string) => void;
  onRemove: () => void;
}) {
  return (
    <tr className="border-t align-top" data-testid="series-book">
      <td className="px-3 py-2 tabular-nums">{row.volume ?? "—"}</td>
      <td className="px-3 py-2">
        <span className="font-medium">{row.title}</span>
        {row.book?.missing && (
          <span className="block text-xs text-muted-foreground">Non più sul Bookshelf</span>
        )}
        {row.penMismatch && (
          <span className="flex items-center gap-1 text-xs text-amber-800 dark:text-amber-300">
            <TriangleAlertIcon className="size-3.5" aria-hidden />
            Pen name su KDP: {row.book?.author}
          </span>
        )}
        {row.suggestion && (
          <span className="mt-1 flex flex-wrap items-center gap-1 text-xs">
            Su KDP: «{row.suggestion.title}»?
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs"
              disabled={pending}
              onClick={() => onLink(row.suggestion!.bookId)}
            >
              Collega
            </Button>
          </span>
        )}
        {row.notes && (
          <span className="block max-w-xs truncate text-xs text-muted-foreground">{row.notes}</span>
        )}
      </td>
      <td className="px-3 py-2">
        <StageBadge stage={row.stage} />
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        {row.published ? (
          <PublishedLabel published={row.published} />
        ) : row.plannedDate ? (
          <span className="flex flex-col">
            <span className="tabular-nums">{dateLabel(row.plannedDate)}</span>
            <span className="text-xs text-muted-foreground">prevista</span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="min-w-64 px-3 py-2">
        {row.book ? (
          <BookFormats formats={row.book.formats} />
        ) : (
          <span className="text-xs text-muted-foreground">Non ancora su KDP</span>
        )}
      </td>
      <td className="px-3 py-2 text-xs">
        <span className="flex flex-col gap-1">
          {row.card && (
            <Link
              href={`/boards/${row.card.boardId}?card=${row.card.id}`}
              className="text-primary hover:underline"
            >
              Card: {row.card.title}
            </Link>
          )}
          {row.task && (
            <Link href={`/kdp?week=${row.task.week}`} className="text-primary hover:underline">
              Attività: {row.task.title}
            </Link>
          )}
          {!row.card && !row.task && <span className="text-muted-foreground">—</span>}
        </span>
      </td>
      <td className="px-3 py-2">
        <span className="flex justify-end gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            onClick={onEdit}
            aria-label={`Modifica ${row.title}`}
          >
            <PencilIcon />
          </Button>
          {row.entryId && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8"
              disabled={pending}
              onClick={onRemove}
              aria-label={
                row.book?.bySeriesName
                  ? `Togli i dettagli di ${row.title}`
                  : `Togli ${row.title} dalla collana`
              }
            >
              <Trash2Icon />
            </Button>
          )}
        </span>
      </td>
    </tr>
  );
}
