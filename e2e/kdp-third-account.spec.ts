import { expect, test } from "./fixtures";
import { todayIn, weekRangeLabel, weekStartOf } from "../src/lib/kdp";
import { encodeImportHash } from "../src/lib/kdp-books";

const today = todayIn(process.env.DEFAULT_TIME_ZONE ?? "Europe/Rome");
const week = weekRangeLabel(weekStartOf(today)!);

test("the third account (NonnoPeppe) has its lanes and imports its own books", async ({ page }) => {
  const stamp = Date.now();
  const title = `Nonno ${stamp}`;
  const asin = `N${String(stamp).slice(-9)}`;

  // A task in its planned lane.
  await page.goto("/kdp");
  const lane = page.getByRole("cell", { name: `NonnoPeppe · Pianificato, settimana ${week}` });
  await lane.getByRole("button", { name: /^Aggiungi attività/ }).click();
  await lane.getByRole("textbox").fill(`Attività ${title}`);
  await lane.getByRole("textbox").press("Enter");
  await expect(lane.getByTestId("kdp-task").filter({ hasText: `Attività ${title}` })).toBeVisible();

  // Its Bookshelf: imported into NonnoPeppe, then recognised as NonnoPeppe's.
  const payload = {
    v: 1 as const,
    books: [
      {
        kdpId: `NP${stamp}`,
        title,
        series: null,
        author: "Nonno Peppe",
        formats: [{ format: "ebook" as const, status: "Online", asin, price: "€3,99 EUR" }],
      },
    ],
  };
  await page.goto(`/kdp/libri/importa#${encodeImportHash(payload)}`);
  await page.getByRole("radio", { name: "NonnoPeppe" }).check();
  await page.getByRole("button", { name: "Importa" }).click();
  await expect(page).toHaveURL(/\/kdp\/libri$/);
  const book = page
    .getByTestId("kdp-book")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await expect(book).toContainText("NonnoPeppe");

  await page.goto(`/kdp/libri/importa#${encodeImportHash(payload)}`);
  await expect(page.getByTestId("account-hint")).toContainText("«NonnoPeppe»");
  await page.getByRole("radio", { name: "Rosario" }).check();
  await page.getByRole("button", { name: "Importa" }).click();
  await expect(page.getByText(/Questi dati sembrano di «NonnoPeppe»/)).toBeVisible();
});
