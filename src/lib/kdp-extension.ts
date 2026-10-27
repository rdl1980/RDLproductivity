"use client";

import { useSyncExternalStore } from "react";

import type { SyncStep } from "./kdp-sync";

/**
 * Talks to the "RDL KDP Sync" browser extension (see `extension/`): its
 * content script marks the document and relays messages posted on
 * `window` to the background, which reads the KDP pages in hidden tabs.
 */

const ATTRIBUTE = "rdlKdpExtension";

/** Version of the installed extension, or null. */
export function useKdpExtension(): string | null {
  return useSyncExternalStore(
    (notify) => {
      window.addEventListener("rdl-kdp:ready", notify);
      return () => window.removeEventListener("rdl-kdp:ready", notify);
    },
    () => document.documentElement.dataset[ATTRIBUTE] ?? null,
    () => null,
  );
}

export type ExtensionEvent =
  | { type: "progress"; step: SyncStep; status: "opening" | "reading"; message: string }
  | { type: "result"; step: SyncStep; hash?: string; error?: string }
  | { type: "done"; error?: string };

/**
 * Asks the extension to read the given KDP pages; `onEvent` gets progress,
 * one result per step (the hash the bookmarklet would put in the URL, or an
 * error) and a final "done". Resolves at "done".
 */
export function runExtensionSync(
  steps: SyncStep[],
  onEvent: (event: ExtensionEvent) => void | Promise<void>,
): Promise<void> {
  const requestId = crypto.randomUUID();
  return new Promise((resolve) => {
    let chain = Promise.resolve();
    const listener = (event: MessageEvent) => {
      const data = event.data as { type?: string; requestId?: string } | null;
      if (event.source !== window || !data || data.requestId !== requestId) return;
      if (typeof data.type !== "string" || !data.type.startsWith("rdl-kdp:")) return;
      const { type: raw, ...rest } = data as Record<string, unknown>;
      const type = (raw as string).slice("rdl-kdp:".length);
      if (type !== "progress" && type !== "result" && type !== "done") return;
      // Results are handled one after the other (each one imports).
      chain = chain.then(() => onEvent({ ...rest, type } as ExtensionEvent));
      if (type === "done") {
        window.removeEventListener("message", listener);
        void chain.then(resolve);
      }
    };
    window.addEventListener("message", listener);
    window.postMessage({ type: "rdl-kdp:sync", requestId, steps }, window.location.origin);
  });
}

export const EXTENSION_ACCOUNT_KEY = "kdp.extension.account";
