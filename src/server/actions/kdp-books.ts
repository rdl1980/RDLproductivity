"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { accountLabel, KDP_ACCOUNT_VALUES } from "@/lib/kdp";
import {
  cleanSeries,
  importPayloadSchema,
  type MatchBook,
  proposeLinks,
  toStoredFormats,
} from "@/lib/kdp-books";
import { logActivity, q } from "@/server/activity";
import { db, Prisma } from "@/server/db";
import { parseFormats } from "@/server/queries/kdp-books";
import { searchCards } from "@/server/queries/search";
import { isAuthenticated } from "@/server/session";

import { type ActionResult, fail, idSchema, ok, parse, UNAUTHORIZED } from "./result";

const PATH = "/kdp/libri";

export type SuggestionStats = { confirmed: number; suggested: number };

/**
 * Recomputes the proposed card-book links: pending suggestions are replaced,
 * confirmed and rejected pairs are kept and never proposed again. Certain
 * matches (exact title, compatible market, single candidate) are confirmed.
 */
async function refreshSuggestions(): Promise<SuggestionStats> {
  const [cards, books, decided] = await Promise.all([
    db.card.findMany({
      where: { archived: false, list: { archived: false, board: { archived: false } } },
      select: { id: true, title: true },
    }),
    db.kdpBook.findMany({
      where: { missingSince: null },
      select: { id: true, title: true, formats: true },
    }),
    db.kdpBookLink.findMany({
      where: { status: { in: ["confirmed", "rejected"] } },
      select: { bookId: true, cardId: true },
    }),
  ]);
  const matchBooks: MatchBook[] = books.map((book) => ({
    id: book.id,
    title: book.title,
    markets: [...new Set(parseFormats(book.formats).flatMap((f) => (f.market ? [f.market] : [])))],
  }));
  const skip = new Set(decided.map((link) => `${link.bookId}:${link.cardId}`));
  const proposals = proposeLinks(cards, matchBooks, skip);

  await db.$transaction([
    db.kdpBookLink.deleteMany({ where: { status: "suggested" } }),
    db.kdpBookLink.createMany({
      data: proposals.map((p) => ({
        bookId: p.bookId,
        cardId: p.cardId,
        score: p.score,
        status: p.certain ? "confirmed" : "suggested",
        auto: p.certain,
      })),
    }),
  ]);
  const confirmed = proposals.filter((p) => p.certain).length;
  return { confirmed, suggested: proposals.length - confirmed };
}

const importSchema = z.object({
  account: z.enum(KDP_ACCOUNT_VALUES),
  payload: importPayloadSchema,
});

export type ImportResult = {
  created: number;
  updated: number;
  missing: number;
  asins: number;
} & SuggestionStats;

/** Saves the books of one account's Bookshelf, then refreshes the suggestions. */
export async function importKdpBooks(
  input: z.input<typeof importSchema>,
): Promise<ActionResult<ImportResult>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(importSchema, input);
  if (!data) return fail(error);

  const { account, payload } = data;
  const importedAt = new Date();
  const kdpIds = payload.books.map((book) => book.kdpId);
  const existing = new Set(
    (
      await db.kdpBook.findMany({
        where: { account, kdpId: { in: kdpIds } },
        select: { kdpId: true },
      })
    ).map((book) => book.kdpId),
  );

  let asins = 0;
  const missing = await db.$transaction(
    async (tx) => {
      for (const book of payload.books) {
        const formats = toStoredFormats(book.formats, book.title);
        asins += formats.filter((f) => f.asin).length;
        const fields = {
          title: book.title,
          series: cleanSeries(book.series),
          formats: formats as Prisma.InputJsonValue,
          missingSince: null,
          importedAt,
        };
        await tx.kdpBook.upsert({
          where: { account_kdpId: { account, kdpId: book.kdpId } },
          create: { account, kdpId: book.kdpId, ...fields },
          update: fields,
        });
      }
      const { count } = await tx.kdpBook.updateMany({
        where: { account, kdpId: { notIn: kdpIds }, missingSince: null },
        data: { missingSince: importedAt },
      });
      return count;
    },
    { timeout: 60_000 },
  );

  const stats = await refreshSuggestions();
  const created = payload.books.filter((book) => !existing.has(book.kdpId)).length;
  const updated = payload.books.length - created;
  await logActivity({
    kind: "kdp.import",
    summary:
      `Importati ${payload.books.length} libri KDP (${accountLabel(account)}): ` +
      `${created} nuovi, ${updated} aggiornati` +
      (missing ? `, ${missing} non più presenti` : "") +
      `; ${stats.confirmed} collegamenti automatici, ${stats.suggested} da confermare`,
    entityIds: [],
  });
  revalidatePath(PATH);
  return ok({ created, updated, missing, asins, ...stats });
}

export async function refreshKdpSuggestions(): Promise<ActionResult<SuggestionStats>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const stats = await refreshSuggestions();
  revalidatePath(PATH);
  return ok(stats);
}

const linkSchema = z.object({
  bookId: idSchema,
  cardId: idSchema,
  /** "confirmed" links the card (also manually), "rejected" unlinks it for good. */
  status: z.enum(["confirmed", "rejected"]),
});

export async function setKdpBookLink(input: z.input<typeof linkSchema>): Promise<ActionResult> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(linkSchema, input);
  if (!data) return fail(error);

  const { bookId, cardId, status } = data;
  const [book, card, previous] = await Promise.all([
    db.kdpBook.findUnique({ where: { id: bookId }, select: { title: true } }),
    db.card.findUnique({
      where: { id: cardId },
      select: { title: true, list: { select: { boardId: true } } },
    }),
    db.kdpBookLink.findUnique({
      where: { bookId_cardId: { bookId, cardId } },
      select: { status: true, auto: true, score: true },
    }),
  ]);
  if (!book) return fail("Libro non trovato.");
  if (!card) return fail("Card non trovata.");
  if (previous?.status === status) return ok(undefined);

  await db.kdpBookLink.upsert({
    where: { bookId_cardId: { bookId, cardId } },
    create: { bookId, cardId, status, auto: false, score: previous?.score ?? 0 },
    update: { status, auto: false },
  });
  const title = q(book.title.split(/:\s/)[0]);
  await logActivity({
    kind: "kdp.link",
    summary:
      status === "confirmed"
        ? `Libro KDP ${title} collegato alla card ${q(card.title)}`
        : previous?.status === "confirmed"
          ? `Libro KDP ${title} scollegato dalla card ${q(card.title)}`
          : `Suggerimento ${title} scartato per la card ${q(card.title)}`,
    boardId: card.list.boardId,
    cardId,
    // The link itself, so later edits of the card do not block the undo.
    entityIds: [`kdpLink:${bookId}:${cardId}`],
    undo: [{ op: "kdpLink", bookId, cardId, previous }],
  });
  revalidatePath(PATH);
  return ok(undefined);
}

export type LinkableCard = {
  id: string;
  title: string;
  boardId: string;
  boardTitle: string;
  listTitle: string;
};

/** Cards to link manually to a book, by title or description. */
export async function findLinkableCards(query: string): Promise<ActionResult<LinkableCard[]>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data: text, error } = parse(z.string().max(200), query);
  if (error !== null) return fail(error);
  const cards = await searchCards(text);
  return ok(
    cards.slice(0, 20).map((card) => ({
      id: card.id,
      title: card.title,
      boardId: card.list.board.id,
      boardTitle: card.list.board.title,
      listTitle: card.list.title,
    })),
  );
}
