import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BoardView } from "@/components/board/board-view";
import { DEFAULT_BOARD_COLOR } from "@/lib/board-colors";
import { getBoard } from "@/server/queries/boards";
import { requireSession } from "@/server/session";

export async function generateMetadata({
  params,
}: PageProps<"/boards/[boardId]">): Promise<Metadata> {
  await requireSession();
  const { boardId } = await params;
  const board = await getBoard(boardId);
  return { title: board ? `${board.title} · RDL Productivity` : "RDL Productivity" };
}

export default async function BoardPage({ params }: PageProps<"/boards/[boardId]">) {
  await requireSession();
  const { boardId } = await params;
  const board = await getBoard(boardId);
  if (!board) notFound();

  return (
    <BoardView
      // Remount when the server sends a different board so local state resets.
      key={board.id}
      board={{ id: board.id, title: board.title, color: board.color ?? DEFAULT_BOARD_COLOR }}
      initialLists={board.lists}
      initialLabels={board.labels}
    />
  );
}
