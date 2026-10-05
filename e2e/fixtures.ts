import { test as base, type Page } from "@playwright/test";
import { encode } from "next-auth/jwt";

const COOKIE = "authjs.session-token";

/** A `test` whose pages carry a valid Auth.js session cookie. */
const pendingSaves = new WeakMap<Page, () => number>();

/** Server Action calls (POST requests) still in flight on `page`. */
export function pendingSaveCount(page: Page): number {
  return pendingSaves.get(page)?.() ?? 0;
}

export const test = base.extend({
  page: async ({ page }, provide) => {
    let pending = 0;
    const isSave = (method: string) => method === "POST";
    page.on("request", (request) => isSave(request.method()) && pending++);
    page.on("requestfinished", (request) => isSave(request.method()) && pending--);
    page.on("requestfailed", (request) => isSave(request.method()) && pending--);
    pendingSaves.set(page, () => pending);
    await provide(page);
  },
  context: async ({ context, baseURL }, provide) => {
    const secret = process.env.AUTH_SECRET;
    if (!secret) throw new Error("AUTH_SECRET must be set to run authenticated e2e tests");
    const value = await encode({
      token: { sub: "e2e", name: "E2E", email: "e2e@example.com" },
      secret,
      salt: COOKIE,
    });
    await context.addCookies([{ name: COOKIE, value, url: baseURL! }]);
    await provide(context);
  },
});

export { expect } from "@playwright/test";
