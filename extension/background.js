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

api.runtime.onMessage.addListener((message, sender) => {
  if (!message || !sender.tab) return;
  if (message.type === "sync") {
    void runSync(sender.tab.id, message);
    return;
  }
  const listener = waiting.get(sender.tab.id);
  if (listener) listener(message);
});

const send = (tabId, message) => api.tabs.sendMessage(tabId, message).catch(() => {});

async function runSync(appTabId, { requestId, steps }) {
  for (const step of steps) {
    if (!STEPS[step]) continue;
    const progress = (status, message) =>
      send(appTabId, { type: "rdl-kdp:progress", requestId, step, status, message });
    progress("opening", `Apro ${STEPS[step].label} di KDP…`);
    try {
      const hash = await runStep(step, (text) => progress("reading", text));
      await send(appTabId, { type: "rdl-kdp:result", requestId, step, hash });
    } catch (error) {
      await send(appTabId, {
        type: "rdl-kdp:result",
        requestId,
        step,
        error: error && error.message ? error.message : String(error),
      });
    }
  }
  await send(appTabId, { type: "rdl-kdp:done", requestId });
}

/** Developer override of the pages' URLs (`chrome.storage.local.stepUrls`), used by the tests. */
async function stepUrl(step) {
  const { stepUrls } = await api.storage.local.get("stepUrls");
  return (stepUrls && stepUrls[step]) || STEPS[step].url;
}

async function runStep(step, onProgress) {
  const { file, timeoutMs } = STEPS[step];
  const tab = await api.tabs.create({ url: await stepUrl(step), active: false });
  let keepOpen = false;
  try {
    await waitForLoad(tab.id);
    const loaded = await api.tabs.get(tab.id);
    if (!loaded.url || SIGN_IN.test(loaded.url)) {
      keepOpen = true;
      await api.tabs.update(tab.id, { active: true });
      throw new Error("Accedi a KDP nella scheda appena aperta, poi riprova.");
    }
    const result = waitForResult(tab.id, timeoutMs, onProgress);
    try {
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
