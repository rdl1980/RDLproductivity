// Runs the Bookshelf scraper and the Reports collector in background tabs and
// hands their results to the app tab that asked. The scripts are the same as
// the bookmarklets (generated from the app's sources, see scripts/).
const api = globalThis.browser ?? globalThis.chrome;

const STEPS = {
  books: {
    url: "https://kdp.amazon.com/bookshelf",
    file: "scripts/books.js",
    label: "Bookshelf",
    timeoutMs: 3 * 60 * 1000,
  },
  sales: {
    url: "https://kdpreports.amazon.com/dashboard",
    file: "scripts/sales.js",
    label: "Report",
    timeoutMs: 15 * 60 * 1000,
  },
};
const LOAD_TIMEOUT_MS = 60 * 1000;
const SIGN_IN = /\/ap\/signin|\/signin|\/ap\/mfa|\/ap\/cvf/;

/** Listeners waiting for messages from the scripts, by Amazon tab id. */
const waiting = new Map();

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !sender.tab) return;
  if (message.type === "autosync") {
    autoSyncCommand(message).then(sendResponse, (error) =>
      sendResponse({ error: error && error.message ? error.message : String(error) }),
    );
    return true;
  }
  if (message.type === "sync") {
    void runSync(sender.tab.id, message);
    return;
  }
  const listener = waiting.get(sender.tab.id);
  if (listener) listener(message);
});

const send = (tabId, message) => api.tabs.sendMessage(tabId, message).catch(() => {});

/** True while a sync (by hand or hourly) is reading KDP: they never overlap. */
let busy = false;

async function runSync(appTabId, { requestId, steps, options = {} }) {
  if (busy) {
    await send(appTabId, {
      type: "rdl-kdp:done",
      requestId,
      error: "È in corso un aggiornamento automatico: riprova fra qualche minuto.",
    });
    return;
  }
  busy = true;
  try {
    await runSteps(appTabId, requestId, steps, options);
  } finally {
    busy = false;
  }
}

async function runSteps(appTabId, requestId, steps, options) {
  for (const step of steps) {
    if (!STEPS[step]) continue;
    const progress = (status, message) =>
      send(appTabId, { type: "rdl-kdp:progress", requestId, step, status, message });
    progress("opening", `Apro ${STEPS[step].label} di KDP…`);
    try {
      const hash = await runStep(step, options, (text) => progress("reading", text));
      await send(appTabId, { type: "rdl-kdp:result", requestId, step, hash });
    } catch (error) {
      await send(appTabId, {
        type: "rdl-kdp:result",
        requestId,
        step,
        error: error && error.message ? error.message : String(error),
      });
    }
    // Back to the app between steps and at the end.
    await api.tabs.update(appTabId, { active: true }).catch(() => {});
  }
  await send(appTabId, { type: "rdl-kdp:done", requestId });
}

/** Developer override of the pages' URLs (`chrome.storage.local.stepUrls`), used by the tests. */
async function stepUrl(step) {
  const { stepUrls } = await api.storage.local.get("stepUrls");
  return (stepUrls && stepUrls[step]) || STEPS[step].url;
}

async function runStep(step, options, onProgress, { quiet = false } = {}) {
  const { file, timeoutMs } = STEPS[step];
  // In the foreground: browsers slow timers and skip layout in background
  // tabs, which makes reading the Bookshelf crawl or fail. The hourly sync
  // (`quiet`) reads only the Reports, whose collector just calls KDP's JSON
  // endpoints: a background tab is enough, and it never steals the focus.
  const tab = await api.tabs.create({ url: await stepUrl(step), active: !quiet });
  let keepOpen = false;
  try {
    await waitForLoad(tab.id);
    const loaded = await api.tabs.get(tab.id);
    if (!loaded.url || SIGN_IN.test(loaded.url)) {
      if (quiet) throw new Error("KDP chiede di accedere: entra in KDP in questo browser.");
      keepOpen = true;
      await api.tabs.update(tab.id, { active: true });
      throw new Error("Accedi a KDP nella scheda appena aperta, poi riprova.");
    }
    const result = waitForResult(tab.id, timeoutMs, onProgress);
    try {
      // Sales: read from the date the app asks for (null = everything).
      await api.scripting.executeScript({
        target: { tabId: tab.id },
        func: (from) => {
          globalThis.__rdlSalesFrom = from;
        },
        args: [step === "sales" ? options.salesFrom || null : null],
      });
      await api.scripting.executeScript({ target: { tabId: tab.id }, files: [file] });
    } catch (error) {
      throw new Error(`Impossibile leggere la pagina di KDP (${error.message}).`);
    }
    return await result;
  } finally {
    waiting.delete(tab.id);
    if (!keepOpen) await api.tabs.remove(tab.id).catch(() => {});
  }
}

/** Resolves when the tab has finished loading (or rejects after a minute). */
function waitForLoad(tabId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      api.tabs.onUpdated.removeListener(listener);
      reject(new Error("La pagina di KDP non risponde."));
    }, LOAD_TIMEOUT_MS);
    function listener(id, info) {
      if (id !== tabId || info.status !== "complete") return;
      clearTimeout(timer);
      api.tabs.onUpdated.removeListener(listener);
      // The pages fill their content after load.
      setTimeout(resolve, 1500);
    }
    api.tabs.onUpdated.addListener(listener);
    api.tabs.get(tabId).then((tab) => {
      if (tab.status === "complete") listener(tabId, { status: "complete" });
    });
  });
}

/** Resolves with the hash the script delivers; progress lines go to `onProgress`. */
function waitForResult(tabId, timeoutMs, onProgress) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      waiting.delete(tabId);
      reject(new Error("Tempo scaduto: KDP non ha risposto in tempo."));
    }, timeoutMs);
    waiting.set(tabId, (message) => {
      if (message.type === "progress") {
        if (message.text) onProgress(message.text);
        return;
      }
      if (message.type !== "result") return;
      clearTimeout(timer);
      waiting.delete(tabId);
      if (message.error) reject(new Error(message.error));
      else resolve(message.hash);
    });
  });
}

// --- Hourly sales sync --------------------------------------------------------
// Enabled from the app's extension page, which hands over the account's token
// (`chrome.storage.local.autoSync`: { account, label, token, appUrl }). Every
// hour the Reports of the last days are read in a background tab and posted
// to the app, which imports them and sends the Telegram alert of new sales.

const ALARM = "rdl-autosync";
const PERIOD_MINUTES = 60;

async function autoSyncState() {
  const { autoSync, autoSyncLastRun, rankLastRun } = await api.storage.local.get([
    "autoSync",
    "autoSyncLastRun",
    "rankLastRun",
  ]);
  return {
    config: autoSync
      ? { account: autoSync.account, label: autoSync.label, appUrl: autoSync.appUrl }
      : null,
    lastRun: autoSyncLastRun || null,
    rankLastRun: rankLastRun || null,
    running: busy,
  };
}

async function autoSyncCommand({ action, config }) {
  if (action === "set") {
    if (config && config.token && config.account && config.appUrl) {
      await api.storage.local.set({ autoSync: config, autoSyncLastRun: null });
      await api.alarms.create(ALARM, {
        periodInMinutes: PERIOD_MINUTES,
        delayInMinutes: PERIOD_MINUTES,
      });
    } else {
      await api.storage.local.remove(["autoSync", "autoSyncLastRun"]);
      await api.alarms.clear(ALARM);
    }
  } else if (action === "run") {
    await autoSyncNow();
  } else if (action === "ranks") {
    await ranksNow();
  }
  return { state: await autoSyncState() };
}

async function autoSyncNow({ ranks = false } = {}) {
  const { autoSync } = await api.storage.local.get("autoSync");
  if (!autoSync || busy) return;
  busy = true;
  const headers = {
    authorization: `Bearer ${autoSync.token}`,
    "content-type": "application/json",
  };
  const endpoint = `${autoSync.appUrl}/api/kdp/autosync`;
  const record = (ok, message) =>
    api.storage.local.set({ autoSyncLastRun: { at: new Date().toISOString(), ok, message } });
  try {
    const info = await fetch(endpoint, { headers });
    if (info.status === 401) {
      await record(false, "Collegamento non più valido: riattivalo dall'app.");
      return;
    }
    if (!info.ok) throw new Error(`L'app non risponde (HTTP ${info.status}).`);
    const { from } = await info.json();
    let body;
    try {
      body = { hash: await runStep("sales", { salesFrom: from }, () => {}, { quiet: true }) };
    } catch (error) {
      body = { error: error && error.message ? error.message : String(error) };
    }
    const res = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
    const reply = await res.json().catch(() => ({}));
    if (body.error) await record(false, body.error);
    else if (!res.ok)
      await record(false, reply.error || `Import non riuscito (HTTP ${res.status}).`);
    else
      await record(
        true,
        reply.newUnits
          ? `${reply.newUnits} ${reply.newUnits === 1 ? "nuova vendita" : "nuove vendite"}`
          : "Nessuna vendita nuova",
      );
    // Once a day (or when asked), the Amazon ranks and reviews.
    if (ranks) await readRanks(autoSync, headers).catch(() => {});
  } catch (error) {
    await record(false, error && error.message ? error.message : String(error));
  } finally {
    busy = false;
  }
}

api.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) void autoSyncNow({ ranks: true });
});

/** After a browser restart or an update the alarm must still be there. */
async function ensureAlarm() {
  const { autoSync } = await api.storage.local.get("autoSync");
  if (autoSync && !(await api.alarms.get(ALARM))) {
    await api.alarms.create(ALARM, { periodInMinutes: PERIOD_MINUTES, delayInMinutes: 1 });
  }
}
api.runtime.onStartup.addListener(() => void ensureAlarm());
api.runtime.onInstalled.addListener(() => void ensureAlarm());

// --- Daily Amazon rank and reviews ----------------------------------------------
// Once a day, after an hourly sync, the public product page of each live
// format is fetched (the browser's own session, a few seconds apart) and the
// small parts around the rank and reviews markers are sent to the app, which
// parses them (src/lib/amazon-rank.ts keeps the same labels).

const RANK_LABELS = [
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
const REVIEWS_MARKER = 'id="acrCustomerReviewText"';
const RATING_MARKER = 'id="acrPopover"';
const PAGE_GAP_MS = 4000;
const BATCH = 10;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const localDay = () => new Date().toLocaleDateString("sv-SE");

function around(html, marker, after) {
  const at = html.indexOf(marker);
  return at < 0 ? undefined : html.slice(Math.max(0, at - 40), at + after);
}

async function ranksNow() {
  const { autoSync } = await api.storage.local.get("autoSync");
  if (!autoSync || busy) return;
  busy = true;
  try {
    await readRanks(
      autoSync,
      { authorization: `Bearer ${autoSync.token}`, "content-type": "application/json" },
      { force: true },
    );
  } finally {
    busy = false;
  }
}

async function readRanks(autoSync, headers, { force = false } = {}) {
  const { rankDay } = await api.storage.local.get("rankDay");
  if (!force && rankDay === localDay()) return;
  const endpoint = `${autoSync.appUrl}/api/kdp/autosync/ranks`;
  const res = await fetch(endpoint, { headers });
  if (!res.ok) return;
  const { targets } = await res.json();
  const { rankUrls } = await api.storage.local.get("rankUrls");
  let items = [];
  const flush = async () => {
    if (!items.length) return;
    await fetch(endpoint, { method: "POST", headers, body: JSON.stringify({ items }) });
    items = [];
  };
  for (const target of targets || []) {
    // Test override of the product pages' host.
    const url = rankUrls ? `${rankUrls}/dp/${target.asin}` : target.url;
    let html;
    try {
      const page = await fetch(url, { credentials: "include" });
      html = await page.text();
    } catch {
      continue;
    }
    // A robot check: stop for today, try again tomorrow.
    if (/validateCaptcha|Type the characters you see/i.test(html)) break;
    const label = RANK_LABELS.find((l) => html.includes(l));
    items.push({
      asin: target.asin,
      market: target.market,
      rank: label ? around(html, label, 900) : undefined,
      reviews: around(html, REVIEWS_MARKER, 200),
      rating: around(html, RATING_MARKER, 300),
    });
    if (items.length >= BATCH) await flush();
    await sleep(PAGE_GAP_MS);
  }
  await flush();
  await api.storage.local.set({ rankDay: localDay(), rankLastRun: new Date().toISOString() });
}
