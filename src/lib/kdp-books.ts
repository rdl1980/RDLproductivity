/**
 * KDP books imported from the Bookshelf, and the title matching that links
 * them to board cards. Pure functions only: shared by server, client and tests.
 */
import { z } from "zod";

import type { KdpAccount } from "@/lib/kdp";

export const KDP_FORMATS = ["ebook", "paperback", "hardcover"] as const;
export type KdpFormat = (typeof KDP_FORMATS)[number];

export const KDP_STATUSES = [
  "live",
  "draft",
  "review",
  "publishing",
  "blocked",
  "unpublished",
  "other",
] as const;
export type KdpStatus = (typeof KDP_STATUSES)[number];

export const FORMAT_LABELS: Record<KdpFormat, string> = {
  ebook: "eBook",
  paperback: "Cartaceo",
  hardcover: "Copertina rigida",
};

export const STATUS_LABELS: Record<KdpStatus, string> = {
  live: "Online",
  draft: "Bozza",
  review: "In revisione",
  publishing: "In pubblicazione",
  blocked: "Bloccato",
  unpublished: "Non pubblicato",
  other: "Altro",
};

/** Bookshelf status text (English or Italian KDP interface) to a status. */
export function normalizeStatus(raw: string | null | undefined): KdpStatus {
  const text = (raw ?? "").trim().toLowerCase();
  if (/^(live|online|pubblicato)$/.test(text)) return "live";
  if (/^(draft|bozza)$/.test(text)) return "draft";
  if (/^(in review|in revisione)$/.test(text)) return "review";
  if (/^(publishing|in pubblicazione)$/.test(text)) return "publishing";
  if (/^(blocked|bloccato)$/.test(text)) return "blocked";
  if (/^(unpublished|non pubblicato)$/.test(text)) return "unpublished";
  return "other";
}

const MARKET_BY_HOST: [RegExp, string][] = [
  [/amazon\.com$/, "US"],
  [/amazon\.co\.uk$/, "UK"],
  [/amazon\.it$/, "IT"],
  [/amazon\.de$/, "DE"],
  [/amazon\.fr$/, "FR"],
  [/amazon\.es$/, "ES"],
  [/amazon\.nl$/, "NL"],
  [/amazon\.ca$/, "CA"],
  [/amazon\.com\.au$/, "AU"],
  [/amazon\.co\.jp$/, "JP"],
];
const MARKET_BY_CURRENCY: Record<string, string> = {
  USD: "US",
  GBP: "UK",
  CAD: "CA",
  AUD: "AU",
  JPY: "JP",
};

const DOMAIN_BY_MARKET: Record<string, string> = {
  US: "amazon.com",
  UK: "amazon.co.uk",
  IT: "amazon.it",
  DE: "amazon.de",
  FR: "amazon.fr",
  ES: "amazon.es",
  NL: "amazon.nl",
  CA: "amazon.ca",
  AU: "amazon.com.au",
  JP: "amazon.co.jp",
};

/** Words that tell the euro marketplaces apart by the title's language. */
const LANGUAGE_WORDS: [string, Set<string>][] = [
  [
    "IT",
    new Set(
      "il gli della delle dei degli per che nel nella alla ai dal dalla sono anni ragazzi come quaderno storie".split(
        " ",
      ),
    ),
  ],
  ["ES", new Set("el los las y para que niños años cómo historias".split(" "))],
  ["FR", new Set("le les des du pour avec et enfants au aux grilles".split(" "))],
  ["DE", new Set("der die das und für mit ein eine kinder".split(" "))],
];

/** Euro marketplace guessed from the title's language; null when unclear. */
export function euroMarket(title: string): string | null {
  const words = title.toLowerCase().split(/[^\p{L}]+/u);
  const scores = LANGUAGE_WORDS.map(
    ([market, set]) => [market, words.filter((word) => set.has(word)).length] as const,
  ).sort((a, b) => b[1] - a[1]);
  return scores[0][1] > 0 && scores[0][1] > scores[1][1] ? scores[0][0] : null;
}

/**
 * Primary marketplace of a format: from its Amazon link if known, else from
 * the currency of its price (for euros, from the language of the title).
 */
export function marketOf(
  url: string | null | undefined,
  price: string | null | undefined,
  title = "",
) {
  if (url) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, "");
      const match = MARKET_BY_HOST.find(([pattern]) => pattern.test(host));
      if (match) return match[1];
    } catch {
      // Not a URL: fall back to the currency.
    }
  }
  const currency = /([A-Z]{3})\s*$/.exec(price ?? "")?.[1];
  if (currency === "EUR") return euroMarket(title);
  return (currency && MARKET_BY_CURRENCY[currency]) || null;
}

// --- Import payload (produced by the bookmarklet) -----------------------------

const text = (max: number) => z.string().trim().max(max);

export const importFormatSchema = z.object({
  format: z.enum(KDP_FORMATS),
  status: text(60).nullish(),
  asin: z
    .string()
    .trim()
    .regex(/^[A-Z0-9]{10}$/, "ASIN non valido.")
    .nullish(),
  price: text(40).nullish(),
  url: z.url().max(500).nullish(),
});

export const importBookSchema = z.object({
  kdpId: text(64).min(1),
  title: text(500).min(1),
  series: text(300).nullish(),
  formats: z.array(importFormatSchema).max(3),
});

export const importPayloadSchema = z.object({
  v: z.literal(1),
  scrapedAt: z.string().max(40).optional(),
  books: z.array(importBookSchema).min(1).max(2000),
});

export type ImportPayload = z.infer<typeof importPayloadSchema>;

/** Format data as stored in `KdpBook.formats`. */
export type KdpBookFormat = {
  format: KdpFormat;
  status: KdpStatus;
  /** Status text as shown by KDP. */
  statusText: string | null;
  asin: string | null;
  price: string | null;
  url: string | null;
  market: string | null;
};

export const storedFormatsSchema = z.array(
  z.object({
    format: z.enum(KDP_FORMATS),
    status: z.enum(KDP_STATUSES),
    statusText: z.string().nullable(),
    asin: z.string().nullable(),
    price: z.string().nullable(),
    url: z.string().nullable(),
    market: z.string().nullable(),
  }),
);

export function toStoredFormats(formats: ImportPayload["books"][number]["formats"], title = "") {
  return formats
    .map((f): KdpBookFormat => ({
      format: f.format,
      status: normalizeStatus(f.status),
      statusText: f.status ?? null,
      asin: f.asin ?? null,
      price: f.price ?? null,
      url: f.url ?? null,
      market: marketOf(f.url, f.price, title),
    }))
    .sort((a, b) => KDP_FORMATS.indexOf(a.format) - KDP_FORMATS.indexOf(b.format));
}

/** "Libro in the evolution of football tactics" → "the evolution of football tactics". */
export function cleanSeries(series: string | null | undefined): string | null {
  const value = (series ?? "").replace(/^(libro in|book in|part of)\s+/i, "").trim();
  return value || null;
}

/** Base64url of the UTF-8 JSON, as written by the bookmarklet in the URL fragment. */
export function decodeImportHash(hash: string): unknown {
  const data = hash.replace(/^#/, "").replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(data);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function encodeImportHash(payload: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// --- Title matching -------------------------------------------------------------

const STOPWORDS = new Set(
  (
    "a an the of for and or to in on with by from your you how why what " +
    "il lo la i gli le un una uno di da del della dei degli delle dal dalla " +
    "per con e ed o in nel nella al alla ai che come su tra fra " +
    "el los las de y para con les des du et pour"
  ).split(" "),
);

const MARKET_TAGS: Record<string, string[]> = {
  us: ["US"],
  usa: ["US"],
  uk: ["UK"],
  gb: ["UK"],
  it: ["IT"],
  ita: ["IT"],
  de: ["DE"],
  fr: ["FR"],
  es: ["ES"],
  en: ["US", "UK"],
};

export function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function tokens(value: string): string[] {
  return normalize(value)
    .split(" ")
    .filter((token) => token && !STOPWORDS.has(token));
}

/**
 * The book a card is about, from its title: the part before " — " (cards often
 * carry a status after it), with market tags like "(US)" or "(EN, UK + US)" removed.
 */
export function parseCardTitle(title: string): { core: string; markets: Set<string> } {
  const head = title.split(/\s+[—–]\s+/)[0];
  const markets = new Set<string>();
  const core = head
    .replace(/\(([^)]*)\)/g, (group, inner: string) => {
      const words = normalize(inner).split(" ").filter(Boolean);
      if (words.length > 0 && words.every((word) => word in MARKET_TAGS)) {
        for (const word of words) for (const market of MARKET_TAGS[word]) markets.add(market);
        return " ";
      }
      return ` ${inner} `;
    })
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/\s+/g, " ")
    .trim();
  return { core, markets };
}

/** Main title: the part before the subtitle (first ": "). */
export function mainTitle(title: string): string {
  return title.split(/:\s/)[0].trim();
}

function dice(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared++;
  return (2 * shared) / (a.size + b.size);
}

export type MatchBook = { id: string; title: string; markets: string[] };
export type MatchCard = { id: string; title: string };

/**
 * Similarity in [0, 1] between a card and a book. 1 means the card names the
 * book's main title exactly in a compatible market.
 */
export function matchScore(card: MatchCard, book: MatchBook): { score: number; exact: boolean } {
  const { core, markets } = parseCardTitle(card.title);
  const cardTokens = new Set(tokens(core));
  if (cardTokens.size === 0) return { score: 0, exact: false };

  const main = mainTitle(book.title);
  const mainTokens = new Set(tokens(main));
  const fullTokens = new Set(tokens(book.title));
  let covered = 0;
  for (const token of cardTokens) if (fullTokens.has(token)) covered++;
  const coverage = covered / cardTokens.size;

  // Numbers alone (years, volumes, ids) never make a match.
  const isNumber = (token: string) => /^\d+$/.test(token);
  const cardWords = [...cardTokens].filter((token) => !isNumber(token));
  if (!cardWords.some((token) => fullTokens.has(token))) return { score: 0, exact: false };

  const exact = normalize(core) === normalize(main);
  let score = exact ? 1 : Math.max(dice(cardTokens, mainTokens), 0.85 * coverage);
  // A card naming a year or volume the book does not have is likely another edition.
  const cardNumbers = [...cardTokens].filter(isNumber);
  if (cardNumbers.length > 0 && !cardNumbers.some((n) => fullTokens.has(n))) score *= 0.5;

  // A card tagged for some markets fits only a book sold there.
  const marketKnown = markets.size > 0 && book.markets.length > 0;
  const marketOk = marketKnown && book.markets.some((market) => markets.has(market));
  if (marketKnown) score = marketOk ? Math.min(1, score + 0.1) : score * 0.4;
  return { score: Math.round(score * 1000) / 1000, exact: exact && (!marketKnown || marketOk) };
}

export const SUGGEST_THRESHOLD = 0.5;
/** Suggestions per card: those within this distance of the card's best score. */
const SUGGEST_SPREAD = 0.2;
const MAX_SUGGESTIONS_PER_CARD = 3;

export type ProposedLink = {
  bookId: string;
  cardId: string;
  score: number;
  /** Exact title in a compatible market, and the only exact match of the card. */
  certain: boolean;
};

/**
 * Proposed card-book links. `skip` holds "bookId:cardId" pairs already decided
 * (confirmed or rejected), which are never proposed again.
 */
export function proposeLinks(
  cards: MatchCard[],
  books: MatchBook[],
  skip: Set<string> = new Set(),
): ProposedLink[] {
  const proposals: ProposedLink[] = [];
  for (const card of cards) {
    const scored = books
      .map((book) => ({ book, ...matchScore(card, book) }))
      .filter(({ score }) => score >= SUGGEST_THRESHOLD)
      .sort((a, b) => b.score - a.score);
    if (scored.length === 0) continue;

    const exactCount = scored.filter(({ exact }) => exact).length;
    const best = scored[0].score;
    for (const { book, score, exact } of scored.slice(0, MAX_SUGGESTIONS_PER_CARD)) {
      if (score < best - SUGGEST_SPREAD) break;
      if (skip.has(`${book.id}:${card.id}`)) continue;
      proposals.push({
        bookId: book.id,
        cardId: card.id,
        score,
        certain: exact && exactCount === 1,
      });
    }
  }
  return proposals;
}

// --- Display -----------------------------------------------------------------------

export type KdpBookItem = {
  id: string;
  account: KdpAccount;
  kdpId: string;
  title: string;
  series: string | null;
  formats: KdpBookFormat[];
  /** Set when the last import of the account no longer listed the book. */
  missingSince: string | null;
  importedAt: string;
  /** Volume set by hand; null = read from the title. */
  volume: number | null;
  links: KdpBookLinkItem[];
};

export type KdpBookLinkItem = {
  id: string;
  status: "confirmed" | "suggested";
  auto: boolean;
  score: number;
  card: { id: string; title: string; boardId: string; boardTitle: string; listTitle: string };
};

export function amazonUrl(format: KdpBookFormat): string | null {
  if (format.url) return format.url;
  if (!format.asin) return null;
  return `https://www.${DOMAIN_BY_MARKET[format.market ?? ""] ?? "amazon.com"}/dp/${format.asin}`;
}

// --- Status changes between imports -------------------------------------------------

export type StatusTransition = { live: KdpFormat[]; blocked: KdpFormat[] };

/**
 * Formats that went online or got blocked since the previous import. A book
 * seen for the first time counts only when the account was imported before:
 * the very first import describes the past, not news.
 */
export function statusTransitions(
  previous: KdpBookFormat[] | null,
  next: KdpBookFormat[],
  accountKnown: boolean,
): StatusTransition {
  if (previous === null && !accountKnown) return { live: [], blocked: [] };
  const before = (format: KdpFormat) => previous?.find((f) => f.format === format)?.status;
  return {
    live: next
      .filter((f) => f.status === "live" && before(f.format) !== "live")
      .map((f) => f.format),
    blocked: next
      .filter((f) => f.status === "blocked" && before(f.format) !== "blocked")
      .map((f) => f.format),
  };
}

/** "Cartaceo US: B0…", one line per format with an ASIN. */
export function formatSummary(formats: KdpBookFormat[]): string {
  return formats
    .filter((f) => f.asin)
    .map((f) => `${FORMAT_LABELS[f.format]}${f.market ? ` ${f.market}` : ""}: ${f.asin}`)
    .join("\n");
}
