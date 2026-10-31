import { expect, test } from "./fixtures";
import { todayIn } from "../src/lib/kdp";
import { encodeImportHash } from "../src/lib/kdp-books";
import { addDays, encodeSalesHash } from "../src/lib/kdp-sales";

const today = todayIn(process.env.DEFAULT_TIME_ZONE ?? "Europe/Rome");
const asin = (prefix: string, stamp: number) => `${prefix}${String(stamp).slice(-8)}`.slice(0, 10);

test("the pen name tab compares pen names and lists every book of one", async ({ page }) => {
  const stamp = Date.now();
  const author = `Penna ${stamp}`;
  const sold = asin("P1", stamp);
  const idle = asin("P2", stamp);
  const book = (id: string, title: string, a: string) => ({
    kdpId: id,
    title,
    series: null,
    author: `${author} (Autore)`,
    formats: [{ format: "ebook", status: "Online", asin: a, price: "€2,99 EUR" }],
  });
  await page.goto(
    `/kdp/libri/importa#${encodeImportHash({
      v: 1,
      books: [
        book(`PA${stamp}`, `Venduto ${stamp}`, sold),
        book(`PB${stamp}`, `Fermo ${stamp}`, idle),
      ],
    })}`,
  );
  await page.getByRole("radio", { name: "Account principale" }).check();
  await page.getByRole("button", { name: "Importa" }).click();
  await expect(page).toHaveURL(/\/kdp\/libri$/);

  const fragment = await encodeSalesHash({
    v: 1,
    kind: "sales",
    currency: "EUR",
    from: addDays(today, -10),
    to: today,
    rows: [[addDays(today, -2), "Amazon.it", `DIGITAL=${sold}:::`, 3, 0, 0, 0, 6.3, 6.3, 0, 0, 0]],
  });
  await page.goto(`/kdp/vendite/importa#${fragment}`);
  await page.getByRole("radio", { name: "Account principale" }).check();
  await page.getByRole("button", { name: "Importa" }).click();
  await expect(page).toHaveURL(/\/kdp\/vendite$/);

  // The tab, from the KDP navigation.
  await page.getByRole("link", { name: "Pen name" }).click();
  await expect(page).toHaveURL(/\/kdp\/pen-name/);
  const row = page
    .getByTestId("pen-row")
    .filter({ has: page.getByRole("button", { name: author, exact: true }) });
  await expect(row).toContainText("1/2");
  await expect(row).toContainText("6,30");

  // The detail: both books, the unsold one too, each linking to its sales.
  await expect(async () => {
    await row.getByRole("button", { name: author }).click();
    await expect(page.getByTestId("pen-title")).toHaveText(author, { timeout: 1000 });
  }).toPass();
  await expect(page).toHaveURL(/pen=/);
  const books = page.getByTestId("pen-book");
  await expect(books).toHaveCount(2);
  await expect(books.first()).toContainText(`Venduto ${stamp}`);
  await expect(books.nth(1)).toContainText("nessuna vendita nel periodo");
  await expect(books.first().getByRole("link")).toHaveAttribute("href", /\/kdp\/vendite\?book=/);

  // The URL keeps the pen name.
  await page.reload();
  await expect(page.getByTestId("pen-title")).toHaveText(author);
});
