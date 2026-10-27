// Content script on the app's pages: tells the app the extension is there
// and relays sync requests and their progress between page and background.
(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  const version = api.runtime.getManifest().version;
  document.documentElement.dataset.rdlKdpExtension = version;
  window.dispatchEvent(new CustomEvent("rdl-kdp:ready", { detail: { version } }));

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (event.source !== window || !data || data.type !== "rdl-kdp:sync") return;
    api.runtime
      .sendMessage({ type: "sync", requestId: data.requestId, steps: data.steps })
      .catch((error) => {
        window.postMessage(
          {
            type: "rdl-kdp:done",
            requestId: data.requestId,
            error: String(error?.message ?? error),
          },
          location.origin,
        );
      });
  });

  api.runtime.onMessage.addListener((message) => {
    if (message && typeof message.type === "string" && message.type.startsWith("rdl-kdp:")) {
      window.postMessage(message, location.origin);
    }
  });
})();
