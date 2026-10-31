/**
 * Bookmarklet that reads every page of the KDP Bookshelf (English or Italian
 * interface) and opens the app's import page with the books in the URL
 * fragment, which never reaches a server. Plain JavaScript: it runs on
 * kdp.amazon.com, outside the app. The browser extension runs the same
 * code with other `deliver`/`fail` hooks (see `extension/generate.ts`).
 */
const SCRAPER = String.raw`
(async () => {
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
  const firstId = () => document.querySelector(ROWS)?.id;
  async function waitChange(before) {
    for (let i = 0; i < 60; i++) {
      await sleep(250);
      const id = firstId();
      if (id && id !== before) break;
    }
    await sleep(800);
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
  const perPage = document.querySelector("#refreshedbookshelftable-records-per-page-dropdown-option");
  if (perPage && perPage.value !== "50") {
    const before = firstId();
    perPage.value = "50";
    perPage.dispatchEvent(new Event("change", { bubbles: true }));
    await waitChange(before);
    await sleep(1500);
  }
  const page1 = document.querySelector(".a-pagination a[href='#1']");
  if (page1 && !page1.closest(".a-selected")) { const b = firstId(); page1.click(); await waitChange(b); }
  const books = new Map();
  for (let guard = 0; guard < 100; guard++) {
    for (const book of parse()) books.set(book.kdpId, book);
    const next = document.querySelector(".a-pagination li.a-last:not(.a-disabled) a");
    if (!next) break;
    const before = firstId();
    next.click();
    await waitChange(before);
  }
  const payload = { v: 1, scrapedAt: new Date().toISOString(), books: [...books.values()] };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const hash = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  __DELIVER__(hash);
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
};

export function scraperSourceWith(hooks: ScraperHooks): string {
  return SCRAPER.replace("__DELIVER__", `(${hooks.deliver})`)
    .replace("__FAIL__", `(${hooks.fail})`)
    .replace("__ON_PAGE__", hooks.onPage ?? 'location.hostname.endsWith("kdp.amazon.com")')
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
