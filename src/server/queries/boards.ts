import "server-only";

import { db } from "@/server/db";

export function getBoards() {
  return db.board.findMany({
    where: { archived: false },
    orderBy: { position: "asc" },
    select: { id: true, title: true, color: true },
  });
}

export function getBoard(id: string) {
  return db.board.findFirst({
    where: { id, archived: false },
    select: {
      id: true,
      title: true,
      color: true,
      lists: {
        where: { archived: false },
        orderBy: { position: "asc" },
        select: {
          id: true,
          title: true,
          position: true,
          cards: {
            where: { archived: false },
            orderBy: { position: "asc" },
            select: { id: true, title: true, position: true },
          },
        },
      },
    },
  });
}
