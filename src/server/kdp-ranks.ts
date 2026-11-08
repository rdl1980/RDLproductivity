import "server-only";

import { CONTENT_TIME_ZONE, dayIn } from "@/lib/content";
import { escapeHtml } from "@/lib/content-reminder";
import { readSnippets } from "@/lib/amazon-rank";
import type { KdpAccount } from "@/lib/kdp";
import { amazonUrl, FORMAT_LABELS, type KdpFormat, mainTitle } from "@/lib/kdp-books";
import { db } from "@/server/db";
import { parseFormats } from "@/server/queries/kdp-books";
import { getTelegramConfig, sendTelegram } from "@/server/telegram";
import { jobEnabled } from "@/server/telegram-settings";

/** Product pages read per account and day, so Amazon is not hammered. */
export const MAX_RANK_TARGETS = 150;

export type RankTarget = { asin: string; market: string; url: string };

type BookFormatRef = { bookId: string; title: string; format: KdpFormat } & RankTarget;

async function targetsOf(account: KdpAccount): Promise<BookFormatRef[]> {
  const books = await db.kdpBook.findMany({
    where: { account, missingSince: null },
    select: { id: true, title: true, formats: true },
    orderBy: { title: "asc" },
  });
  const seen = new Set<string>();
  const out: BookFormatRef[] = [];
  for (const book of books) {
    for (const f of parseFormats(book.formats)) {
      const url = amazonUrl(f);
      if (f.status !== "live" || !f.asin || !url) continue;
      const market = f.market ?? "";
      if (seen.has(`${f.asin}|${market}`)) continue;
      seen.add(`${f.asin}|${market}`);
      out.push({
        bookId: book.id,
        title: mainTitle(book.title),
        format: f.format,
        asin: f.asin,
        market,
        url,
      });
    }
  }
  return out.slice(0, MAX_RANK_TARGETS);
}

/** The product pages the extension of `account` should read today. */
export async function rankTargets(account: KdpAccount): Promise<RankTarget[]> {
  return (await targetsOf(account)).map(({ asin, market, url }) => ({ asin, market, url }));
}

export type RankItem = {
  asin: string;
  market: string;
  rank?: string;
  reviews?: string;
  rating?: string;
};

const date = (day: string) => new Date(`${day}T00:00:00Z`);

/**
 * Stores today's readings (one row per ASIN, marketplace and day; a second
 * read the same day replaces it) and alerts on Telegram about new reviews.
 */
export async function saveRanks(
  account: KdpAccount,
  items: RankItem[],
  baseUrl: string,
): Promise<{ saved: number; newReviews: number }> {
  const today = dayIn(new Date(), CONTENT_TIME_ZONE);
  const targets = new Map((await targetsOf(account)).map((t) => [`${t.asin}|${t.market}`, t]));
  const news: string[] = [];
  let saved = 0;
  for (const item of items) {
    const target = targets.get(`${item.asin}|${item.market}`);
    if (!target) continue;
    const reading = readSnippets(item);
    if (reading.rank === null && reading.reviews === null) continue;
    const previous = await db.kdpRank.findFirst({
      where: {
        asin: item.asin,
        market: item.market,
        date: { lt: date(today) },
        reviews: { not: null },
      },
      orderBy: { date: "desc" },
      select: { reviews: true },
    });
    const key = { asin: item.asin, market: item.market, date: date(today) };
    const data = {
      bookId: target.bookId,
      format: target.format,
      rank: reading.rank,
      category: reading.category,
      reviews: reading.reviews,
      rating: reading.rating,
    };
    await db.kdpRank.upsert({
      where: { asin_market_date: key },
      create: { ...key, ...data },
      update: data,
    });
    saved++;
    if (
      previous?.reviews != null &&
      reading.reviews !== null &&
      reading.reviews > previous.reviews
    ) {
      const stars = reading.rating ? `, media ${String(reading.rating).replace(".", ",")}★` : "";
      news.push(
        `• ${escapeHtml(target.title)} (${FORMAT_LABELS[target.format]}${target.market ? `, ${target.market}` : ""}): ${previous.reviews} → ${reading.reviews}${stars}`,
      );
    }
  }
  if (news.length) await notifyReviews(news, baseUrl);
  return { saved, newReviews: news.length };
}

async function notifyReviews(lines: string[], baseUrl: string) {
  try {
    const config = await getTelegramConfig();
    if (!config || !(await jobEnabled("reviews"))) return;
    await sendTelegram(
      config,
      [
        `<b>⭐ Valutazioni nuove su Amazon</b>`,
        ...lines,
        `<a href="${baseUrl}/kdp/libri">Apri Libri</a>`,
      ].join("\n"),
    );
  } catch (error) {
    console.error("Review alert not sent", error);
  }
}
