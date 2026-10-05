import type { CardItem, LabelItem } from "./board-state";

/** A card shown outside its board (super board, today view), with its context. */
export type AggregateCard = CardItem & {
  board: { id: string; title: string; color: string | null };
  list: { id: string; title: string };
  labels: LabelItem[];
};
