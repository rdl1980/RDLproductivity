import { describe, expect, it } from "vitest";

import { describeTemplate, labelKey } from "./templates";

describe("templates", () => {
  it("describes board and card templates", () => {
    const board = {
      color: "#0079bf",
      labels: [{ name: "Urgente", color: "#c9372c" }],
      lists: [
        {
          title: "Da fare",
          cards: [{ title: "A", description: null, priority: null, labels: [], checklists: [] }],
        },
        { title: "Fatto", cards: [] },
      ],
    };
    expect(describeTemplate("board", board)).toBe("2 liste · 1 card · 1 etichetta");
    const card = {
      title: "Rilascio",
      description: null,
      priority: 1,
      labels: [],
      checklists: [{ title: "Passi", items: ["Build", "Deploy"] }],
    };
    expect(describeTemplate("card", card)).toBe("1 checklist · 2 elementi · 0 etichette");
    expect(describeTemplate("card", { nope: true })).toBe("Template non valido");
  });

  it("matches labels by name and color, case-insensitively", () => {
    expect(labelKey({ name: " Urgente ", color: "#C9372C" })).toBe(
      labelKey({ name: "urgente", color: "#c9372c" }),
    );
  });
});
