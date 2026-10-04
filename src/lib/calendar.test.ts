import { describe, expect, it } from "vitest";

import { dayKey, moveToDay, parseDayKey, shiftAnchor, visibleDays } from "./calendar";

describe("day keys", () => {
  it("round-trips local dates", () => {
    const date = new Date(2026, 0, 5);
    expect(dayKey(date)).toBe("2026-01-05");
    expect(parseDayKey("2026-01-05")?.getTime()).toBe(date.getTime());
  });

  it("rejects invalid values", () => {
    expect(parseDayKey("2026-02-30")).toBeNull();
    expect(parseDayKey("domani")).toBeNull();
    expect(parseDayKey(null)).toBeNull();
  });
});

describe("visibleDays", () => {
  it("covers October 2026 with full Monday-first weeks", () => {
    const days = visibleDays(new Date(2026, 9, 15), "month");
    expect(dayKey(days[0])).toBe("2026-09-28");
    expect(dayKey(days.at(-1)!)).toBe("2026-11-01");
    expect(days).toHaveLength(35);
    expect(days.every((day, i) => i === 0 || day > days[i - 1])).toBe(true);
  });

  it("returns the Monday-to-Sunday week", () => {
    const days = visibleDays(new Date(2026, 9, 4), "week");
    expect(days.map(dayKey)).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
  });
});

describe("navigation and moves", () => {
  it("shifts by month or week", () => {
    expect(dayKey(shiftAnchor(new Date(2026, 0, 31), "month", 1))).toBe("2026-02-28");
    expect(dayKey(shiftAnchor(new Date(2026, 9, 4), "week", -1))).toBe("2026-09-27");
  });

  it("keeps the local time when moving to another day", () => {
    const moved = moveToDay(new Date(2026, 9, 4, 18, 45), new Date(2026, 9, 10));
    expect(dayKey(moved)).toBe("2026-10-10");
    expect([moved.getHours(), moved.getMinutes()]).toEqual([18, 45]);
  });
});
