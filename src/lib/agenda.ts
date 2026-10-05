import type { AggregateCard } from "./aggregate";
import { priorityRank } from "./priority";

export type AgendaSection = "overdue" | "today" | "week";

export const AGENDA_SECTIONS: { key: AgendaSection; title: string; empty: string }[] = [
  { key: "overdue", title: "Scadute", empty: "Niente di scaduto." },
  { key: "today", title: "Oggi", empty: "Nessuna scadenza oggi." },
  { key: "week", title: "Prossimi 7 giorni", empty: "Nessuna scadenza nei prossimi 7 giorni." },
];

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/**
 * Section of a card in the local time zone: overdue before today (open cards
 * only), today, or the next 7 days (open cards only). Null when out of range.
 */
export function agendaSection(card: AggregateCard, now: Date): AgendaSection | null {
  if (!card.dueDate) return null;
  const due = new Date(card.dueDate);
  const today = startOfDay(now);
  if (due < today) return card.completed ? null : "overdue";
  if (due < addDays(today, 1)) return "today";
  if (due < addDays(today, 8)) return card.completed ? null : "week";
  return null;
}

/** Groups cards by section, each sorted by due date then priority. */
export function groupAgenda(cards: AggregateCard[], now: Date) {
  const groups: Record<AgendaSection, AggregateCard[]> = { overdue: [], today: [], week: [] };
  for (const card of cards) {
    const section = agendaSection(card, now);
    if (section) groups[section].push(card);
  }
  for (const list of Object.values(groups)) {
    list.sort(
      (a, b) =>
        a.dueDate!.localeCompare(b.dueDate!) || priorityRank(a.priority) - priorityRank(b.priority),
    );
  }
  return groups;
}
