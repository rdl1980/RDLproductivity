import type { Metadata } from "next";
import Link from "next/link";

import { DueBadge } from "@/components/card-detail/card-badges";
import { Highlighted } from "@/components/search/highlighted";
import { DEFAULT_BOARD_COLOR } from "@/lib/board-colors";
import { labelTextColor } from "@/lib/label-colors";
import { snippet } from "@/lib/search";
import { accountLabel, type KdpAccount, type KdpTrack, laneLabel, weekRangeLabel } from "@/lib/kdp";
import { mainTitle } from "@/lib/kdp-books";
import { parseFormats } from "@/server/queries/kdp-books";
import {
  SEARCH_LIMIT,
  searchBoards,
  searchCards,
  searchKdpBooks,
  searchKdpTasks,
} from "@/server/queries/search";
import { requireSession } from "@/server/session";

export async function generateMetadata({ searchParams }: PageProps<"/search">): Promise<Metadata> {
  const { q } = await searchParams;
  return { title: typeof q === "string" && q ? `"${q}" · Ricerca` : "Ricerca · RDL Productivity" };
}

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  await requireSession();
  const { q: raw } = await searchParams;
  const q = typeof raw === "string" ? raw.trim().slice(0, 200) : "";
  const [cards, boards, kdpBooks, kdpTasks] = await Promise.all([
    searchCards(q),
    searchBoards(q),
    searchKdpBooks(q),
    searchKdpTasks(q),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        {q ? (
          <>
            Risultati per <span className="text-muted-foreground">“{q}”</span>
          </>
        ) : (
          "Ricerca"
        )}
      </h1>

      {!q && (
        <p className="text-muted-foreground">
          Scrivi nella barra in alto (scorciatoia <kbd className="rounded border px-1">/</kbd>) per
          cercare nelle card, nei libri KDP (titolo, collana, ASIN) e nelle attività del calendario
          KDP.
        </p>
      )}

      {boards.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Board</h2>
          <ul className="flex flex-wrap gap-2">
            {boards.map((board) => (
              <li key={board.id}>
                <Link
                  href={`/boards/${board.id}`}
                  className="block rounded-md px-3 py-1.5 text-sm font-medium text-white hover:brightness-110"
                  style={{ backgroundColor: board.color ?? DEFAULT_BOARD_COLOR }}
                >
                  <Highlighted text={board.title} query={q} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {kdpBooks.length > 0 && (
        <section className="flex flex-col gap-2" aria-label="Libri KDP">
          <h2 className="text-sm font-medium text-muted-foreground">
            Libri KDP ({kdpBooks.length})
          </h2>
          <ul className="flex flex-col gap-2">
            {kdpBooks.map((book) => {
              const asins = parseFormats(book.formats).flatMap((f) => (f.asin ? [f.asin] : []));
              return (
                <li key={book.id}>
                  <Link
                    href={`/kdp/libri?q=${encodeURIComponent(mainTitle(book.title))}`}
                    className="flex flex-col gap-0.5 rounded-lg border p-3 hover:bg-muted/60"
                  >
                    <span className="text-xs text-muted-foreground">
                      {accountLabel(book.account as KdpAccount)}
                      {book.series ? ` · ${book.series}` : ""}
                    </span>
                    <span className="font-medium">
                      <Highlighted text={book.title} query={q} />
                    </span>
                    {asins.length > 0 && (
                      <span className="font-mono text-xs text-muted-foreground">
                        <Highlighted text={asins.join(" ")} query={q} />
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {kdpTasks.length > 0 && (
        <section className="flex flex-col gap-2" aria-label="Attività KDP">
          <h2 className="text-sm font-medium text-muted-foreground">
            Attività KDP ({kdpTasks.length})
          </h2>
          <ul className="flex flex-col gap-2">
            {kdpTasks.map((task) => {
              const week = task.week.toISOString().slice(0, 10);
              return (
                <li key={task.id}>
                  <Link
                    href={`/kdp?month=${week.slice(0, 7)}`}
                    className="flex flex-col gap-0.5 rounded-lg border p-3 hover:bg-muted/60"
                  >
                    <span className="text-xs text-muted-foreground">
                      {laneLabel(task.account as KdpAccount, task.track as KdpTrack)} · settimana{" "}
                      {weekRangeLabel(week)} {week.slice(0, 4)}
                      {task.done ? " · fatta" : ""}
                    </span>
                    <span className="font-medium">
                      <Highlighted text={task.title} query={q} />
                    </span>
                    {task.notes && (
                      <span className="text-sm text-muted-foreground">
                        <Highlighted text={snippet(task.notes, q)} query={q} />
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {q && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Card ({cards.length}
            {cards.length === SEARCH_LIMIT ? "+" : ""})
          </h2>
          {cards.length === 0 ? (
            <p className="text-muted-foreground">Nessuna card trovata.</p>
          ) : (
            <ul className="flex flex-col gap-2" aria-label="Risultati">
              {cards.map((card) => (
                <li key={card.id}>
                  <Link
                    href={`/boards/${card.list.board.id}?card=${card.id}`}
                    className="flex flex-col gap-1 rounded-lg border p-3 hover:bg-muted/60"
                  >
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span
                        className="inline-block size-2.5 rounded-sm"
                        style={{ backgroundColor: card.list.board.color ?? DEFAULT_BOARD_COLOR }}
                      />
                      {card.list.board.title} › {card.list.title}
                    </span>
                    <span className="font-medium">
                      <Highlighted text={card.title} query={q} />
                    </span>
                    {card.description && (
                      <span className="text-sm text-muted-foreground">
                        <Highlighted text={snippet(card.description, q)} query={q} />
                      </span>
                    )}
                    {(card.labels.length > 0 || card.dueDate) && (
                      <span className="flex flex-wrap items-center gap-1.5">
                        {card.labels.map(({ label }) => (
                          <span
                            key={label.id}
                            className="rounded px-1.5 text-[11px] leading-4 font-medium"
                            style={{
                              backgroundColor: label.color,
                              color: labelTextColor(label.color),
                            }}
                          >
                            {label.name || " "}
                          </span>
                        ))}
                        <DueBadge
                          dueDate={card.dueDate?.toISOString() ?? null}
                          completed={card.completed}
                        />
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
