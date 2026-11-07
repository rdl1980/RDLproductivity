import http from "node:http";
import type { AddressInfo } from "node:net";

import { expect } from "@playwright/test";

import { addDays } from "../src/lib/kdp-sales";
import { setStepUrls, test } from "./extension-fixture";

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
  const server = http.createServer((req, res) => {
    const url = req.url ?? "/";
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

    // Off: the token stops working and the browser forgets it.
    await panel.getByRole("button", { name: "Disattiva in questo browser" }).click();
    await expect(panel.getByRole("button", { name: "Attiva in questo browser" })).toBeVisible();
  } finally {
    server.close();
  }
});
