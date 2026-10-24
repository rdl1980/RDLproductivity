import type { KdpAccount } from "./kdp";

/**
 * Series: which volume a book is, and how readers carry on from one volume
 * to the next (read-through).
 */

const ROMAN: Record<string, number> = {
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
  ix: 9,
  x: 10,
};

/**
 * Volume number read from the title: "Libro 2", "Vol. 3", "Volume III",
 * "Book 1", "Parte 2", "#4", a trailing " 2" or "(Vol 2)". Null when none.
 */
export function volumeNumber(title: string): number | null {
  const text = title.replace(/\s+/g, " ").trim();
  const word =
    /(?:\b(?:libro|book|vol\.?|volume|parte|part|tomo|episodio|episode)|#)\s*(\d{1,3}|[ivx]{1,4})\b/i.exec(
      text,
    );
  if (word) return toNumber(word[1]);
  // "Titolo 2", "Titolo 2: sottotitolo", "Titolo - 2"
  const trailing = /^[^:]*?[\s-](\d{1,2})(?:\s*[:(-].*)?$/.exec(text);
  if (trailing && !/\b(19|20)\d{2}\b/.test(trailing[0].slice(-6))) return toNumber(trailing[1]);
  return null;
}

function toNumber(value: string): number | null {
  const roman = ROMAN[value.toLowerCase()];
  if (roman) return roman;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n < 1000 ? n : null;
}

export type SeriesBook = {
  key: string;
  title: string;
  account: KdpAccount;
  series: string | null;
  volume: number | null;
};

export type SeriesVolume = {
  key: string;
  title: string;
  volume: number;
  units: number;
  /** Units of this volume per 100 of the previous one; null for the first. */
  readThrough: number | null;
};

export type SeriesReport = {
  series: string;
  account: KdpAccount;
  volumes: SeriesVolume[];
  /** Units of the last volume per 100 of the first; null with fewer than two volumes sold. */
  overall: number | null;
};

/**
 * Read-through per series: volumes in order with their units and the share
 * that continued from the previous one. Series with one volume are skipped.
 */
export function readThrough(books: SeriesBook[], unitsByBook: Map<string, number>): SeriesReport[] {
  const groups = new Map<string, SeriesBook[]>();
  for (const book of books) {
    if (!book.series || book.volume === null) continue;
    const key = `${book.account}|${book.series.toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), book]);
  }
  const reports: SeriesReport[] = [];
  for (const group of groups.values()) {
    const ordered = [...group].sort(
      (a, b) => a.volume! - b.volume! || a.title.localeCompare(b.title),
    );
    if (ordered.length < 2) continue;
    let previous: number | null = null;
    const volumes: SeriesVolume[] = ordered.map((book) => {
      const units = unitsByBook.get(book.key) ?? 0;
      const entry: SeriesVolume = {
        key: book.key,
        title: book.title,
        volume: book.volume!,
        units,
        readThrough: previous === null ? null : previous > 0 ? (units / previous) * 100 : null,
      };
      previous = units;
      return entry;
    });
    const first = volumes[0].units;
    const last = volumes[volumes.length - 1].units;
    reports.push({
      series: ordered[0].series!,
      account: ordered[0].account,
      volumes,
      overall: first > 0 ? (last / first) * 100 : null,
    });
  }
  return reports.sort((a, b) => b.volumes[0].units - a.volumes[0].units);
}
