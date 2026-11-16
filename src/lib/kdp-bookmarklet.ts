/**
 * Bookmarklet that reads every page of the KDP Bookshelf (English or Italian
 * interface) and opens the app's import page with the books in the URL
 * fragment, which never reaches a server. Plain JavaScript: it runs on
 * kdp.amazon.com, outside the app. The browser extension runs the same
 * code with other `deliver`/`fail` hooks (see `extension/generate.ts`).
 */
const SCRAPER = String.raw`
(async () => {
  try {
  const TABLE = "table.refreshedbookshelftable";
  const ROWS = TABLE + " > tbody > tr";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // The table is filled by the page's own scripts: give it a moment.
  for (let i = 0; i < 80 && !document.querySelector(TABLE); i++) await sleep(250);
  if (!(__ON_PAGE__) || !document.querySelector(TABLE)) {
    __FAIL__("Apri il Bookshelf di KDP (kdp.amazon.com) e riprova.");
    return;
  }
  const FORMATS = {
    "Kindle eBook": "ebook", "eBook Kindle": "ebook",
    "Paperback": "paperback", "Versione cartacea": "paperback", "Copertina flessibile": "paperback",
    "Hardcover": "hardcover", "Copertina rigida": "hardcover",
  };
  const STATUS = /^(Draft|Bozza|Live|Online|Pubblicato|In review|In revisione|Publishing|In pubblicazione|Blocked|Bloccato|Unpublished|Non pubblicato)$/i;
  const started = Date.now();
  const elapsed = () => Math.round((Date.now() - started) / 1000) + " s";
  // What the table shows: first and last row and how many. Switching to 50 rows
  // keeps the first book, so the first row alone would not tell the change.
  const shown = () => {
    const rows = document.querySelectorAll(ROWS);
    return rows.length + "|" + (rows[0]?.id ?? "") + "|" + (rows[rows.length - 1]?.id ?? "");
  };
  // Until the table changes, then until it stays the same for half a second.
  async function waitChange(before) {
    let current = shown();
    for (let i = 0; i < 60 && current === before; i++) {
      await sleep(250);
      current = shown();
    }
    for (let i = 0; i < 20; i++) {
      await sleep(250);
      const next = shown();
      if (next === current) break;
      current = next;
    }
  }
  function parse() {
    return [...document.querySelectorAll(ROWS)].map((row) => {
      const lines = row.innerText.split("\n").map((s) => s.trim()).filter(Boolean);
      const by = lines.findIndex((l) => /^(by|da) /.test(l));
      const title = by > 0 ? lines[by - 1] : lines[0];
      const series = by > 1 && /^(Libro in|Book in|Part of) /i.test(lines[by - 2]) ? lines[by - 2] : null;
      const author = by >= 0 ? lines[by].replace(/^(by|da) /, "").trim() || null : null;
      const formats = [];
      let cur = null;
      for (const l of lines) {
        if (FORMATS[l]) { cur = { format: FORMATS[l], status: null, asin: null, price: null }; formats.push(cur); continue; }
        if (!cur) continue;
        if (!cur.status && STATUS.test(l)) cur.status = l;
        const asin = l.match(/ASIN:\s*([A-Z0-9]{10})/);
        if (asin) cur.asin = asin[1];
        if (/^\D?\s?[\d.,]+\s+[A-Z]{3}$/.test(l)) cur.price = l;
      }
      return { kdpId: row.id, title, series, author, formats: formats.filter((f) => f.status || f.asin) };
    }).filter((b) => b.kdpId && b.title);
  }
  __PROGRESS__("Bookshelf aperto (" + elapsed() + ")");
  const perPage = document.querySelector("#refreshedbookshelftable-records-per-page-dropdown-option");
  if (perPage && perPage.value !== "50") {
    const before = shown();
    perPage.value = "50";
    perPage.dispatchEvent(new Event("change", { bubbles: true }));
    await waitChange(before);
  }
  const page1 = document.querySelector(".a-pagination a[href='#1']");
  if (page1 && !page1.closest(".a-selected")) { const b = shown(); page1.click(); await waitChange(b); }
  const pages = [...document.querySelectorAll(".a-pagination li")].filter((li) => /^\d+$/.test(li.innerText.trim())).length || 1;
  const books = new Map();
  for (let page = 1; page <= 100; page++) {
    for (const book of parse()) books.set(book.kdpId, book);
    __PROGRESS__("Pagina " + page + " di " + Math.max(pages, page) + ": " + books.size + " libri (" + elapsed() + ")");
    const next = document.querySelector(".a-pagination li.a-last:not(.a-disabled) a");
    if (!next) break;
    const before = shown();
    next.click();
    await waitChange(before);
  }
  const payload = { v: 1, scrapedAt: new Date().toISOString(), books: [...books.values()] };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const hash = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  __DELIVER__(hash);
  } catch (error) {
    // Never leave the caller waiting: report what broke.
    __FAIL__("Lettura del Bookshelf non riuscita: " + (error && error.message ? error.message : error));
  }
})();
`;

/** JavaScript expressions (functions) the scraper calls at the end or on failure. */
export type ScraperHooks = {
  /** `(hash: string) => void`: the books, base64url JSON. */
  deliver: string;
  /** `(message: string) => void` */
  fail: string;
  /** Boolean expression: whether this is the Bookshelf (the extension opened it itself). */
  onPage?: string;
  /** `(text: string) => void`: the progress line (none for the bookmarklet). */
  progress?: string;
};

export function scraperSourceWith(hooks: ScraperHooks): string {
  return SCRAPER.replace("__DELIVER__", `(${hooks.deliver})`)
    .replaceAll("__FAIL__", `(${hooks.fail})`)
    .replace("__ON_PAGE__", hooks.onPage ?? 'location.hostname.endsWith("kdp.amazon.com")')
    .replaceAll("__PROGRESS__", `(${hooks.progress ?? "() => {}"})`)
    .trim();
}

/** Scraper source for the given app origin (also usable from the console). */
export function scraperSource(origin: string): string {
  const app = JSON.stringify(origin);
  return scraperSourceWith({
    deliver: `(hash) => { location.href = ${app} + "/kdp/libri/importa#" + hash; }`,
    fail: "(message) => alert(message)",
  });
}

/** `javascript:` URL to drag to the bookmarks bar. */
export function bookmarkletHref(origin: string): string {
  return `javascript:${encodeURIComponent(scraperSource(origin))}`;
}
