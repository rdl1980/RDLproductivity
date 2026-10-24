import "server-only";

import type { KdpAccount } from "@/lib/kdp";
import {
  type KdpBookFormat,
  type KdpBookItem,
  type KdpBookLinkItem,
  storedFormatsSchema,
} from "@/lib/kdp-books";
import { db } from "@/server/db";

const linkSelect = {
  id: true,
  status: true,
  auto: true,
  score: true,
  card: {
    select: {
      id: true,
      title: true,
      list: { select: { title: true, board: { select: { id: true, title: true } } } },
    },
  },
} as const;

type LinkRow = {
  id: string;
  status: string;
  auto: boolean;
  score: number;
  card: {
    id: string;
    title: string;
    list: { title: string; board: { id: string; title: string } };
  };
};

function toLinkItem(link: LinkRow): KdpBookLinkItem {
  return {
    id: link.id,
    status: link.status as KdpBookLinkItem["status"],
    auto: link.auto,
    score: link.score,
    card: {
      id: link.card.id,
      title: link.card.title,
      boardId: link.card.list.board.id,
      boardTitle: link.card.list.board.title,
      listTitle: link.card.list.title,
    },
  };
}

export function parseFormats(value: unknown): KdpBookFormat[] {
  const parsed = storedFormatsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

/** All imported books with their confirmed and suggested links (archived cards excluded). */
export async function getKdpBooks(): Promise<KdpBookItem[]> {
  const books = await db.kdpBook.findMany({
    orderBy: [{ account: "asc" }, { title: "asc" }],
    include: {
      links: {
        where: { status: { in: ["confirmed", "suggested"] }, card: { archived: false } },
        orderBy: [{ status: "asc" }, { score: "desc" }],
        select: linkSelect,
      },
    },
  });
  return books.map((book) => ({
    id: book.id,
    account: book.account as KdpAccount,
    kdpId: book.kdpId,
    title: book.title,
    series: book.series,
    formats: parseFormats(book.formats),
    missingSince: book.missingSince?.toISOString() ?? null,
    importedAt: book.importedAt.toISOString(),
    volume: book.volume,
    links: book.links.map(toLinkItem),
  }));
}

export type CardKdpBook = {
  linkId: string;
  status: "confirmed" | "suggested";
  auto: boolean;
  book: { id: string; account: KdpAccount; title: string; formats: KdpBookFormat[] };
};

/** Books linked (or suggested) for one card. */
export async function getCardKdpBooks(cardId: string): Promise<CardKdpBook[]> {
  const links = await db.kdpBookLink.findMany({
    where: { cardId, status: { in: ["confirmed", "suggested"] } },
    orderBy: [{ status: "asc" }, { score: "desc" }],
    select: {
      id: true,
      status: true,
      auto: true,
      book: { select: { id: true, account: true, title: true, formats: true } },
    },
  });
  return links.map((link) => ({
    linkId: link.id,
    status: link.status as CardKdpBook["status"],
    auto: link.auto,
    book: {
      id: link.book.id,
      account: link.book.account as KdpAccount,
      title: link.book.title,
      formats: parseFormats(link.book.formats),
    },
  }));
}
