import { describe, expect, it } from "vitest";

import { highlight, snippet } from "./search";

describe("highlight", () => {
  it("marks every case-insensitive occurrence", () => {
    expect(highlight("Treno e TRENO", "treno")).toEqual([
      { text: "Treno", match: true },
      { text: " e ", match: false },
      { text: "TRENO", match: true },
    ]);
  });

  it("returns the whole text when the query is empty or missing", () => {
    expect(highlight("abc", " ")).toEqual([{ text: "abc", match: false }]);
    expect(highlight("abc", "z")).toEqual([{ text: "abc", match: false }]);
  });
});

describe("snippet", () => {
  const text = `${"a ".repeat(100)}parola chiave${" b".repeat(100)}`;

  it("centers on the match with ellipses", () => {
    const result = snippet(text, "chiave", 10);
    expect(result.startsWith("…")).toBe(true);
    expect(result.endsWith("…")).toBe(true);
    expect(result).toContain("parola chiave");
  });

  it("falls back to the beginning without a match", () => {
    expect(snippet("riga uno\n\nriga due", "zzz")).toBe("riga uno riga due");
  });
});
