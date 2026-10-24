import { scraperSource } from "./kdp-bookmarklet";
import { salesCollectorSource } from "./kdp-sales-collector";

/**
 * One bookmarklet for both KDP pages: on the Bookshelf it imports the books,
 * on the Reports it imports the sales, elsewhere it says where to go.
 */
export function launcherSource(origin: string): string {
  const books = scraperSource(origin);
  const sales = salesCollectorSource(origin);
  return [
    "(() => {",
    "  const host = location.hostname;",
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
