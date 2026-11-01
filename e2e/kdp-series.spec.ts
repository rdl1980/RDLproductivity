import { expect, test } from "./fixtures";
import { expectPersisted } from "./helpers";
import { encodeImportHash } from "../src/lib/kdp-books";
import { addDays, encodeSalesHash } from "../src/lib/kdp-sales";

const today = new Date().toISOString().slice(0, 10);

test("series read-through and price history", async ({ page }) => {
  const stamp = Date.now();
  const series = `Saga Test ${stamp}`;
  const asins = ["1", "2", "3"].map((n) => `B${n}${String(stamp).slice(-8)}`);
  const books = (price: string) =>
    asins.map((asin, i) => ({
      kdpId: `S${i}${stamp}`,
      title: `${series} - Libro ${i + 1}`,
      series: `Libro in ${series}`,
      formats: [{ format: "ebook", status: "Online", asin, price }],
    }));
  const importBooks = async (price: string) => {
    await page.goto(`/kdp/libri/importa#${encodeImportHash({ v: 1, books: books(price) })}`);
    await page.getByRole("radio", { name: "Rosario" }).check();
    await page.getByRole("button", { name: "Importa" }).click();
    await expect(page).toHaveURL(/\/kdp\/libri$/);
  };
  await importBooks("€2,99 EUR");

  // The volume is read from the title and can be overridden.
  const row = (i: number) =>
    page
      .getByTestId("kdp-book")
      .filter({ has: page.getByRole("heading", { name: `${series} - Libro ${i}`, exact: true }) });
  await expect(row(2).getByRole("textbox", { name: /^Volume di/ })).toHaveAttribute(
    "placeholder",
    "2",
  );
  await row(3)
    .getByRole("textbox", { name: /^Volume di/ })
    .fill("30");
  await row(3)
    .getByRole("textbox", { name: /^Volume di/ })
    .press("Enter");
  // The save runs on blur, in the background: reload until it is there.
  await expectPersisted(page, () =>
    expect(row(3).getByRole("textbox", { name: /^Volume di/ })).toHaveValue("30"),
  );

  const units = [10, 6, 3];
  const fragment = await encodeSalesHash({
    v: 1,
    kind: "sales",
    currency: "EUR",
    from: addDays(today, -20),
    to: today,
    rows: [
      ...asins.map((asin, i) => [
        addDays(today, -15),
        "Amazon.it",
        `DIGITAL=${asin}::`,
        units[i],
        0,
        0,
        0,
        units[i],
        units[i],
        0,
        0,
        0,
      ]),
      [addDays(today, -1), "Amazon.it", `DIGITAL=${asins[0]}::`, 2, 0, 0, 0, 3, 3, 0, 0, 0],
    ],
  });
  await page.goto(`/kdp/vendite/importa#${fragment}`);
  await page.getByRole("radio", { name: "Rosario" }).check();
  await page.getByRole("button", { name: "Importa" }).click();
  await expect(page).toHaveURL(/\/kdp\/vendite$/);

  // Read-through: 12 → 6 → 3 copies, so 50% and 50%, 25% overall.
  const readThrough = page.getByTestId("read-through");
  const report = readThrough.locator("div").filter({ hasText: series }).first();
  await expect(report).toContainText("dal primo all'ultimo volume 25%");
  await expect(report.getByRole("listitem").nth(1)).toContainText("→ 50%");
  await expect(report.getByRole("listitem").nth(2)).toContainText("Vol. 30");

  // A second Bookshelf import with a new price adds a price change.
  await importBooks("€3,99 EUR");
  // In-app navigation: a fresh load could get the click before hydration.
  await page.getByRole("link", { name: "Vendite", exact: true }).click();
  await expect(page).toHaveURL(/\/kdp\/vendite$/);
  await page.getByRole("combobox", { name: "Libro" }).click();
  await page.getByRole("option", { name: `${series} - Libro 1` }).click();
  const history = page.getByTestId("price-history");
  await expect(history).toContainText("€2,99 EUR (primo prezzo visto)");
  await expect(history).toContainText("€2,99 EUR → €3,99 EUR");
  await expect(history).toContainText("copie/giorno");
});
