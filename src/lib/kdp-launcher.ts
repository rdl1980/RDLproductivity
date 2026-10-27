import { scraperSource } from "./kdp-bookmarklet";
import { salesCollectorSource } from "./kdp-sales-collector";
import { SYNC_WINDOW_NAME } from "./kdp-sync";

/**
 * One bookmarklet for both KDP pages: on the Bookshelf it imports the books,
 * on the Reports it imports the sales, elsewhere it says where to go. It
 * names the tab so the app chains the two steps into one full sync.
 */
export function launcherSource(origin: string): string {
  const books = scraperSource(origin);
  const sales = salesCollectorSource(origin);
  return [
    "(() => {",
    "  const host = location.hostname;",
    `  if (host.endsWith(".amazon.com")) window.name = ${JSON.stringify(SYNC_WINDOW_NAME)};`,
    `  if (host === "kdpreports.amazon.com") { ${sales} }`,
    `  else if (host.endsWith("kdp.amazon.com")) { ${books} }`,
    '  else alert("Apri il Bookshelf di KDP (kdp.amazon.com/bookshelf) per importare i libri, o i Report di KDP (kdpreports.amazon.com) per importare le vendite, poi riprova.");',
    "})();",
  ].join("\n");
}

/** `javascript:` URL to save as a bookmark. */
export function launcherBookmarkletHref(origin: string): string {
  return `javascript:${encodeURIComponent(launcherSource(origin))}`;
}
