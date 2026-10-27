import type { KdpAccount } from "./kdp";

/**
 * Full sync with the one bookmarklet: books from the Bookshelf and sales
 * from the Reports, in either order, with one click per Amazon page. The
 * bookmarklet marks the tab (`window.name` survives navigation across
 * sites); the app remembers what is done in localStorage and sends the tab
 * to the other Amazon page after the first import.
 */

/** Value the launcher gives `window.name`. */
export const SYNC_WINDOW_NAME = "rdl-kdp-sync";
export const SYNC_KEY = "kdp.sync";
/** A sync older than this is forgotten. */
export const SYNC_TTL_MS = 60 * 60 * 1000;

export type SyncStep = "books" | "sales";

export type SyncState = {
  /** Account chosen at the first step; the second preselects it. */
  account: KdpAccount;
  done: SyncStep[];
  /** Epoch ms of the last step. */
  at: number;
};

export const STEP_PAGES: Record<SyncStep, { url: string; label: string; what: string }> = {
  books: { url: "https://kdp.amazon.com/bookshelf", label: "Bookshelf di KDP", what: "i libri" },
  sales: { url: "https://kdpreports.amazon.com/", label: "Report di KDP", what: "le vendite" },
};

export const otherStep = (step: SyncStep): SyncStep => (step === "books" ? "sales" : "books");

/** Whether this tab was opened by the launcher bookmarklet. */
export function isSyncTab(): boolean {
  try {
    return window.name === SYNC_WINDOW_NAME;
  } catch {
    return false;
  }
}

export function readSync(now = Date.now()): SyncState | null {
  try {
    const raw = localStorage.getItem(SYNC_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as SyncState;
    if (now - state.at > SYNC_TTL_MS) {
      localStorage.removeItem(SYNC_KEY);
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

/** Records `step` as done; a step done in an earlier, unfinished sync stays done. */
export function markSyncStep(step: SyncStep, account: KdpAccount, now = Date.now()): SyncState {
  const previous = readSync(now);
  const state: SyncState = {
    account,
    done: [...new Set([...(previous?.done ?? []), step])],
    at: now,
  };
  try {
    localStorage.setItem(SYNC_KEY, JSON.stringify(state));
  } catch {
    // Private mode or storage off: the sync just will not chain.
  }
  return state;
}

/** Where a full sync stands when an import page opens in the launcher's tab; null elsewhere. */
export function detectSync(step: SyncStep): { step: 1 | 2; account: KdpAccount | null } | null {
  if (!isSyncTab()) return null;
  const previous = readSync();
  const otherDone = previous?.done.includes(otherStep(step)) ?? false;
  return { step: otherDone ? 2 : 1, account: otherDone ? previous!.account : null };
}

/** Forgets the sync and releases the tab. */
export function finishSync() {
  try {
    localStorage.removeItem(SYNC_KEY);
  } catch {
    // ignore
  }
  try {
    if (window.name === SYNC_WINDOW_NAME) window.name = "";
  } catch {
    // ignore
  }
}
