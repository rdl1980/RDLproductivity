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
  await page.getByRole("radio", { name: "Rosario" }).check();
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
  await page.getByRole("radio", { name: "Rosario" }).check();
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

  // An unsold book opens Vendite on that book, named in the picker (not a blank filter).
  await books.nth(1).getByRole("link").click();
  await expect(page).toHaveURL(/\/kdp\/vendite\?book=/);
  await expect(page.getByRole("combobox", { name: "Libro" })).toHaveText(`Fermo ${stamp}`);
  await expect(page.getByTestId("sales-hero")).toHaveText("0,00 €");

  // A book nobody knows is ignored instead of emptying every number.
  await page.goto("/kdp/vendite?book=sconosciuto&period=all");
  await expect(page.getByRole("combobox", { name: "Libro" })).toHaveText("Tutti i libri");
});

test("the pen name registry keeps contacts and lists the published books by format", async ({
  page,
}) => {
  const stamp = Date.now();
  const author = `Registro ${stamp}`;
  const asin = `R${String(stamp).slice(-9)}`;
  await page.goto(
    `/kdp/libri/importa#${encodeImportHash({
      v: 1,
      books: [
        {
          kdpId: `RG${stamp}`,
          title: `Pubblicato ${stamp}`,
          series: null,
          author,
          formats: [
            { format: "ebook", status: "Live", asin, price: "€2,99 EUR" },
            { format: "paperback", status: "Draft", asin: null, price: null },
          ],
        },
      ],
    })}`,
  );
  await page.getByRole("radio", { name: "Rosario" }).check();
  await page.getByRole("button", { name: "Importa" }).click();
  await expect(page).toHaveURL(/\/kdp\/libri$/);

  // Sub-tab of Pen name.
  await page.goto("/kdp/pen-name");
  await page
    .getByRole("navigation", { name: "Sezioni Pen name" })
    .getByRole("link", { name: "Anagrafica" })
    .click();
  await expect(page).toHaveURL(/\/kdp\/pen-name\/anagrafica/);

  const card = page
    .getByTestId("pen-card")
    .filter({ has: page.getByText(author, { exact: true }) });
  // Parallel tests import Rosario's Bookshelf too, which can mark this book as gone.
  await expect(card).toContainText(/[01]\/1 pubblicati/);
  await expect(async () => {
    await card.click();
    await expect(page.getByTestId("pen-dialog")).toBeVisible({ timeout: 1000 });
  }).toPass();
  const dialog = page.getByTestId("pen-dialog");
  await expect(dialog.getByRole("heading", { name: author })).toBeVisible();

  // The book with its formats (in the published list, or among the others if marked gone).
  await expect(dialog).toContainText(`Pubblicato ${stamp}`);
  await expect(dialog).toContainText("eBook");
  await expect(dialog).toContainText("Online");
  await expect(dialog).toContainText("Cartaceo");
  await expect(dialog).toContainText(asin);

  // Contacts are saved and shown on the card.
  await dialog.getByLabel("Email di contatto", { exact: true }).fill(`autore${stamp}@example.com`);
  await dialog
    .getByLabel("Sito internet", { exact: true })
    .fill(`https://registro${stamp}.example.com`);
  await dialog.getByRole("button", { name: "Salva anagrafica" }).click();
  await expect(page.getByText("Anagrafica salvata")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(card).toContainText(`autore${stamp}@example.com`);
  await expect(card).toContainText(`registro${stamp}.example.com`);

  // An invalid link is refused with its message.
  await card.click();
  await dialog.getByLabel("Sito internet", { exact: true }).fill("registro.example.com");
  await dialog.getByRole("button", { name: "Salva anagrafica" }).click();
  await expect(page.getByText(/Indirizzo non valido/)).toBeVisible();
});
