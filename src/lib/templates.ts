import { z } from "zod";

const labelSchema = z.object({ name: z.string().max(50), color: z.string().max(20) });

export const cardTemplateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(20_000).nullable(),
  priority: z.number().int().min(0).max(4).nullable(),
  /** Matched on the target board by name and color, created when missing. */
  labels: z.array(labelSchema).max(50),
  checklists: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        items: z.array(z.string().min(1).max(500)).max(200),
      }),
    )
    .max(50),
});

export const boardTemplateSchema = z.object({
  color: z.string().max(20),
  labels: z.array(labelSchema).max(100),
  lists: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        cards: z.array(cardTemplateSchema).max(500),
      }),
    )
    .max(100),
});

export type CardTemplate = z.infer<typeof cardTemplateSchema>;
export type BoardTemplate = z.infer<typeof boardTemplateSchema>;
export type TemplateKind = "board" | "card";

export type TemplateSummary = {
  id: string;
  kind: TemplateKind;
  name: string;
  /** e.g. "3 liste · 12 card" or "2 checklist". */
  detail: string;
};

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function describeTemplate(kind: TemplateKind, data: unknown): string {
  if (kind === "board") {
    const board = boardTemplateSchema.safeParse(data);
    if (!board.success) return "Template non valido";
    const cards = board.data.lists.reduce((sum, list) => sum + list.cards.length, 0);
    return [
      plural(board.data.lists.length, "lista", "liste"),
      plural(cards, "card", "card"),
      plural(board.data.labels.length, "etichetta", "etichette"),
    ].join(" · ");
  }
  const card = cardTemplateSchema.safeParse(data);
  if (!card.success) return "Template non valido";
  const items = card.data.checklists.reduce((sum, c) => sum + c.items.length, 0);
  return [
    plural(card.data.checklists.length, "checklist", "checklist"),
    plural(items, "elemento", "elementi"),
    plural(card.data.labels.length, "etichetta", "etichette"),
  ].join(" · ");
}

/** Label identity across boards. */
export function labelKey(label: { name: string; color: string }) {
  return `${label.name.trim().toLocaleLowerCase("it")}|${label.color.toLowerCase()}`;
}
