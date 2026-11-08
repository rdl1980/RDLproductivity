import { describe, expect, it } from "vitest";

import { parseBotMessage } from "./telegram-commands";

describe("parseBotMessage", () => {
  it("reads the commands, with or without the bot name", () => {
    expect(parseBotMessage("/oggi")).toEqual({ kind: "today" });
    expect(parseBotMessage("/vendite@robotti_bot")).toEqual({ kind: "sales" });
    expect(parseBotMessage("/fatto EP001 grazie")).toEqual({ kind: "done", code: "ep001" });
    expect(parseBotMessage("/start")).toEqual({ kind: "help" });
    expect(parseBotMessage("/boh")).toEqual({ kind: "unknown", command: "boh" });
  });

  it("turns plain text into a card: first line title, the rest description", () => {
    expect(parseBotMessage("Idea copertina\nsfondo blu\ncon gatto")).toEqual({
      kind: "capture",
      title: "Idea copertina",
      description: "sfondo blu\ncon gatto",
    });
    expect(parseBotMessage("  solo titolo ")).toEqual({
      kind: "capture",
      title: "solo titolo",
      description: null,
    });
    expect(parseBotMessage("   ")).toBeNull();
  });

  it("keeps a long first line whole in the description", () => {
    const long = "x".repeat(250);
    const r = parseBotMessage(long);
    expect(r?.kind).toBe("capture");
    if (r?.kind !== "capture") return;
    expect(r.title.length).toBe(198);
    expect(r.description).toBe(long);
  });
});
