import type { Metadata } from "next";

import { BoardGrid } from "@/components/boards/board-grid";
import { getBoardCounts, getBoards } from "@/server/queries/boards";
import { requireSession } from "@/server/session";
import { listTemplates } from "@/server/templates";
import { LayoutGridIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Board · RDL Productivity" };

export default async function BoardsPage() {
  await requireSession();
  const [boards, templates, counts] = await Promise.all([
    getBoards(),
    listTemplates("board"),
    getBoardCounts(),
  ]);

  return (
    <main className="mx-auto w-full max-w-5xl p-6">
      <PageHeader
        icon={LayoutGridIcon}
        title="Le tue board"
        description={`${boards.length} ${boards.length === 1 ? "board attiva" : "board attive"}`}
        className="mb-8"
      />
      <BoardGrid
        boards={boards.map((board) => ({
          ...board,
          ...(counts.get(board.id) ?? { lists: 0, openCards: 0 }),
        }))}
        templates={templates}
      />
    </main>
  );
}
