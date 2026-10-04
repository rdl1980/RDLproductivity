import { describe, expect, it } from "vitest";

import { positionAfter, positionBetween, positionsFor } from "./position";

describe("position", () => {
  it("generates ascending positions", () => {
    const keys = positionsFor(5);
    expect(keys).toHaveLength(5);
    expect([...keys].sort()).toEqual(keys);
  });

  it("inserts between two neighbours without touching them", () => {
    const [a, b] = positionsFor(2);
    const mid = positionBetween(a, b);
    expect(mid > a && mid < b).toBe(true);
  });

  it("appends after the last item and handles an empty list", () => {
    const first = positionAfter(null);
    const second = positionAfter(first);
    expect(second > first).toBe(true);
  });

  it("supports repeated inserts at the head", () => {
    let head = positionAfter(null);
    for (let i = 0; i < 50; i++) {
      const next = positionBetween(null, head);
      expect(next < head).toBe(true);
      head = next;
    }
  });
});
