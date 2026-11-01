import { describe, expect, it } from "vitest";

import {
  addWeeks,
  cellTasks,
  laneLabel,
  isoWeekNumber,
  type KdpTaskItem,
  weekStartOf,
  monthLabel,
  monthWeeks,
  parseDateKey,
  parseMonth,
  shiftMonth,
  spanLabel,
  todayIn,
  weekRangeLabel,
  weeksFrom,
} from "./kdp";

describe("weeks", () => {
  it("finds the Sunday of any day", () => {
    expect(weekStartOf("2026-10-08")).toBe("2026-10-04");
    expect(weekStartOf("2026-10-04")).toBe("2026-10-04");
    expect(weekStartOf("2026-10-10")).toBe("2026-10-04");
    expect(weekStartOf("2026-01-01")).toBe("2025-12-28");
    expect(weekStartOf("2026-02-30")).toBeNull();
  });

  it("lists consecutive weeks and labels their span", () => {
    expect(weeksFrom("2026-09-27", 3)).toEqual(["2026-09-27", "2026-10-04", "2026-10-11"]);
    expect(spanLabel("2026-09-27", "2026-11-15")).toBe("27 set – 21 nov 2026");
  });

  it("adds weeks across months and years", () => {
    expect(addWeeks("2026-12-28", 1)).toBe("2027-01-04");
    expect(addWeeks("2026-10-05", -1)).toBe("2026-09-28");
  });

  it("lists the weeks that touch a month", () => {
    expect(monthWeeks("2026-10")).toEqual([
      "2026-09-27",
      "2026-10-04",
      "2026-10-11",
      "2026-10-18",
      "2026-10-25",
    ]);
    // March 2026 starts on a Sunday and has 5 Sundays: exactly 5 weeks.
    expect(monthWeeks("2026-03")).toHaveLength(5);
  });

  it("numbers weeks by ISO 8601", () => {
    expect(isoWeekNumber("2026-10-04")).toBe(41);
    expect(isoWeekNumber("2025-12-28")).toBe(1);
    expect(isoWeekNumber("2026-12-27")).toBe(53);
  });

  it("labels week ranges", () => {
    expect(weekRangeLabel("2026-10-04")).toBe("4 – 10 ott");
    expect(weekRangeLabel("2026-09-27")).toBe("27 set – 3 ott");
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
  const task = (
    id: string,
    week: string,
    account: "main" | "secondary",
    position: string,
    track: "planned" | "actual" = "planned",
  ) => ({ id, title: id, notes: null, account, track, week, position, done: false }) as KdpTaskItem;
  const tasks = [
    task("b", "2026-10-05", "main", "a1"),
    task("a", "2026-10-05", "main", "a0"),
    task("c", "2026-10-05", "secondary", "a0"),
    task("d", "2026-10-12", "main", "a0"),
    task("e", "2026-10-05", "main", "a0", "actual"),
  ];

  it("filters by week, account and track and sorts by position", () => {
    expect(cellTasks(tasks, "2026-10-05", "main", "planned").map((t) => t.id)).toEqual(["a", "b"]);
    expect(cellTasks(tasks, "2026-10-05", "main", "actual").map((t) => t.id)).toEqual(["e"]);
  });
});

describe("laneLabel", () => {
  it("names the account and the track", () => {
    expect(laneLabel("secondary", "actual")).toBe("Ilaria · Reale");
  });
});
