import { describe, expect, it } from "vitest";

import {
  type ListItem,
  moveCardInState,
  moveListInState,
  newCardSummary,
  patchCard,
  patchList,
  removeCard,
  removeList,
  repositionCard,
  upsertCard,
  upsertList,
} from "./board-state";
import { positionsFor } from "./position";

const card = (id: string, position: string) => newCardSummary(id, id.toUpperCase(), position);

function makeBoard(): ListItem[] {
  const [l1, l2] = positionsFor(2);
  const [c1, c2, c3] = positionsFor(3);
  return [
    {
      id: "todo",
      title: "Da fare",
      position: l1,
      cards: [card("a", c1), card("b", c2), card("c", c3)],
    },
    { id: "done", title: "Fatto", position: l2, cards: [] },
  ];
}

const ids = (list: ListItem) => list.cards.map((c) => c.id);

describe("moveCardInState", () => {
  it("reorders within the same list", () => {
    const lists = moveCardInState(makeBoard(), "a", "todo", 2);
    expect(ids(lists[0])).toEqual(["b", "c", "a"]);
  });

  it("moves across lists", () => {
    const lists = moveCardInState(makeBoard(), "b", "done", 0);
    expect(ids(lists[0])).toEqual(["a", "c"]);
    expect(ids(lists[1])).toEqual(["b"]);
  });

  it("clamps the index and ignores unknown ids", () => {
    const board = makeBoard();
    expect(ids(moveCardInState(board, "a", "done", 99)[1])).toEqual(["a"]);
    expect(moveCardInState(board, "zzz", "done", 0)).toBe(board);
    expect(moveCardInState(board, "a", "nope", 0)).toBe(board);
  });
});

describe("repositionCard", () => {
  it("places the card strictly between its neighbours", () => {
    const moved = moveCardInState(makeBoard(), "c", "todo", 0);
    const result = repositionCard(moved, "c")!;
    const [c, a] = result.lists[0].cards;
    expect(result.beforeId).toBeNull();
    expect(result.afterId).toBe("a");
    expect(c.position < a.position).toBe(true);
  });

  it("handles an empty destination list", () => {
    const moved = moveCardInState(makeBoard(), "a", "done", 0);
    const result = repositionCard(moved, "a")!;
    expect(result.listId).toBe("done");
    expect(result.beforeId).toBeNull();
    expect(result.afterId).toBeNull();
  });
});

describe("moveListInState", () => {
  it("reorders lists and keeps positions sorted", () => {
    const result = moveListInState(makeBoard(), "done", 0)!;
    expect(result.lists.map((l) => l.id)).toEqual(["done", "todo"]);
    expect(result.lists[0].position < result.lists[1].position).toBe(true);
    expect(result.afterId).toBe("todo");
  });
});

describe("upsert helpers", () => {
  it("restores a removed card at its position", () => {
    const board = makeBoard();
    const b = board[0].cards[1];
    const restored = upsertCard(removeCard(board, "b"), "todo", b);
    expect(ids(restored[0])).toEqual(["a", "b", "c"]);
  });

  it("moves a card back to its original list", () => {
    const board = makeBoard();
    const a = board[0].cards[0];
    const moved = moveCardInState(board, "a", "done", 0);
    const reverted = upsertCard(moved, "todo", a);
    expect(ids(reverted[0])).toEqual(["a", "b", "c"]);
    expect(ids(reverted[1])).toEqual([]);
  });

  it("keeps lists ordered when restoring one", () => {
    const board = makeBoard();
    const restored = upsertList(removeList(board, "todo"), board[0]);
    expect(restored.map((l) => l.id)).toEqual(["todo", "done"]);
  });

  it("patches titles without touching other items", () => {
    const board = makeBoard();
    expect(patchCard(board, "b", { title: "Bee" })[0].cards[1].title).toBe("Bee");
    expect(patchList(board, "done", { title: "Chiuso" })[1].title).toBe("Chiuso");
    expect(patchCard(board, "b", { title: "Bee" })[1]).toBe(board[1]);
  });
});
