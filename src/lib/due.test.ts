import { describe, expect, it } from "vitest";

import { combineDateAndTime, dueStatus, formatDue, toTimeInput } from "./due";

const now = new Date("2026-10-04T12:00:00Z");

describe("dueStatus", () => {
  it("handles missing and completed dates", () => {
    expect(dueStatus(null, false, now)).toBe("none");
    expect(dueStatus("2026-01-01T00:00:00Z", true, now)).toBe("completed");
  });

  it("classifies by distance from now", () => {
    expect(dueStatus("2026-10-04T11:59:00Z", false, now)).toBe("overdue");
    expect(dueStatus("2026-10-05T11:00:00Z", false, now)).toBe("soon");
    expect(dueStatus("2026-10-06T12:00:00Z", false, now)).toBe("upcoming");
  });
});

describe("formatDue", () => {
  it("omits midnight and the current year", () => {
    expect(formatDue("2026-10-04T00:00:00Z", now, "UTC")).toBe("4 ott");
    expect(formatDue("2026-10-04T18:30:00Z", now, "UTC")).toBe("4 ott, 18:30");
  });

  it("shows the year when different and respects the time zone", () => {
    expect(formatDue("2027-01-15T00:00:00Z", now, "UTC")).toBe("15 gen 2027");
    expect(formatDue("2026-10-04T22:30:00Z", now, "Europe/Rome")).toBe("5 ott, 00:30");
  });
});

describe("combineDateAndTime", () => {
  it("keeps the day and applies the local time", () => {
    const result = combineDateAndTime(new Date(2026, 9, 4, 8, 15), "18:45");
    expect([result.getFullYear(), result.getMonth(), result.getDate()]).toEqual([2026, 9, 4]);
    expect(toTimeInput(result)).toBe("18:45");
  });
});
