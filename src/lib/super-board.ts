import type { AggregateCard } from "./aggregate";
import { type Priority, SUPER_BOARD_PRIORITIES } from "./priority";

export type BoardListRef = { id: string; title: string; boardId: string };

export type SuperColumn = { key: string; title: string };

/** Lists with the same name on different boards share a super board column. */
export function columnKey(listTitle: string): string {
  return listTitle.trim().toLocaleLowerCase("it");
}

/**
 * Columns are the list names of the boards that have super board cards,
 * ordered by where those lists sit in their boards (`lists` is in board order).
 */
export function superColumns(cards: AggregateCard[], lists: BoardListRef[]): SuperColumn[] {
  const boards = new Set(cards.map((card) => card.board.id));
  const order = new Map<string, { title: string; rank: number }>();
  const indexInBoard = new Map<string, number>();
  for (const list of lists) {
    if (!boards.has(list.boardId)) continue;
    const rank = indexInBoard.get(list.boardId) ?? 0;
    indexInBoard.set(list.boardId, rank + 1);
    const key = columnKey(list.title);
    const current = order.get(key);
    if (!current || rank < current.rank) order.set(key, { title: list.title.trim(), rank });
  }
  return [...order.entries()]
    .sort(([, a], [, b]) => a.rank - b.rank || a.title.localeCompare(b.title, "it"))
    .map(([key, { title }]) => ({ key, title }));
}

/** Cards of one swimlane cell, by due date (none last), then title. */
export function cellCards(cards: AggregateCard[], column: string, priority: Priority) {
  return cards
    .filter((card) => card.priority === priority && columnKey(card.list.title) === column)
    .sort(
      (a, b) =>
        (a.dueDate ?? "￿").localeCompare(b.dueDate ?? "￿") || a.title.localeCompare(b.title, "it"),
    );
}

export function isSuperBoardPriority(priority: number | null): priority is Priority {
  return (SUPER_BOARD_PRIORITIES as (number | null)[]).includes(priority);
}

/** The list of `boardId` that matches a column, if the board has one. */
export function targetList(lists: BoardListRef[], boardId: string, column: string) {
  return lists.find((list) => list.boardId === boardId && columnKey(list.title) === column);
}
