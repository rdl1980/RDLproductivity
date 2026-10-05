import { describe, expect, it } from "vitest";

import { newCardSummary } from "./board-state";
import {
  activeFilterCount,
  EMPTY_FILTERS,
  matchesFilters,
  NO_LABEL,
  parseFilters,
  writeFilters,
} from "./filters";

const now = new Date(2026, 9, 4, 12, 0);
const card = (patch: Partial<ReturnType<typeof newCardSummary>> = {}) => ({
  ...newCardSummary("c", "Card", "a0"),
  ...patch,
});

describe("URL round trip", () => {
  it("parses and writes filters without touching other params", () => {
    const params = new URLSearchParams("card=abc&labels=l1,l2&due=week&status=open");
    const filters = parseFilters(params);
    expect(filters).toEqual({ labels: ["l1", "l2"], due: "week", status: "open", priorities: [] });
    expect(activeFilterCount(filters)).toBe(4);
    expect(writeFilters(params, EMPTY_FILTERS).toString()).toBe("card=abc");
  });

  it("round-trips priorities and drops unknown ones", () => {
    const filters = parseFilters(new URLSearchParams("priority=0,none,9"));
    expect(filters.priorities).toEqual(["0", "none"]);
    expect(writeFilters(new URLSearchParams(), filters).toString()).toBe("priority=0%2Cnone");
  });

  it("ignores invalid values", () => {
    expect(parseFilters(new URLSearchParams("due=yesterday&status=maybe"))).toEqual(EMPTY_FILTERS);
  });
});

describe("matchesFilters", () => {
  it("filters by priority, including cards without one", () => {
    const filters = { ...EMPTY_FILTERS, priorities: ["0", "none"] };
    expect(matchesFilters(card({ priority: 0 }), filters, now)).toBe(true);
    expect(matchesFilters(card({ priority: null }), filters, now)).toBe(true);
    expect(matchesFilters(card({ priority: 1 }), filters, now)).toBe(false);
  });

  it("matches everything without filters", () => {
    expect(matchesFilters(card(), EMPTY_FILTERS, now)).toBe(true);
  });

  it("matches any selected label, or no label", () => {
    const filters = { ...EMPTY_FILTERS, labels: ["red", NO_LABEL] };
    expect(matchesFilters(card({ labelIds: ["red", "blue"] }), filters, now)).toBe(true);
    expect(matchesFilters(card({ labelIds: [] }), filters, now)).toBe(true);
    expect(matchesFilters(card({ labelIds: ["blue"] }), filters, now)).toBe(false);
  });

  it("filters by due date", () => {
    const at = (d: Date) => d.toISOString();
    const overdue = { ...EMPTY_FILTERS, due: "overdue" as const };
    expect(matchesFilters(card({ dueDate: at(new Date(2026, 9, 3)) }), overdue, now)).toBe(true);
    expect(
      matchesFilters(card({ dueDate: at(new Date(2026, 9, 3)), completed: true }), overdue, now),
    ).toBe(false);

    const today = { ...EMPTY_FILTERS, due: "today" as const };
    expect(matchesFilters(card({ dueDate: at(new Date(2026, 9, 4, 23, 30)) }), today, now)).toBe(
      true,
    );
    expect(matchesFilters(card({ dueDate: at(new Date(2026, 9, 5, 0, 30)) }), today, now)).toBe(
      false,
    );

    const week = { ...EMPTY_FILTERS, due: "week" as const };
    expect(matchesFilters(card({ dueDate: at(new Date(2026, 9, 10)) }), week, now)).toBe(true);
    expect(matchesFilters(card({ dueDate: at(new Date(2026, 9, 20)) }), week, now)).toBe(false);

    const none = { ...EMPTY_FILTERS, due: "none" as const };
    expect(matchesFilters(card(), none, now)).toBe(true);
    expect(matchesFilters(card({ dueDate: at(now) }), none, now)).toBe(false);
  });

  it("filters by completion", () => {
    expect(
      matchesFilters(card({ completed: true }), { ...EMPTY_FILTERS, status: "done" }, now),
    ).toBe(true);
    expect(matchesFilters(card(), { ...EMPTY_FILTERS, status: "done" }, now)).toBe(false);
    expect(
      matchesFilters(card({ completed: true }), { ...EMPTY_FILTERS, status: "open" }, now),
    ).toBe(false);
  });
});
