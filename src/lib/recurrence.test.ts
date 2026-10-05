import { describe, expect, it } from "vitest";

import { describeRecurrence, nextOccurrence, parseRecurrence, type Recurrence } from "./recurrence";

const rome = (rule: Recurrence["rule"], interval = 1): Recurrence => ({
  rule,
  interval,
  timeZone: "Europe/Rome",
});
const past = new Date("2000-01-01T00:00:00Z");

describe("nextOccurrence", () => {
  it("keeps the local time across the end of DST", () => {
    // Sat 24 Oct 2026 09:00 in Rome (UTC+2) -> Sun 25 Oct 09:00 (UTC+1).
    const next = nextOccurrence(new Date("2026-10-24T07:00:00Z"), rome("daily"), past);
    expect(next.toISOString()).toBe("2026-10-25T08:00:00.000Z");
  });

  it("skips weekends for weekdays", () => {
    // Fri 9 Oct 2026 -> Mon 12 Oct.
    const next = nextOccurrence(new Date("2026-10-09T07:00:00Z"), rome("weekdays"), past);
    expect(next.toISOString()).toBe("2026-10-12T07:00:00.000Z");
  });

  it("handles weekly intervals and month ends", () => {
    expect(
      nextOccurrence(new Date("2026-10-05T07:00:00Z"), rome("weekly", 2), past).toISOString(),
    ).toBe("2026-10-19T07:00:00.000Z");
    // 31 Jan + 1 month -> 28 Feb (local midday keeps the date stable).
    expect(
      nextOccurrence(new Date("2027-01-31T11:00:00Z"), rome("monthly"), past).toISOString(),
    ).toBe("2027-02-28T11:00:00.000Z");
    expect(
      nextOccurrence(new Date("2028-02-29T11:00:00Z"), rome("yearly"), past).toISOString(),
    ).toBe("2029-02-28T11:00:00.000Z");
  });

  it("skips occurrences already in the past", () => {
    const now = new Date("2026-10-05T12:00:00Z");
    // Daily at 09:00 Rome, last due a week ago -> tomorrow 09:00.
    const next = nextOccurrence(new Date("2026-09-28T07:00:00Z"), rome("daily"), now);
    expect(next.toISOString()).toBe("2026-10-06T07:00:00.000Z");
  });
});

describe("recurrence helpers", () => {
  it("describes and validates rules", () => {
    expect(describeRecurrence(rome("weekly"))).toBe("Ogni settimana");
    expect(describeRecurrence(rome("daily", 3))).toBe("Ogni 3 giorni");
    expect(parseRecurrence({ rule: "hourly", interval: 1, timeZone: "UTC" })).toBeNull();
    expect(parseRecurrence(null)).toBeNull();
  });
});
