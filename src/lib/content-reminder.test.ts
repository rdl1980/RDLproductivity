import { describe, expect, it } from "vitest";

import type { TodoItem } from "./content";
import { hourIn, reminderDue, reminderItems, reminderMessage } from "./content-reminder";

const item = (date: string, text: string): TodoItem => ({
  kind: "metrics",
  code: "ep001",
  platform: null,
  date,
  text,
});

describe("hourIn", () => {
  it("follows daylight saving time in Rome", () => {
    expect(hourIn(new Date("2026-07-01T09:00:00Z"))).toBe(11);
    expect(hourIn(new Date("2026-12-01T10:00:00Z"))).toBe(11);
  });
});

describe("reminderDue", () => {
  const today = "2026-12-01";
  it("waits for 11:00 Rome", () => {
    expect(reminderDue(new Date("2026-12-01T09:59:00Z"), today, null)).toBe(false);
    expect(reminderDue(new Date("2026-12-01T10:00:00Z"), today, null)).toBe(true);
  });
  it("catches up later in the day, once", () => {
    expect(reminderDue(new Date("2026-12-01T15:00:00Z"), today, "2026-11-30")).toBe(true);
    expect(reminderDue(new Date("2026-12-01T15:00:00Z"), today, today)).toBe(false);
  });
});

describe("reminderItems", () => {
  it("keeps today and overdue, oldest first, and drops the future", () => {
    const open = [
      item("2026-12-01", "oggi"),
      item("2026-12-03", "futuro"),
      item("2026-11-20", "vecchio"),
    ];
    expect(reminderItems(open, "2026-12-01").map((i) => i.text)).toEqual(["vecchio", "oggi"]);
  });
});

describe("reminderMessage", () => {
  it("splits today and overdue and escapes HTML", () => {
    const text = reminderMessage(
      [item("2026-11-20", "Numeri <da> rilevare"), item("2026-12-01", "Slot vuoto & co")],
      "2026-12-01",
      "https://example.com/robotti/da-fare",
    );
    expect(text).toContain("2 da fare");
    expect(text).toContain("<b>Oggi</b>\n• Slot vuoto &amp; co");
    expect(text).toContain("<b>Arretrati</b>\n• 20/11 Numeri &lt;da&gt; rilevare");
    expect(text).toContain('<a href="https://example.com/robotti/da-fare">');
  });
  it("stays under the Telegram limit", () => {
    const many = Array.from({ length: 500 }, (_, i) => item("2026-11-20", `Voce ${i} `.repeat(5)));
    const text = reminderMessage(many, "2026-12-01", "https://example.com");
    expect(text.length).toBeLessThan(4096);
    expect(text).toContain("…");
    expect(text.trim().endsWith("</a>")).toBe(true);
  });
});
