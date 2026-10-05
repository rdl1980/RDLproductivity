import { describe, expect, it } from "vitest";

import type { AggregateCard } from "./aggregate";
import { newCardSummary } from "./board-state";
import { cellCards, columnKey, superColumns, targetList } from "./super-board";

function card(id: string, boardId: string, listTitle: string, priority: number, due?: string) {
  return {
    ...newCardSummary(id, id, "a0"),
    priority,
    dueDate: due ?? null,
    board: { id: boardId, title: boardId, color: null },
    list: { id: `${boardId}-${listTitle}`, title: listTitle },
    labels: [],
  } satisfies AggregateCard;
}

const lists = [
  { id: "a1", title: "Da fare", boardId: "A" },
  { id: "a2", title: "In corso", boardId: "A" },
  { id: "a3", title: "Fatto", boardId: "A" },
  { id: "b1", title: "Backlog", boardId: "B" },
  { id: "b2", title: " da fare ", boardId: "B" },
  { id: "c1", title: "Altro", boardId: "C" },
];

describe("super board", () => {
  it("merges lists by name and orders columns by their place in the boards", () => {
    const cards = [card("x", "A", "In corso", 0), card("y", "B", "da fare", 1)];
    expect(superColumns(cards, lists)).toEqual([
      { key: "backlog", title: "Backlog" },
      { key: "da fare", title: "Da fare" },
      { key: "in corso", title: "In corso" },
      { key: "fatto", title: "Fatto" },
    ]);
  });

  it("ignores boards without super board cards", () => {
    expect(superColumns([card("x", "C", "Altro", 0)], lists)).toEqual([
      { key: "altro", title: "Altro" },
    ]);
  });

  it("fills cells by priority and column, by due date", () => {
    const cards = [
      card("late", "A", "Da fare", 0, "2026-10-09T10:00:00.000Z"),
      card("none", "B", "da fare", 0),
      card("soon", "A", "Da fare", 0, "2026-10-06T10:00:00.000Z"),
      card("p1", "A", "Da fare", 1),
    ];
    expect(cellCards(cards, columnKey("Da fare"), 0).map((c) => c.id)).toEqual([
      "soon",
      "late",
      "none",
    ]);
    expect(cellCards(cards, "da fare", 1).map((c) => c.id)).toEqual(["p1"]);
  });

  it("finds the matching list in the card's own board", () => {
    expect(targetList(lists, "B", "da fare")?.id).toBe("b2");
    expect(targetList(lists, "B", "fatto")).toBeUndefined();
  });
});
