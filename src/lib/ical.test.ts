import { describe, expect, it } from "vitest";

import { buildCalendar, escapeText, foldLine, formatUtc } from "./ical";

describe("ical", () => {
  it("escapes text values", () => {
    expect(escapeText("a;b,c\\d\nnext")).toBe("a\;b\\,c\\\\d\\nnext");
  });

  it("formats UTC date-times", () => {
    expect(formatUtc(new Date("2026-10-05T09:30:00.000Z"))).toBe("20261005T093000Z");
  });

  it("folds long lines at 75 octets without splitting characters", () => {
    const line = `SUMMARY:${"è".repeat(60)}`;
    const folded = foldLine(line).split("\r\n");
    expect(folded.length).toBeGreaterThan(1);
    for (const part of folded)
      expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.map((part, i) => (i === 0 ? part : part.slice(1))).join("")).toBe(line);
  });

  it("builds a calendar with one event per card", () => {
    const ics = buildCalendar(
      "Scadenze",
      [
        {
          uid: "c1@rdl",
          summary: "[P0] Consegna",
          description: "Board · Lista",
          url: "https://x.app/boards/b?card=c1",
          start: new Date("2026-10-05T09:00:00Z"),
          end: new Date("2026-10-05T09:30:00Z"),
          updated: new Date("2026-10-01T00:00:00Z"),
        },
      ],
      new Date("2026-10-05T00:00:00Z"),
    );
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("UID:c1@rdl\r\n");
    expect(ics).toContain("DTSTART:20261005T090000Z\r\n");
    expect(ics).toContain("SUMMARY:[P0] Consegna\r\n");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});
