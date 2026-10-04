import type { Metadata } from "next";
import Link from "next/link";

import { DueBadge } from "@/components/card-detail/card-badges";
import { Highlighted } from "@/components/search/highlighted";
import { DEFAULT_BOARD_COLOR } from "@/lib/board-colors";
import { labelTextColor } from "@/lib/label-colors";
import { snippet } from "@/lib/search";
import { SEARCH_LIMIT, searchBoards, searchCards } from "@/server/queries/search";
import { requireSession } from "@/server/session";

export async function generateMetadata({ searchParams }: PageProps<"/search">): Promise<Metadata> {
  const { q } = await searchParams;
  return { title: typeof q === "string" && q ? `"${q}" · Ricerca` : "Ricerca · RDL Productivity" };
}

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  await requireSession();
  const { q: raw } = await searchParams;
  const q = typeof raw === "string" ? raw.trim().slice(0, 200) : "";
  const [cards, boards] = await Promise.all([searchCards(q), searchBoards(q)]);

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
          cercare nei titoli e nelle descrizioni delle card.
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
