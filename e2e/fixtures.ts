import { test as base } from "@playwright/test";
import { encode } from "next-auth/jwt";

const COOKIE = "authjs.session-token";

/** A `test` whose pages carry a valid Auth.js session cookie. */
export const test = base.extend({
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
