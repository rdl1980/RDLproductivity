/**
 * Best Sellers Rank and reviews from an Amazon product page. The extension
 * sends only small snippets around known markers (the page is ~1 MB); these
 * pure functions read them, for every Amazon language. Tested.
 */

/** Labels of the Best Sellers Rank line, per marketplace language. */
export const RANK_LABELS = [
  "Best Sellers Rank",
  "Posizione nella classifica Bestseller di Amazon",
  "Amazon Bestseller-Rang",
  "Bestseller-Rang",
  "Classement des meilleures ventes d'Amazon",
  "Classement des meilleures ventes",
  "Clasificación en los más vendidos de Amazon",
  "Ranking dos mais vendidos",
  "Plaats in bestsellerlijst",
  "Amazon 売れ筋ランキング",
];

export const REVIEWS_MARKER = 'id="acrCustomerReviewText"';
export const RATING_MARKER = 'id="acrPopover"';

/** Text of an HTML snippet: no tags, entities and odd spaces normalized. */
export function snippetText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[   ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "1.234", "1,234", "1 234" → 1234. */
const integer = (text: string) => {
  const digits = text.replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
};

/**
 * The overall rank and its store, e.g. "n.12.345 in Kindle Store" → 12345,
 * "Kindle Store". Category ranks that follow ("n.3 in Gialli") are ignored.
 */
export function parseRank(snippet: string): { rank: number; category: string } | null {
  const text = snippetText(snippet);
  const label = RANK_LABELS.find((l) => text.includes(l));
  const after = label ? text.slice(text.indexOf(label) + label.length) : text;
  const match =
    /(?:#|n\.\s?|nº\s?|n°\s?|nr\.\s?|Nr\.\s?)?(\d[\d.,\s]*\d|\d)\s*(?:位\s*)?(?:in|en|dans|em|im|-)\s+([^()#\d]{2,80}?)\s*(?:\(|#|n\.|nº|Nr\.|$)/i.exec(
      after.replace(/^[\s:：]+/, ""),
    );
  if (!match) return null;
  const rank = integer(match[1]);
  if (!rank) return null;
  return { rank, category: match[2].trim().replace(/[\s:,.]+$/, "") };
}

/** Number of ratings, from the "acrCustomerReviewText" span. */
export function parseReviews(snippet: string): number | null {
  const m = /acrCustomerReviewText"[^>]*>([^<]*)</.exec(snippet);
  return m ? integer(m[1]) : null;
}

/** Average stars, from the "acrPopover" title ("4,5 su 5 stelle", "4.5 out of 5 stars"). */
export function parseRating(snippet: string): number | null {
  const m = /acrPopover"[^>]*title="\s*(\d+(?:[.,]\d)?)/.exec(snippet);
  return m ? Number(m[1].replace(",", ".")) : null;
}

/** Whether Amazon answered with its robot check instead of the page. */
export const isCaptcha = (html: string) =>
  /validateCaptcha|Type the characters you see|Inserisci i caratteri/i.test(html);

export type RankReading = {
  rank: number | null;
  category: string | null;
  reviews: number | null;
  rating: number | null;
};

export function readSnippets(s: { rank?: string; reviews?: string; rating?: string }): RankReading {
  const rank = s.rank ? parseRank(s.rank) : null;
  return {
    rank: rank?.rank ?? null,
    category: rank?.category ?? null,
    reviews: s.reviews ? parseReviews(s.reviews) : null,
    rating: s.rating ? parseRating(s.rating) : null,
  };
}
