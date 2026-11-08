import "dotenv/config";

import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
/** Kept in sync with e2e/content-reminder.spec.ts. */
const TELEGRAM_STUB_PORT = 4599;
/** Kept in sync with e2e/youtube.spec.ts. */
const YOUTUBE_STUB_PORT = 4600;
/** Kept in sync with e2e/backup.spec.ts. */
const GOOGLE_STUB_PORT = 4601;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  // The dev server compiles routes on first hit.
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    // Optional override when the bundled browser is unavailable (e.g. sandboxed envs).
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: process.env.CI ? "pnpm build && pnpm start" : "pnpm dev",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // Telegram calls go to the stub started by e2e/content-reminder.spec.ts.
    // YouTube calls go to the stub of e2e/youtube.spec.ts.
    env: {
      TELEGRAM_API_URL: `http://localhost:${TELEGRAM_STUB_PORT}`,
      YOUTUBE_API_URL: `http://localhost:${YOUTUBE_STUB_PORT}`,
      // Google Drive backup against the stub of e2e/backup.spec.ts.
      GOOGLE_AUTH_URL: `http://localhost:${GOOGLE_STUB_PORT}`,
      GOOGLE_TOKEN_URL: `http://localhost:${GOOGLE_STUB_PORT}`,
      GOOGLE_API_URL: `http://localhost:${GOOGLE_STUB_PORT}`,
      AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID ?? "e2e-google-client",
      AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET ?? "e2e-google-secret",
    },
  },
});
