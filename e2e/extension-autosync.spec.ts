import http from "node:http";
import type { AddressInfo } from "node:net";

import { expect } from "@playwright/test";

import { addDays } from "../src/lib/kdp-sales";
import { encodeImportHash } from "../src/lib/kdp-books";
import { setExtensionStorage, setStepUrls, test } from "./extension-fixture";

// One KDP read per check, two checks, on a busy CI runner.
test.setTimeout(300_000);

test("the hourly sync reads the Reports in the background and counts the new sales", async ({
  context,
  baseURL,
}) => {
  const stamp = Date.now();
  const asin = `B1${String(stamp).slice(-8)}`;
  const today = new Date().toISOString().slice(0, 10);
  const day = addDays(today, -1);
  const key = `DIGITAL=${asin}:::`;
  // Copies sold yesterday, as the fake Reports show them: they grow between checks.
  let units = 2;

  const json = (res: http.ServerResponse, data: unknown) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(data));
  };
  // The public Amazon page of the book imported below.
  const rankAsin = `R${String(stamp).slice(-9)}`;
  const bookTitle = `Classifica ${stamp}`;
  const server = http.createServer((req, res) => {
    const url = req.url ?? "/";
    if (url.startsWith("/dp/")) {
      res.setHeader("content-type", "text/html");
      return res.end(`<!doctype html><html><body>
        <span id="acrPopover" class="reviewCountTextLinkedHistogram" title="4,5 su 5 stelle"></span>
        <span id="acrCustomerReviewText" class="a-size-base">7 voti</span>
        <ul><li><span class="a-text-bold">Posizione nella classifica Bestseller di Amazon:</span>
        n.12.345 in Kindle Store (<a href="/top">Visualizza i Top 100</a>)
        <ul><li>n.3 in Gialli</li></ul></li></ul></body></html>`);
    }
    if (req.method !== "POST") {
      res.setHeader("content-type", "text/html");
      return res.end("<!doctype html><title>Reports</title>");
    }
    if (url.endsWith("marketplaceHistogramV2")) {
      return json(res, {
        nestedHistogram: {
          histogramList: [{ title: day.slice(0, 7), data: [{ bin: "Amazon.it" }] }],
        },
      });
    }
    if (url.endsWith("orders/view/compare")) {
      return json(res, {
        x: {
          histogramList: [{ title: day, data: [{ bin: key, values: { DigitalOrders: units } }] }],
        },
      });
    }
    if (url.endsWith("royalties/chart/tooltip/titles")) {
      return json(res, {
        x: {
          histogramList: [
            {
              title: day,
              data: [
                { bin: key, values: { TotalRoyalties: units * 2, DigitalRoyalties: units * 2 } },
              ],
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
    await setStepUrls(context, { sales: `${fake}/dashboard` });
    const page = await context.newPage();

    // Without the extension's token the endpoint refuses.
    expect((await page.request.get(`${baseURL}/api/kdp/autosync`)).status()).toBe(401);

    await page.goto(`${baseURL}/kdp/estensione`);
    const panel = page.getByTestId("autosync-panel");
    const local = panel.getByTestId("autosync-local");
    // A previous run of this test may have left it on: start from off.
    const off = panel.getByRole("button", { name: "Disattiva in questo browser" });
    if (await off.isVisible()) await off.click();

    await panel.getByRole("radio", { name: "Mario" }).check();
    await panel.getByRole("button", { name: "Attiva in questo browser" }).click();
    await expect(local).toContainText("attivo per Mario");

    // First check: the title is new, so its sales import (an alert only if Mario had sales before).
    await panel.getByRole("button", { name: "Controlla ora" }).click();
    await expect(local).toContainText("Ultimo controllo", { timeout: 120_000 });
    await expect(local).not.toContainText("Collegamento non più valido");

    // KDP shows one more copy: the next check reports exactly that one.
    units = 3;
    await panel.getByRole("button", { name: "Controlla ora" }).click();
    await expect(local).toContainText("1 nuova vendita", { timeout: 120_000 });
    await expect(panel.getByTestId("autosync-accounts")).toContainText("Mario");
    await expect(panel.getByTestId("autosync-accounts")).toContainText("1 nuova vendita: 1 ebook");

    // The daily Amazon read, on demand: a live book of Mario gets its rank and reviews.
    const payload = {
      v: 1 as const,
      books: [
        {
          kdpId: `RK${stamp}`,
          title: bookTitle,
          series: null,
          author: "Mario E2E",
          formats: [
            { format: "ebook" as const, status: "Online", asin: rankAsin, price: "€2,99 EUR" },
          ],
        },
      ],
    };
    await page.goto(`${baseURL}/kdp/libri/importa#${encodeImportHash(payload)}`);
    await page.getByRole("radio", { name: "Mario" }).check();
    await page.getByRole("button", { name: "Importa" }).click();
    await expect(page).toHaveURL(/\/kdp\/libri$/);
    await setExtensionStorage(context, { rankUrls: fake });
    await page.goto(`${baseURL}/kdp/estensione`);
    await panel.getByRole("button", { name: "Leggi classifica e valutazioni" }).click();
    await expect(page.getByText("Classifica e valutazioni lette", { exact: true })).toBeVisible({
      timeout: 240_000,
    });
    await page.goto(`${baseURL}/kdp/libri`);
    const book = page
      .getByTestId("kdp-book")
      .filter({ has: page.getByRole("heading", { name: bookTitle, exact: true }) });
    await expect(book.getByTestId("book-ranks")).toContainText("BSR n.12.345 in Kindle Store");
    await expect(book.getByTestId("book-ranks")).toContainText("7 valutazioni (4,5★)");
    await page.goto(`${baseURL}/kdp/estensione`);

    // Off: the token stops working and the browser forgets it.
    await panel.getByRole("button", { name: "Disattiva in questo browser" }).click();
    await expect(panel.getByRole("button", { name: "Attiva in questo browser" })).toBeVisible();
  } finally {
    server.close();
  }
});
