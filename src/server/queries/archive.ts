import "server-only";

import { db } from "@/server/db";

export async function getArchive() {
  const [boards, lists, cards] = await Promise.all([
    db.board.findMany({
      where: { archived: true },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, color: true, updatedAt: true },
    }),
    db.list.findMany({
      where: { archived: true },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        updatedAt: true,
        board: { select: { id: true, title: true, archived: true } },
        _count: { select: { cards: true } },
      },
    }),
    db.card.findMany({
      where: { archived: true },
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: {
        id: true,
        title: true,
        updatedAt: true,
        list: {
          select: {
            title: true,
            archived: true,
            board: { select: { id: true, title: true, archived: true } },
          },
        },
      },
    }),
  ]);
  return { boards, lists, cards };
}
