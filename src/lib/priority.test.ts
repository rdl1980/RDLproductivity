import { describe, expect, it } from "vitest";

import { isPriority, priorityLabel, priorityRank } from "./priority";

describe("priority", () => {
  it("accepts only 0-4", () => {
    expect([0, 1, 2, 3, 4].every(isPriority)).toBe(true);
    expect(isPriority(5)).toBe(false);
    expect(isPriority(-1)).toBe(false);
    expect(isPriority(null)).toBe(false);
  });

  it("labels and ranks priorities, none last", () => {
    expect(priorityLabel(0)).toBe("P0 · Critica");
    expect(priorityLabel(null)).toBe("Nessuna");
    expect([3, null, 0].sort((a, b) => priorityRank(a) - priorityRank(b))).toEqual([0, 3, null]);
  });
});
