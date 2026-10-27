import { expect, test } from "./fixtures";
import { todayIn } from "../src/lib/kdp";
import { encodeImportHash } from "../src/lib/kdp-books";
import { addDays, encodeSalesHash } from "../src/lib/kdp-sales";

const today = todayIn(process.env.DEFAULT_TIME_ZONE ?? "Europe/Rome");

test("the launcher's tab chains books and sales into one sync", async ({ page }) => {
  const stamp = Date.now();
  const asin = `B0${String(stamp).slice(-8)}`;
  // The launcher names the tab before handing over; here the hash is built by hand.
  await page.goto("/kdp/libri");
  await page.evaluate(() => {
    window.name = "rdl-kdp-sync";
    localStorage.removeItem("kdp.sync");
  });

  // Step 1: books.
  const books = [
    {
      kdpId: `S${stamp}`,
      title: `Sync Test ${stamp}`,
      series: null,
      formats: [{ format: "ebook", status: "Online", asin, price: "€4,99 EUR" }],
    },
  ];
  await page.goto(`/kdp/libri/importa#${encodeImportHash({ v: 1, books })}`);
  await expect(page.getByTestId("sync-step")).toHaveText(/passo 1 di 2/);
  await page.getByRole("radio", { name: "Account secondario" }).check();
  await page.getByRole("button", { name: "Importa" }).click();
  const next = page.getByTestId("sync-next-step");
  await expect(next).toContainText("Passo 1 di 2 fatto");
  await next.getByRole("button", { name: "Aspetta" }).click();
  await expect(page.getByTestId("sync-next-link")).toHaveAttribute(
    "href",
    "https://kdpreports.amazon.com/",
  );
  await expect(page).toHaveURL(/\/kdp\/libri\/importa$/);

  // Step 2: sales of titles the app does not know, so the account comes from the sync.
  const fragment = await encodeSalesHash({
    v: 1,
    kind: "sales",
    currency: "EUR",
    from: addDays(today, -30),
    to: today,
    rows: [
      [addDays(today, -2), "Amazon.it", `DIGITAL=X${asin.slice(2)}:::`, 1, 0, 0, 0, 2, 2, 0, 0, 0],
    ],
  });
  await page.goto(`/kdp/vendite/importa#${fragment}`);
  await expect(page.getByTestId("sync-step")).toHaveText(/passo 2 di 2/);
  await expect(page.getByTestId("account-hint")).toBeVisible();
  await expect(page.getByRole("radio", { name: "Account secondario" })).toBeChecked();
  await page.getByRole("button", { name: "Importa" }).click();
  await expect(page).toHaveURL(/\/kdp\/vendite\?account=secondary$/);
  await expect(page.getByText("Sincronizzazione completa")).toBeVisible();
  expect(await page.evaluate(() => [window.name, localStorage.getItem("kdp.sync")])).toEqual([
    "",
    null,
  ]);
});
