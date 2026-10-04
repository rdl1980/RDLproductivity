import type { CardItem, ListItem } from "@/lib/board-state";

/** Board mutations passed to lists and cards; the object identity is stable. */
export type BoardActions = {
  openCard: (card: CardItem) => void;
  setComposer: (listId: string, open: boolean) => void;
  hoverList: (listId: string) => void;
  renameList: (list: ListItem, title: string) => void;
  archiveList: (list: ListItem) => void;
  addCard: (listId: string, title: string) => void;
  renameCard: (card: CardItem, title: string) => void;
  archiveCard: (listId: string, card: CardItem) => void;
};
