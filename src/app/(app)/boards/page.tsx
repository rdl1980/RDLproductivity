import type { Metadata } from "next";

import { BoardGrid } from "@/components/boards/board-grid";
import { getBoards } from "@/server/queries/boards";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Board · RDL Productivity" };

export default async function BoardsPage() {
  await requireSession();
  const boards = await getBoards();

  return (
    <main className="mx-auto w-full max-w-5xl p-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Le tue board</h1>
      <BoardGrid boards={boards} />
    </main>
  );
}
