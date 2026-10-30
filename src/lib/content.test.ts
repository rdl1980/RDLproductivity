import { describe, expect, it } from "vitest";

import {
  cycleWeekOf,
  DEFAULT_PLAN,
  defaultLayers,
  effectiveStatus,
  emptySlots,
  isoInZone,
  isoWeekday,
  mondayOf,
  plannedSlots,
  publishTexts,
  textOn,
  todoItems,
  type TodoPiece,
  voteTotals,
  zonedInstant,
} from "./content";

describe("dates", () => {
  it("runs weeks Monday to Sunday", () => {
    expect(mondayOf("2026-11-08")).toBe("2026-11-02");
    expect(mondayOf("2026-11-02")).toBe("2026-11-02");
    expect(isoWeekday("2026-11-02")).toBe(1);
    expect(isoWeekday("2026-11-08")).toBe(7);
  });

  it("cycles A, B, C, D from the week of 2 November 2026", () => {
    expect(cycleWeekOf("2026-11-02")).toBe("A");
    expect(cycleWeekOf("2026-11-08")).toBe("A");
    expect(cycleWeekOf("2026-11-09")).toBe("B");
    expect(cycleWeekOf("2026-11-23")).toBe("D");
    expect(cycleWeekOf("2026-11-30")).toBe("A");
    expect(cycleWeekOf("2026-10-30")).toBe("D");
  });

  it("writes Rome date-times with their offset", () => {
    expect(isoInZone(new Date("2026-11-02T18:00:00Z"))).toBe("2026-11-02T19:00:00+01:00");
    expect(isoInZone(new Date("2026-07-01T11:00:00Z"))).toBe("2026-07-01T13:00:00+02:00");
  });

  it("places a slot in Rome time across daylight saving", () => {
    expect(zonedInstant("2026-11-02", "19:00").toISOString()).toBe("2026-11-02T18:00:00.000Z");
    expect(zonedInstant("2026-07-01", "13:00").toISOString()).toBe("2026-07-01T11:00:00.000Z");
    expect(zonedInstant("2026-10-25", "19:00").toISOString()).toBe("2026-10-25T18:00:00.000Z");
  });
});

describe("layers and status", () => {
  it("picks the default layers from rubric and slot", () => {
    expect(defaultLayers("il-trono", "19:00").map((l) => l.platform)).toEqual([
      "tiktok",
      "youtube",
      "instagram",
    ]);
    expect(defaultLayers("pov", "13:00").map((l) => l.platform)).toEqual(["tiktok", "youtube"]);
    expect(defaultLayers("compilation", "19:00")).toEqual([
      { platform: "youtube", details: { kind: "Video lungo" } },
    ]);
    expect(defaultLayers("carosello", "19:00")).toEqual([
      { platform: "instagram", details: { kind: "Carosello" } },
    ]);
  });

  it("derives programmato and pubblicato from the active layers", () => {
    expect(effectiveStatus("pronto", ["pronto", "pronto"])).toEqual({
      status: "pronto",
      partial: false,
    });
    expect(effectiveStatus("pronto", ["programmato", "pubblicato"])).toEqual({
      status: "programmato",
      partial: true,
    });
    expect(effectiveStatus("pronto", ["pubblicato", "pubblicato"])).toEqual({
      status: "pubblicato",
      partial: false,
    });
    expect(effectiveStatus("pronto", ["pubblicato", "pronto"])).toEqual({
      status: "pronto",
      partial: true,
    });
    expect(effectiveStatus("scartato", ["pubblicato"])).toEqual({
      status: "scartato",
      partial: false,
    });
  });

  it("totals the votes of every platform", () => {
    expect(
      voteTotals(
        ["PAIRING", "RESET"],
        [{ votes: { PAIRING: 10, RESET: 3 } }, { votes: { RESET: 5 } }],
      ),
    ).toEqual([
      { option: "PAIRING", count: 10 },
      { option: "RESET", count: 8 },
    ]);
  });

  it("lists the texts to copy of a layer", () => {
    expect(publishTexts("youtube", { title: "T", description: "" }, "Vota!")).toEqual([
      { label: "Titolo", value: "T" },
      { label: "Commento fissato", value: "Vota!" },
    ]);
    expect(publishTexts("tiktok", { caption: "Ciao #tag" }, null)).toEqual([
      { label: "Didascalia", value: "Ciao #tag" },
    ]);
  });

  it("picks a readable text color", () => {
    expect(textOn("#12051F")).toBe("#FFFFFF");
    expect(textOn("#FFC83D")).toBe("#000000");
    expect(textOn("#FF5FA2")).toBe("#000000");
    expect(textOn("#7B3FE4")).toBe("#FFFFFF");
  });
});

describe("weekly plan", () => {
  it("generates the slots of the first weeks with rotation and activation dates", () => {
    const week1 = plannedSlots(DEFAULT_PLAN, "2026-11-02", "2026-11-08");
    // No 13:00 slots before 16 November.
    expect(week1.some((s) => s.slot === "13:00")).toBe(false);
    expect(week1.find((s) => s.date === "2026-11-05")?.rubric).toBe("recensioni-a-una-stella");
    expect(week1.filter((s) => s.date === "2026-11-07").map((s) => s.rubric)).toEqual([
      "consigli-di-gemma",
    ]);
    expect(week1.filter((s) => s.date === "2026-11-08").map((s) => s.rubric)).toEqual([
      "compilation",
      "carosello",
    ]);
    const week2 = plannedSlots(DEFAULT_PLAN, "2026-11-09", "2026-11-15");
    expect(week2.find((s) => s.date === "2026-11-12")?.rubric).toBe("tg-delle-macchine");
    expect(week2.find((s) => s.date === "2026-11-14")?.rubric).toBe("trono-obsoleto");
    const week3 = plannedSlots(DEFAULT_PLAN, "2026-11-16", "2026-11-22");
    expect(week3.filter((s) => s.slot === "13:00")).toHaveLength(6);
    expect(week3.find((s) => s.date === "2026-11-19" && s.slot === "19:00")?.rubric).toBe(
      "galateo-per-umani",
    );
    expect(plannedSlots(DEFAULT_PLAN, "2026-10-26", "2026-11-01")).toEqual([]);
  });

  it("hides the slots a piece fills, matching the rubric first", () => {
    const planned = plannedSlots(DEFAULT_PLAN, "2026-11-08", "2026-11-08");
    const piece = (rubric: string, extra = {}) => ({
      date: "2026-11-08",
      slot: "19:00" as const,
      rubric,
      status: "pronto",
      archived: false,
      ...extra,
    });
    expect(emptySlots(planned, [piece("carosello")]).map((s) => s.rubric)).toEqual(["compilation"]);
    expect(emptySlots(planned, [piece("speciale")]).map((s) => s.rubric)).toEqual(["carosello"]);
    expect(emptySlots(planned, [piece("compilation"), piece("carosello")])).toEqual([]);
    expect(
      emptySlots(planned, [piece("compilation", { status: "scartato" }), piece("carosello")]).map(
        (s) => s.rubric,
      ),
    ).toEqual(["compilation"]);
  });
});

describe("to do", () => {
  const now = new Date("2026-11-05T10:00:00Z");
  const piece = (overrides: Partial<TodoPiece>): TodoPiece => ({
    code: "ep001",
    title: "Il Trono ep. 1",
    date: "2026-11-02",
    question: null,
    voteResult: null,
    voteCloses: null,
    archived: false,
    status: "pronto",
    layers: [],
    ...overrides,
  });
  const layer = (overrides: Partial<TodoPiece["layers"][number]>) => ({
    platform: "tiktok" as const,
    active: true,
    publishStatus: "pubblicato" as const,
    plannedAt: "2026-11-02T18:00:00Z",
    publishedAt: "2026-11-02T18:00:00Z",
    pinnedComment: null,
    pinnedCommentDone: false,
    metrics: 0,
    ...overrides,
  });

  it("collects what needs an action", () => {
    const items = todoItems(
      [
        piece({
          question: "PAIRING o RESET?",
          voteCloses: "2026-11-04",
          layers: [layer({ pinnedComment: "Vota!" })],
        }),
        piece({
          code: "caf002",
          title: "Cafoni Umani",
          date: "2026-11-07",
          layers: [layer({ publishStatus: "pronto", plannedAt: "2026-11-07T18:00:00Z" })],
        }),
        piece({ code: "old", archived: true, layers: [layer({ pinnedComment: "x" })] }),
      ],
      [{ date: "2026-11-09", slot: "19:00", rubric: "il-trono" }],
      now,
      () => "Il Trono",
    );
    expect(items.map((i) => i.kind)).toEqual(["pin", "metrics", "vote", "schedule", "slot"]);
    expect(items.at(-1)?.text).toBe("Slot vuoto: Il Trono (19:00)");
  });
});
