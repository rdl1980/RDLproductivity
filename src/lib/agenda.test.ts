import { describe, expect, it } from "vitest";

import type { AggregateCard } from "./aggregate";
import { agendaSection, groupAgenda } from "./agenda";
import { newCardSummary } from "./board-state";

const now = new Date(2026, 9, 5, 15, 0);
const at = (days: number, hours = 9) => new Date(2026, 9, 5 + days, hours).toISOString();
function card(id: string, dueDate: string | null, patch: Partial<AggregateCard> = {}) {
  return {
    ...newCardSummary(id, id, "a0"),
    dueDate,
    board: { id: "b", title: "B", color: null },
    list: { id: "l", title: "L" },
    labels: [],
    ...patch,
  } satisfies AggregateCard;
}

describe("agenda", () => {
  it("classifies by local day", () => {
    expect(agendaSection(card("a", at(-1)), now)).toBe("overdue");
    expect(agendaSection(card("b", at(0, 9)), now)).toBe("today");
    expect(agendaSection(card("c", at(0, 23)), now)).toBe("today");
    expect(agendaSection(card("d", at(7)), now)).toBe("week");
    expect(agendaSection(card("e", at(8)), now)).toBeNull();
    expect(agendaSection(card("f", null), now)).toBeNull();
  });

  it("keeps completed cards only for today", () => {
    expect(agendaSection(card("a", at(-1), { completed: true }), now)).toBeNull();
    expect(agendaSection(card("b", at(0), { completed: true }), now)).toBe("today");
    expect(agendaSection(card("c", at(2), { completed: true }), now)).toBeNull();
  });

  it("sorts by due date, then priority", () => {
    const groups = groupAgenda(
      [
        card("later", at(0, 18)),
        card("p3", at(0, 9), { priority: 3 }),
        card("p0", at(0, 9), { priority: 0 }),
      ],
      now,
    );
    expect(groups.today.map((c) => c.id)).toEqual(["p0", "p3", "later"]);
  });
});
