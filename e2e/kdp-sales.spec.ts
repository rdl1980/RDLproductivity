import { expect, test } from "./fixtures";
import { addCards, addLists, cardIn, createBoard, expectPersisted, list, settle } from "./helpers";
import { weekStartOf, todayIn, weekRangeLabel } from "../src/lib/kdp";
import { encodeImportHash } from "../src/lib/kdp-books";
import { addDays, encodeSalesHash } from "../src/lib/kdp-sales";

const today = todayIn(process.env.DEFAULT_TIME_ZONE ?? "Europe/Rome");

/** Ten-character ASIN unique to this run. */
const asin = (prefix: string, stamp: number) => `${prefix}${String(stamp).slice(-8)}`.slice(0, 10);

async function importBooks(
  page: import("@playwright/test").Page,
  account: "Account principale" | "Account secondario",
  books: unknown[],
) {
  await page.goto(`/kdp/libri/importa#${encodeImportHash({ v: 1, books })}`);
  await page.getByRole("radio", { name: account }).check();
  await page.getByRole("button", { name: "Importa" }).click();
  await expect(page).toHaveURL(/\/kdp\/libri$/);
}

test("KDP sales: import the report history and explore the dashboard", async ({ page }) => {
  const stamp = Date.now();
  const title = `Vendite Test ${stamp}`;
  const ebook = asin("B1", stamp);
  const paper = asin("B2", stamp);
  await importBooks(page, "Account principale", [
    {
      kdpId: `S${stamp}`,
      title: `${title}: Un libro di prova`,
      series: null,
      author: `Autrice ${stamp} (Autore)`,
      formats: [
        { format: "ebook", status: "Online", asin: ebook, price: "€4,99 EUR" },
        { format: "paperback", status: "Online", asin: paper, price: "€12,99 EUR" },
      ],
    },
  ]);

  const key = `DIGITAL=${ebook}:PRINT=${paper}::`;
  const rows = [
    [addDays(today, -3), "Amazon.it", key, 1, 2, 0, 120, 10.5, 2.5, 7.5, 0, 0.5],
    [addDays(today, -1), "Amazon.com", key, 0, 1, 0, 0, 4.25, 0, 4.25, 0, 0],
  ];
  const fragment = await encodeSalesHash({
    v: 1,
    kind: "sales",
    currency: "EUR",
    from: addDays(today, -30),
    to: today,
    rows,
  });

  await page.goto(`/kdp/vendite/importa#${fragment}`);
  await expect(page.getByTestId("sales-import-summary")).toContainText("14,75");
  await page.getByRole("radio", { name: "Account principale" }).check();
  await page.getByRole("button", { name: "Importa" }).click();
  await expect(page).toHaveURL(/\/kdp\/vendite$/);

  // The book's own numbers, whatever else the database holds.
  await page.getByRole("combobox", { name: "Libro" }).click();
  await page.getByRole("option", { name: title }).click();
  await expect(page).toHaveURL(/book=/);
  await expect(page.getByTestId("sales-hero")).toHaveText("14,75 €");
  // Split by pen name, read from the Bookshelf's "by" line.
  await expect(page.getByRole("region", { name: "Per pen name" })).toContainText(
    `Autrice ${stamp}`,
  );
  const kpis = page.getByTestId("sales-kpis");
  await expect(kpis.getByTestId("stat-tile").filter({ hasText: "Copie vendute" })).toContainText(
    "4",
  );
  await expect(kpis.getByTestId("stat-tile").filter({ hasText: "Pagine KENP" })).toContainText(
    "120",
  );

  // The month forecast follows the book filter: this book sold 14,75 € this month.
  const forecastTile = page.getByTestId("forecast-tile");
  await expect(forecastTile).toContainText("Previsione del mese");
  await expect(forecastTile).toContainText("Finora 14,75");

  // Month to date: from the first of the month to today, kept in the URL.
  await page.getByRole("combobox", { name: "Periodo" }).click();
  await page.getByRole("option", { name: "Mese corrente" }).click();
  await expect(page).toHaveURL(/period=mtd/);

  const books = page.getByTestId("sales-books");
  await expect(books).toContainText(title);
  await expect(page.getByRole("region", { name: "Per mercato" })).toContainText("it");

  // Formats and measure filters recompute everything; the URL keeps them.
  await page
    .getByRole("group", { name: "Formati" })
    .getByRole("button", { name: "Cartaceo" })
    .click();
  await expect(page.getByTestId("sales-hero")).toHaveText("3,00 €");
  await page.getByRole("radio", { name: "Copie" }).click();
  await expect(page).toHaveURL(/metric=units/);
  await page.reload();
  await expect(page.getByTestId("sales-hero")).toHaveText("3,00 €");
  await expect(page.getByRole("radio", { name: "Copie" })).toBeChecked();
});

test("KDP import: a book going online is logged as actual and completes its card; a blocked one raises it to P0", async ({
  page,
}) => {
  const stamp = Date.now();
  const name = `Zeta Uscita ${stamp}`;
  const blockedName = `Zeta Bloccato ${stamp}`;
  await createBoard(page, `Pubblicazioni ${stamp}`);
  await addLists(page, ["Da pubblicare", "Done"]);
  await addCards(page, "Da pubblicare", [`${name} (US) — pronto`, `${blockedName} (US)`]);
  await settle(page);

  const book = (status: string, blockedStatus: string) => [
    {
      kdpId: `Z${stamp}`,
      title: `${name}: Sottotitolo`,
      series: null,
      formats: [{ format: "paperback", status, asin: asin("Z1", stamp), price: "$9,99 USD" }],
    },
    {
      kdpId: `Y${stamp}`,
      title: `${blockedName}: Sottotitolo`,
      series: null,
      formats: [
        { format: "paperback", status: blockedStatus, asin: asin("Z2", stamp), price: "$9,99 USD" },
      ],
    },
  ];
  // First import: drafts, linked to the cards by title. Second: one online, one blocked.
  await importBooks(page, "Account secondario", book("Bozza", "Bozza"));
  await importBooks(page, "Account secondario", book("Online", "Bloccato"));

  await page.goto("/kdp");
  const actual = page.getByRole("cell", {
    name: `Account secondario · Reale, settimana ${weekRangeLabel(weekStartOf(today)!)}`,
  });
  await actual.evaluate((cell) => cell.scrollIntoView({ block: "center" }));
  await expect(actual.getByTestId("kdp-task").filter({ hasText: `Online: ${name}` })).toBeVisible();

  await page.goto("/boards");
  await page.getByRole("link", { name: `Pubblicazioni ${stamp}` }).click();
  await expect(page).toHaveURL(/\/boards\/[^/?]+$/);
  await expectPersisted(page, async () => {
    await expect(cardIn(list(page, "Done"), name)).toBeVisible();
    await expect(cardIn(list(page, "Da pubblicare"), blockedName)).toContainText("P0");
  });
});

test("the books table sorts by any column", async ({ page }) => {
  await page.goto("/kdp/vendite?period=all");
  const table = page.getByTestId("sales-books");
  await expect(table).toBeVisible();
  const header = (name: string) => table.getByRole("columnheader", { name, exact: true });
  const titles = () =>
    table
      .locator("tbody tr")
      .evaluateAll((rows) =>
        rows.map((r) => r.querySelector("td button")?.textContent?.trim() ?? ""),
      );
  const sorted = (values: string[], desc: boolean) => {
    const copy = [...values].sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));
    return desc ? copy.reverse() : copy;
  };

  // Royalty, largest first, until a header is clicked.
  await expect(header("Royalty")).toHaveAttribute("aria-sort", "descending");
  // The click works once the page is hydrated.
  await expect(async () => {
    await header("Libro").getByRole("button").click();
    await expect(header("Libro")).toHaveAttribute("aria-sort", "ascending", { timeout: 1000 });
  }).toPass();
  const ascending = await titles();
  expect(ascending).toEqual(sorted(ascending, false));

  await header("Libro").getByRole("button").click();
  await expect(header("Libro")).toHaveAttribute("aria-sort", "descending");
  const descending = await titles();
  expect(descending).toEqual(sorted(descending, true));
  await expect(header("Royalty")).toHaveAttribute("aria-sort", "none");
});
