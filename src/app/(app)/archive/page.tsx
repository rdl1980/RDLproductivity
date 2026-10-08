import type { Metadata } from "next";
import Link from "next/link";

import { ArchiveActions } from "@/components/archive/archive-actions";
import { DEFAULT_BOARD_COLOR } from "@/lib/board-colors";
import { getArchive } from "@/server/queries/archive";
import { requireSession } from "@/server/session";
import { ArchiveIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Archivio · RDL Productivity" };

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h2 className="text-lg font-semibold">
        {title} <span className="text-sm font-normal text-muted-foreground">({count})</span>
      </h2>
      {count === 0 ? (
        <p className="text-sm text-muted-foreground">Nessun elemento archiviato.</p>
      ) : (
        <ul className="divide-y rounded-lg border">{children}</ul>
      )}
    </section>
  );
}

export default async function ArchivePage() {
  await requireSession();
  const { boards, lists, cards } = await getArchive();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-6">
      <PageHeader
        icon={ArchiveIcon}
        title="Archivio"
        description="Ripristina gli elementi archiviati oppure eliminali definitivamente. Ripristinando una lista o una card vengono ripristinate anche la board e la lista che le contengono."
      />

      <Section title="Board" count={boards.length}>
        {boards.map((board) => (
          <li key={board.id} className="flex items-center gap-3 p-3">
            <span
              className="size-4 shrink-0 rounded"
              style={{ backgroundColor: board.color ?? DEFAULT_BOARD_COLOR }}
            />
            <span className="min-w-0 flex-1 truncate font-medium">{board.title}</span>
            <ArchiveActions kind="board" id={board.id} title={board.title} />
          </li>
        ))}
      </Section>

      <Section title="Liste" count={lists.length}>
        {lists.map((list) => (
          <li key={list.id} className="flex items-center gap-3 p-3">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{list.title}</span>
              <span className="truncate text-xs text-muted-foreground">
                {list.board.title}
                {list.board.archived && " (board archiviata)"} · {list._count.cards} card
              </span>
            </div>
            <ArchiveActions kind="list" id={list.id} title={list.title} />
          </li>
        ))}
      </Section>

      <Section title="Card" count={cards.length}>
        {cards.map((card) => (
          <li key={card.id} className="flex items-center gap-3 p-3">
            <div className="flex min-w-0 flex-1 flex-col">
              {card.list.board.archived ? (
                <span className="truncate font-medium">{card.title}</span>
              ) : (
                <Link
                  href={`/boards/${card.list.board.id}?card=${card.id}`}
                  className="truncate font-medium hover:underline"
                >
                  {card.title}
                </Link>
              )}
              <span className="truncate text-xs text-muted-foreground">
                {card.list.board.title} › {card.list.title}
                {card.list.archived && " (lista archiviata)"}
              </span>
            </div>
            <ArchiveActions kind="card" id={card.id} title={card.title} />
          </li>
        ))}
      </Section>
    </main>
  );
}
