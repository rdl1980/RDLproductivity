import "server-only";

import { db } from "@/server/db";

export const EXPORT_VERSION = 1;

/** Every board (archived ones included) with lists, cards, labels and checklists. */
export async function getExportData() {
  const boards = await db.board.findMany({
    orderBy: { position: "asc" },
    include: {
      labels: { orderBy: { name: "asc" } },
      lists: {
        orderBy: { position: "asc" },
        include: {
          cards: {
            orderBy: { position: "asc" },
            include: {
              labels: { select: { labelId: true } },
              checklists: {
                orderBy: { position: "asc" },
                include: { items: { orderBy: { position: "asc" } } },
              },
            },
          },
        },
      },
    },
  });
  return {
    app: "rdlproductivity",
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    boards: boards.map((board) => ({
      ...board,
      lists: board.lists.map((list) => ({
        ...list,
        cards: list.cards.map(({ labels, ...card }) => ({
          ...card,
          labelIds: labels.map((label) => label.labelId),
        })),
      })),
    })),
  };
}
