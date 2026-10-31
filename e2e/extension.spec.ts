import { mkdtemp } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";

import { type BrowserContext, chromium, expect, test as base } from "@playwright/test";
import { encode } from "next-auth/jwt";

import { addDays } from "../src/lib/kdp-sales";

/**
 * The browser extension, loaded in a persistent Chromium context, with the
 * KDP pages faked by a local server (the extension's `stepUrls` override):
 * the Bookshelf as HTML, the Reports endpoints as JSON. The app is the real
 * one.
 */

const EXTENSION = path.resolve("extension");
const COOKIE = "authjs.session-token";

const test = base.extend<{ context: BrowserContext }>({
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

test.setTimeout(150_000);

test("the extension reads the KDP pages in hidden tabs and the app imports both", async ({
  context,
  baseURL,
}) => {
  const stamp = Date.now();
  const asin = `B0${String(stamp).slice(-8)}`;
  const title = `Ext Book ${stamp}`;
  const yesterday = addDays(new Date().toISOString().slice(0, 10), -1);
  const month = yesterday.slice(0, 7);
  const key = `DIGITAL=${asin}:::`;

  // Fake KDP: one book on the Bookshelf, one month of sales on Amazon.it.
  const histogram = { title: month, data: [{ bin: "Amazon.it" }] };
  const json = (res: http.ServerResponse, data: unknown) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(data));
  };
  const server = http.createServer((req, res) => {
    const url = req.url ?? "/";
    if (url.startsWith("/bookshelf")) {
      res.setHeader("content-type", "text/html");
      return res.end(`<!doctype html><html><body><table class="refreshedbookshelftable"><tbody>
        <tr id="K${stamp}"><td><div>${title}</div><div>by E2E</div>
        <div>Kindle eBook</div><div>Live</div><div>ASIN: ${asin}</div><div>€4,99 EUR</div></td></tr>
      </tbody></table></body></html>`);
    }
    if (req.method !== "POST") {
      res.setHeader("content-type", "text/html");
      return res.end("<!doctype html><title>Reports</title>");
    }
    if (url.endsWith("marketplaceHistogramV2")) {
      return json(res, { nestedHistogram: { histogramList: [histogram] } });
    }
    if (url.endsWith("orders/view/compare")) {
      return json(res, {
        x: {
          histogramList: [{ title: yesterday, data: [{ bin: key, values: { DigitalOrders: 2 } }] }],
        },
      });
    }
    if (url.endsWith("royalties/chart/tooltip/titles")) {
      return json(res, {
        x: {
          histogramList: [
            {
              title: yesterday,
              data: [{ bin: key, values: { TotalRoyalties: 4.5, DigitalRoyalties: 4.5 } }],
            },
          ],
        },
      });
    }
    return json(res, { x: { histogramList: [] } });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const fake = `http://localhost:${(server.address() as AddressInfo).port}`;

  try {
    // Point the extension at the fake pages (a developer override in its storage).
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent("serviceworker");
    await worker.evaluate(
      (urls) => {
        const api = (
          globalThis as unknown as {
            chrome: { storage: { local: { set(v: unknown): Promise<void> } } };
          }
        ).chrome;
        return api.storage.local.set({ stepUrls: urls });
      },
      {
        books: `${fake}/bookshelf`,
        sales: `${fake}/dashboard`,
      },
    );

    const page = await context.newPage();
    await page.goto(`${baseURL}/kdp`);
    await expect(page.locator("html")).toHaveAttribute("data-rdl-kdp-extension", /\d/);
    // In-app navigation: the dialog button needs the page hydrated.
    await page.getByRole("link", { name: "Vendite" }).click();
    await page.getByRole("button", { name: "Aggiorna dati" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Estensione «RDL KDP Sync» attiva");
    // The loaded extension is the published one: no update notice, a link to the page.
    await expect(dialog.getByTestId("extension-outdated")).toHaveCount(0);
    await expect(dialog.getByRole("link", { name: "Scarica o aggiorna" })).toHaveAttribute(
      "href",
      "/kdp/estensione",
    );
    await dialog.getByRole("radio", { name: "Account secondario" }).check();
    await dialog.getByTestId("extension-sync").click();

    // Each step ends done or in error: wait for the end, then the failure shows its message.
    const steps = dialog.getByTestId("extension-steps");
    for (const [step, text] of [
      ["sales", "2 copie, 4,50 € di royalty"],
      ["books", "1 nuovi"],
    ]) {
      const row = steps.locator(`[data-step="${step}"]`);
      await expect(row)
        .toHaveAttribute("data-status", /done|error/, { timeout: 90_000 })
        .catch(async (error: Error) => {
          throw new Error(`${step} still running: ${await row.innerText()}\n${error.message}`);
        });
      await expect(row).toContainText(text);
      await expect(row).toHaveAttribute("data-status", "done");
    }
    // A clean run closes the dialog; the page shows the imported book with its sales.
    await expect(dialog).toBeHidden();
    await page.getByRole("combobox", { name: "Account" }).click();
    await page.getByRole("option", { name: "Account secondario" }).click();
    await expect(page.getByTestId("sales-books")).toContainText(title);
  } finally {
    server.close();
  }
});
