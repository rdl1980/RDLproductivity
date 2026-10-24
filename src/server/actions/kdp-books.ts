"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { accountLabel, KDP_ACCOUNT_VALUES, type KdpAccount } from "@/lib/kdp";
import { type AccountMatches, accountMismatch, likelyAccount } from "@/lib/kdp-accounts";
import {
  cleanSeries,
  importPayloadSchema,
  type MatchBook,
  proposeLinks,
  statusTransitions,
  toStoredFormats,
} from "@/lib/kdp-books";
import { logActivity, q } from "@/server/activity";
import { db, Prisma } from "@/server/db";
import { applyBookChanges, type BookChange } from "@/server/kdp-automation";
import { bookMatches } from "@/server/queries/kdp-accounts";
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
  /** "Actual" tasks created for formats that went online. */
  tasks: number;
  /** Linked cards completed, moved or raised to P0. */
  cards: number;
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
  // Importing one account's Bookshelf as the other would mark all of that
  // account's books as missing and duplicate them here.
  const mismatch = accountMismatch(account, await bookMatches(kdpIds), "libri");
  if (mismatch) return fail(mismatch);
  const [previous, accountBooks] = await Promise.all([
    db.kdpBook.findMany({
      where: { account, kdpId: { in: kdpIds } },
      select: { kdpId: true, formats: true },
    }),
    db.kdpBook.count({ where: { account } }),
  ]);
  const previousFormats = new Map(previous.map((book) => [book.kdpId, parseFormats(book.formats)]));
  const existing = new Set(previousFormats.keys());

  let asins = 0;
  const changes: BookChange[] = [];
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
        const saved = await tx.kdpBook.upsert({
          where: { account_kdpId: { account, kdpId: book.kdpId } },
          create: { account, kdpId: book.kdpId, ...fields },
          update: fields,
          select: { id: true },
        });
        // Price history: one row per change, per format (the first import of
        // a book, or of a book imported before this history existed, baselines it).
        for (const format of formats) {
          if (!format.price) continue;
          const last = await tx.kdpPriceHistory.findFirst({
            where: { bookId: saved.id, format: format.format },
            orderBy: { seenAt: "desc" },
            select: { price: true },
          });
          if (last?.price !== format.price) {
            await tx.kdpPriceHistory.create({
              data: {
                bookId: saved.id,
                format: format.format,
                price: format.price,
                market: format.market,
                seenAt: importedAt,
              },
            });
          }
        }
        const transition = statusTransitions(
          previousFormats.get(book.kdpId) ?? null,
          formats,
          accountBooks > 0,
        );
        if (transition.live.length > 0 || transition.blocked.length > 0) {
          changes.push({ bookId: saved.id, account, title: book.title, formats, ...transition });
        }
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
  // After the suggestions, so links confirmed just now are updated too.
  const automation = await applyBookChanges(changes);
  const created = payload.books.filter((book) => !existing.has(book.kdpId)).length;
  const updated = payload.books.length - created;
  await logActivity({
    kind: "kdp.import",
    summary:
      `Importati ${payload.books.length} libri KDP (${accountLabel(account)}): ` +
      `${created} nuovi, ${updated} aggiornati` +
      (missing ? `, ${missing} non più presenti` : "") +
      `; ${stats.confirmed} collegamenti automatici, ${stats.suggested} da confermare` +
      (automation.tasks || automation.cards
        ? `; ${automation.tasks} uscite segnate nel calendario, ${automation.cards} card aggiornate`
        : ""),
    entityIds: [],
  });
  revalidatePath(PATH);
  revalidatePath("/kdp");
  return ok({ created, updated, missing, asins, ...stats, ...automation });
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

const detectBooksSchema = z.array(z.string().min(1).max(64)).max(2000);

/** Which account already has these Bookshelf books, to preselect it on the import page. */
export async function detectBooksAccount(
  kdpIds: string[],
): Promise<ActionResult<{ account: KdpAccount | null; matches: AccountMatches }>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(detectBooksSchema, kdpIds);
  if (!data) return fail(error);
  const matches = await bookMatches(data);
  return ok({ account: likelyAccount(matches), matches });
}

const volumeSchema = z.object({
  bookId: idSchema,
  /** Position in its series; null goes back to the number read from the title. */
  volume: z.number().int().min(1).max(999).nullable(),
});

export async function setKdpBookVolume(input: z.input<typeof volumeSchema>): Promise<ActionResult> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(volumeSchema, input);
  if (!data) return fail(error);
  const book = await db.kdpBook.findUnique({
    where: { id: data.bookId },
    select: { title: true, volume: true },
  });
  if (!book) return fail("Libro non trovato.");
  await db.kdpBook.update({ where: { id: data.bookId }, data: { volume: data.volume } });
  await logActivity({
    kind: "kdp.volume",
    summary: data.volume
      ? `${q(book.title)} segnato come volume ${data.volume} della collana`
      : `Volume di ${q(book.title)} rimesso a quello letto dal titolo`,
    entityIds: [data.bookId],
    undo: [{ op: "update", model: "kdpBook", id: data.bookId, data: { volume: book.volume } }],
  });
  revalidatePath(PATH);
  revalidatePath("/kdp/vendite");
  return ok(undefined);
}
