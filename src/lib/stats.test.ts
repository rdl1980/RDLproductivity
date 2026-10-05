import { describe, expect, it } from "vitest";

import { completionsPerWeek, countSince, formatDays, niceMax, startOfWeek } from "./stats";

describe("stats", () => {
  // Wednesday 7 Oct 2026, local time.
  const now = new Date(2026, 9, 7, 15, 0);

  it("starts weeks on Monday", () => {
    expect(startOfWeek(now)).toEqual(new Date(2026, 9, 5));
    expect(startOfWeek(new Date(2026, 9, 11, 23))).toEqual(new Date(2026, 9, 5));
    expect(startOfWeek(new Date(2026, 9, 12, 0, 1))).toEqual(new Date(2026, 9, 12));
  });

  it("buckets completions by week, oldest first", () => {
    const dates = [
      new Date(2026, 9, 5, 9).toISOString(),
      new Date(2026, 9, 6, 9).toISOString(),
      new Date(2026, 8, 30, 9).toISOString(),
      new Date(2026, 0, 1).toISOString(), // outside the window
    ];
    const weeks = completionsPerWeek(dates, now, 3);
    expect(weeks.map((w) => w.count)).toEqual([0, 1, 2]);
    expect(weeks[2].start).toEqual(new Date(2026, 9, 5));
    expect(countSince(dates, new Date(2026, 9, 1))).toBe(2);
  });

  it("formats ages and rounds axis maxima", () => {
    expect(formatDays(0.25)).toBe("6 h");
    expect(formatDays(3.44)).toBe("3,4 g");
    expect(formatDays(42.6)).toBe("43 g");
    expect([0, 1, 3, 7, 12, 38, 101].map(niceMax)).toEqual([1, 1, 5, 10, 20, 50, 200]);
  });
});
