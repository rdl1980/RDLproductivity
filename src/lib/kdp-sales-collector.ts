/**
 * Bookmarklet that reads the whole sales history from the KDP Reports pages
 * (kdpreports.amazon.com), with the user's own session, and opens the app's
 * import page with the rows gzipped in the URL fragment (never sent to a
 * server). Plain JavaScript: it runs on Amazon's page, outside the app.
 *
 * It uses the same JSON endpoints as the Reports UI: monthly royalties per
 * marketplace find the active (month, marketplace) pairs, then for each pair
 * the daily per-title orders, KENP pages and royalties (EUR estimates).
 */
const COLLECTOR = String.raw`
(async () => {
  if (!(__ON_PAGE__)) {
    __FAIL__("Apri i Report di KDP (kdpreports.amazon.com) e riprova.");
    return;
  }
  const MK = ["Amazon.com","Amazon.co.uk","Amazon.de","Amazon.fr","Amazon.co.jp","Amazon.ca","Amazon.it","Amazon.es","Amazon.in","Amazon.nl","Amazon.pl","Amazon.se","Amazon.com.be","Amazon.ie","Amazon.com.br","Amazon.com.mx","Amazon.com.au"];
  const FORMATS = ["EBook", "Paperback", "Hardcover"];
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:320px;padding:12px 14px;border-radius:10px;background:#111827;color:#fff;font:14px/1.4 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.3)";
  document.body.appendChild(box);
  const say = (text) => { box.textContent = "RDL Productivity · " + text; __PROGRESS__(text); };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function post(path, body) {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch("/reports/" + path, {
        method: "POST", credentials: "include",
        headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      });
      if (res.ok) return res.json();
      if (attempt >= 3) throw new Error(path + " → HTTP " + res.status);
      await sleep(1500 * (attempt + 1));
    }
  }
  const orders = (s, e, mk) => ({ startDate: s, endDate: e, catalogSize: 1000, filterBy: { DISTRIBUTION: ["STANDARD", "PRINT_EDC"], FORMAT: FORMATS, MARKETPLACE: mk, PRICING: ["paidUnits", "freeUnits"] } });
  const royalties = (s, e, mk) => ({ startDate: s, endDate: e, preferredCurrency: "EUR", kenpRate: 1, filterBy: { DISTRIBUTION: ["STANDARD", "KINDLE", "PRINT_EDC"], FORMAT: FORMATS, MARKETPLACE: mk } });
  const kenp = (s, e, mk) => ({ startDate: s, endDate: e, catalogSize: 1000, filterBy: { MARKETPLACE: mk } });
  const lists = (json) => {
    const root = Object.values(json || {})[0] || {};
    return (root.chart || root).histogramList || [];
  };
  // First day to read ("YYYY-MM-DD") or null for the whole history: the app
  // asks only for the months KDP may still revise once the rest is archived.
  const FROM = __FROM__;
  const pad = (n) => String(n).padStart(2, "0");
  const today = new Date();
  const todayKey = today.getFullYear() + "-" + pad(today.getMonth() + 1) + "-" + pad(today.getDate());
  const monthEnd = (m) => { const [y, mo] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mo, 0)); const key = d.toISOString().slice(0, 10); return key > todayKey ? todayKey : key; };

  try {
    // 1. Years, then months and marketplaces with any activity.
    say("cerco i periodi con vendite…");
    const scanFrom = FROM || "2010-01-01";
    const years = new Set();
    for (const [path, body] of [["orders/marketplaceHistogramV2", orders], ["royalties/marketplaceHistogramV2", royalties], ["kenp/marketplaceHistogramV2", kenp]]) {
      const json = await post(path, body(scanFrom + "T00:00:00Z", todayKey + "T23:59:59Z", MK));
      for (const h of (json.nestedHistogram || {}).histogramList || []) if (h.data.length) years.add(h.title.slice(0, 4));
    }
    const active = new Map();
    for (const year of [...years].sort()) {
      if (year < scanFrom.slice(0, 4)) continue;
      const start = year + "-01-01" > scanFrom ? year + "-01-01" : scanFrom;
      const end = year + "-12-31" > todayKey ? todayKey : year + "-12-31";
      for (const [path, body] of [["orders/marketplaceHistogramV2", orders], ["royalties/marketplaceHistogramV2", royalties], ["kenp/marketplaceHistogramV2", kenp]]) {
        const json = await post(path, body(start + "T00:00:00Z", end + "T23:59:59Z", MK));
        for (const h of (json.nestedHistogram || {}).histogramList || []) {
          for (const d of h.data) if (h.title.slice(0, 7) >= scanFrom.slice(0, 7)) active.set(h.title.slice(0, 7) + "|" + d.bin, true);
        }
      }
    }
    const pairs = [...active.keys()].sort();
    const deliver = async (out, from) => {
      const payload = { v: 1, kind: "sales", currency: "EUR", from, to: todayKey, generatedAt: new Date().toISOString(), rows: out };
      const stream = new Response(JSON.stringify(payload)).body.pipeThrough(new CompressionStream("gzip"));
      const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
      let bin = "";
      for (const b of bytes) bin += String.fromCharCode(b);
      __DELIVER__("gz." + btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
    };
    if (pairs.length === 0) {
      if (FROM) { say("nessuna vendita nel periodo."); await deliver([], FROM); return; }
      say("nessuna vendita trovata."); __FAIL__("Nessuna vendita trovata nei Report."); return;
    }

    // 2. Daily rows per title for each active (month, marketplace).
    const rows = new Map();
    const digitalKey = new Map();
    const row = (date, mk, key) => {
      const id = date + "|" + mk + "|" + key;
      let r = rows.get(id);
      if (!r) { r = [date, mk, key, 0, 0, 0, 0, 0, 0, 0, 0, 0]; rows.set(id, r); }
      return r;
    };
    const remember = (key) => { const m = /DIGITAL=([A-Z0-9]{10})/.exec(key); if (m) digitalKey.set(m[1], key); };
    const kenpRows = [];
    let done = 0;
    async function work(pair) {
      const [month, mk] = pair.split("|");
      const s = month + "-01T00:00:00Z", e = monthEnd(month) + "T23:59:59Z";
      const [o, r, k] = await Promise.all([
        post("orders/view/compare", orders(s, e, [mk])),
        post("royalties/chart/tooltip/titles", royalties(s, e, [mk])),
        post("kenp/view/compare", kenp(s, e, [mk])),
      ]);
      for (const h of lists(o)) for (const d of h.data) {
        remember(d.bin);
        const x = row(h.title, mk, d.bin), v = d.values;
        x[3] += v.DigitalOrders || 0; x[4] += v.PaperbackOrders || 0; x[5] += v.HardcoverOrders || 0;
      }
      for (const h of lists(r)) for (const d of h.data) {
        remember(d.bin);
        const x = row(h.title, mk, d.bin), v = d.values;
        x[7] += v.TotalRoyalties || 0; x[8] += v.DigitalRoyalties || 0; x[9] += v.PaperbackRoyalties || 0;
        x[10] += v.HardcoverRoyalties || 0; x[11] += v.PagesReadRoyalties || 0;
      }
      for (const h of lists(k)) for (const d of h.data) kenpRows.push([h.title, mk, d.bin, d.values.TotalKENP || 0]);
      done++;
      say("scarico le vendite… " + done + "/" + pairs.length + " (" + month + ", " + mk.replace("Amazon.", "") + ")");
    }
    const queue = pairs.slice();
    await Promise.all(Array.from({ length: 4 }, async () => { while (queue.length) await work(queue.shift()); }));
    for (const [date, mk, asin, pages] of kenpRows) {
      row(date, mk, digitalKey.get(asin) || "DIGITAL=" + asin + ":::")[6] += pages;
    }

    // 3. Hand over to the app.
    say("preparo l'importazione…");
    const round = (n) => Math.round(n * 100) / 100;
    const out = [...rows.values()].filter((x) => x[0].length === 10).map((x) => x.map((v, i) => (i >= 7 ? round(v) : v)));
    await deliver(out, FROM || pairs[0].slice(0, 7) + "-01");
  } catch (error) {
    say("errore: " + error.message + ". Riprova tra poco.");
    __FAIL__("Errore nei Report di KDP: " + error.message + ". Riprova tra poco.");
  }
})();
`;

/** JavaScript expressions (functions) the collector calls as it goes. */
export type CollectorHooks = {
  /** `(hash: string) => void`: the rows, "gz." + base64url gzip JSON. */
  deliver: string;
  /** `(message: string) => void` */
  fail: string;
  /** `(text: string) => void`: the progress line. */
  progress: string;
  /** Boolean expression: whether this is the Reports site (the extension opened it itself). */
  onPage?: string;
  /** Expression: first day to read ("YYYY-MM-DD") or null for everything (default). */
  from?: string;
};

export function salesCollectorSourceWith(hooks: CollectorHooks): string {
  return COLLECTOR.replace("__DELIVER__", `(${hooks.deliver})`)
    .replace(/__FAIL__/g, `(${hooks.fail})`)
    .replace("__PROGRESS__", `(${hooks.progress})`)
    .replace("__ON_PAGE__", hooks.onPage ?? 'location.hostname === "kdpreports.amazon.com"')
    .replace("__FROM__", hooks.from ?? "null")
    .trim();
}

/** Collector source for the given app origin (also usable from the console). */
export function salesCollectorSource(origin: string): string {
  const app = JSON.stringify(origin);
  return salesCollectorSourceWith({
    deliver: `(hash) => { location.href = ${app} + "/kdp/vendite/importa#" + hash; }`,
    fail: "(message) => alert(message)",
    progress: "() => {}",
  });
}

/** `javascript:` URL to drag to the bookmarks bar. */
export function salesBookmarkletHref(origin: string): string {
  return `javascript:${encodeURIComponent(salesCollectorSource(origin))}`;
}
