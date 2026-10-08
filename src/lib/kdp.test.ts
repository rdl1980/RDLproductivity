import { describe, expect, it } from "vitest";

import {
  addWeeks,
  cellTasks,
  isoWeekNumber,
  type KdpTaskItem,
  mondayOf,
  monthLabel,
  monthWeeks,
  parseDateKey,
  parseMonth,
  shiftMonth,
  todayIn,
  weekRangeLabel,
} from "./kdp";

describe("weeks", () => {
  it("finds the Monday of any day", () => {
    expect(mondayOf("2026-10-08")).toBe("2026-10-05");
    expect(mondayOf("2026-10-05")).toBe("2026-10-05");
    expect(mondayOf("2026-10-11")).toBe("2026-10-05");
    expect(mondayOf("2026-01-01")).toBe("2025-12-29");
    expect(mondayOf("2026-02-30")).toBeNull();
  });

  it("adds weeks across months and years", () => {
    expect(addWeeks("2026-12-28", 1)).toBe("2027-01-04");
    expect(addWeeks("2026-10-05", -1)).toBe("2026-09-28");
  });

  it("lists the weeks that touch a month", () => {
    expect(monthWeeks("2026-10")).toEqual([
      "2026-09-28",
      "2026-10-05",
      "2026-10-12",
      "2026-10-19",
      "2026-10-26",
    ]);
    // February 2027 starts on a Monday and ends on a Sunday: exactly 4 weeks.
    expect(monthWeeks("2027-02")).toHaveLength(4);
  });

  it("numbers weeks by ISO 8601", () => {
    expect(isoWeekNumber("2026-10-05")).toBe(41);
    expect(isoWeekNumber("2025-12-29")).toBe(1);
    expect(isoWeekNumber("2026-12-28")).toBe(53);
  });

  it("labels week ranges", () => {
    expect(weekRangeLabel("2026-10-05")).toBe("5 – 11 ott");
    expect(weekRangeLabel("2026-09-28")).toBe("28 set – 4 ott");
  });
});

describe("months", () => {
  it("parses and shifts months", () => {
    expect(parseMonth("2026-10")).toBe("2026-10");
    expect(parseMonth("2026-13")).toBeNull();
    expect(parseMonth(undefined)).toBeNull();
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(monthLabel("2026-10")).toBe("Ottobre 2026");
  });

  it("uses the given time zone for today", () => {
    const lateUtc = new Date("2026-10-08T23:30:00Z");
    expect(todayIn("Europe/Rome", lateUtc)).toBe("2026-10-09");
    expect(todayIn("UTC", lateUtc)).toBe("2026-10-08");
  });

  it("validates date keys", () => {
    expect(parseDateKey("2026-10-05")?.toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(parseDateKey("2026-10-32")).toBeNull();
  });
});

describe("cellTasks", () => {
  it("filters by week and account and sorts by position", () => {
    const task = (id: string, week: string, account: "main" | "secondary", position: string) =>
      ({ id, title: id, notes: null, account, week, position, done: false }) as KdpTaskItem;
    const tasks = [
      task("b", "2026-10-05", "main", "a1"),
      task("a", "2026-10-05", "main", "a0"),
      task("c", "2026-10-05", "secondary", "a0"),
      task("d", "2026-10-12", "main", "a0"),
    ];
    expect(cellTasks(tasks, "2026-10-05", "main").map((t) => t.id)).toEqual(["a", "b"]);
  });
});
