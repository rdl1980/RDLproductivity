import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { type BrowserContext, chromium, test as base } from "@playwright/test";
import { encode } from "next-auth/jwt";

/**
 * The browser extension, loaded in a persistent Chromium context with an
 * authenticated app session. The KDP pages are faked by each test with a
 * local server, through the extension's `stepUrls` override.
 */
const EXTENSION = path.resolve("extension");
const COOKIE = "authjs.session-token";

export const test = base.extend<{ context: BrowserContext }>({
  context: async ({ baseURL }, provide) => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "rdl-ext-"));
    const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    const context = await chromium.launchPersistentContext(dir, {
      headless: true,
      ...(executablePath ? { executablePath } : { channel: "chromium" }),
      args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
    });
    const secret = process.env.AUTH_SECRET;
    if (!secret) throw new Error("AUTH_SECRET must be set to run authenticated e2e tests");
    const value = await encode({
      token: { sub: "e2e", name: "E2E", email: "e2e@example.com" },
      secret,
      salt: COOKIE,
    });
    await context.addCookies([{ name: COOKIE, value, url: baseURL! }]);
    await provide(context);
    await context.close();
  },
});

/** Points the extension at fake KDP pages (a developer override in its storage). */
export async function setStepUrls(
  context: BrowserContext,
  urls: { books?: string; sales?: string },
): Promise<void> {
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent("serviceworker");
  await worker.evaluate((stepUrls) => {
    const api = (
      globalThis as unknown as {
        chrome: { storage: { local: { set(v: unknown): Promise<void> } } };
      }
    ).chrome;
    return api.storage.local.set({ stepUrls });
  }, urls);
}
