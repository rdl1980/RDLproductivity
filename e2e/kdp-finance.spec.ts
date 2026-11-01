import { expect, test } from "./fixtures";
import { addCards, addLists, cardIn, createBoard, list, settle } from "./helpers";
import { encodeImportHash } from "../src/lib/kdp-books";
import { addDays, encodeSalesHash } from "../src/lib/kdp-sales";

const today = new Date().toISOString().slice(0, 10);

test("goals, payouts, fiscal export and the weekly review", async ({ page }) => {
  const stamp = Date.now();
  const asin = `B5${String(stamp).slice(-8)}`;
  await page.goto(
    `/kdp/libri/importa#${encodeImportHash({
      v: 1,
      books: [
        {
          kdpId: `F${stamp}`,
          title: `Finanza Test ${stamp}: un libro`,
          series: null,
          formats: [{ format: "ebook", status: "Online", asin, price: "€2,99 EUR" }],
        },
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
    from: addDays(today, -40),
    to: today,
    rows: [
      [addDays(today, -40), "Amazon.it", `DIGITAL=${asin}::`, 3, 0, 0, 0, 6, 6, 0, 0, 0],
      [today, "Amazon.it", `DIGITAL=${asin}::`, 1, 0, 0, 0, 2, 2, 0, 0, 0],
    ],
  });
  await page.goto(`/kdp/vendite/importa#${fragment}`);
  await page.getByRole("radio", { name: "Rosario" }).check();
  await page.getByRole("button", { name: "Importa" }).click();
  await expect(page).toHaveURL(/\/kdp\/vendite$/);

  // Goal: set it, the tile shows the month to date against it.
  const tile = page.getByTestId("goal-tile");
  await tile.getByRole("button", { name: /Imposta|Modifica/ }).click();
  const dialog = page.getByRole("dialog", { name: "Obiettivo mensile di royalty" });
  await dialog.getByLabel("Rosario").fill("1000");
  await dialog.getByRole("button", { name: "Salva" }).click();
  await expect(dialog).toBeHidden();
  // Grouping depends on the ICU data of the renderer: accept both spellings.
  await expect(tile).toContainText(/su 1\.?000,00\s€/);
  await expect(tile).toContainText("%");

  // Payouts: every imported month is listed with its pay date; something is due.
  await page.goto("/kdp/incassi");
  await expect(page.getByTestId("payouts-due")).toBeVisible();
  await expect(page.getByTestId("payouts-table")).toContainText("Rosario");
  await expect(page.getByTestId("payouts-table")).toContainText("in arrivo");
  // Each row breaks down into one transfer per marketplace, with its currency.
  const transfers = page.getByTestId("payout-transfers").first();
  await transfers.locator("summary").click();
  await expect(transfers).toContainText(/EUR|USD|GBP/);

  // Fiscal export: a real workbook.
  const year = Number(today.slice(0, 4));
  await expect(page.getByRole("link", { name: `Vendite ${year} (Excel)` })).toBeVisible();
  // The page's context carries the session cookie.
  const response = await page.request.get(`/api/kdp/export?year=${year}`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("spreadsheetml");
  expect((await response.body()).length).toBeGreaterThan(2000);

  // Weekly review: a card completed this week shows up, sales and goals too.
  const title = `Riepilogo ${stamp}`;
  await createBoard(page, `Review ${stamp}`);
  await addLists(page, ["Fatto"]);
  await addCards(page, "Fatto", [title]);
  await cardIn(list(page, "Fatto"), title).click();
  const card = page.getByRole("dialog", { name: title });
  await card.getByRole("checkbox", { name: "Completata" }).click();
  await expect(card.getByRole("checkbox", { name: "Completata" })).toBeChecked();
  await page.keyboard.press("Escape");
  await settle(page);

  await page.goto("/riepilogo");
  await expect(page.getByTestId("review-week")).toContainText("Settimana");
  await expect(page.getByRole("region", { name: "Card completate" })).toContainText(title);
  await expect(page.getByTestId("review-sales")).toContainText("Rosario");
  await expect(page.getByTestId("review-goals")).toContainText(/1\.?000,00\s€/);
  await page.getByRole("link", { name: "Settimana precedente" }).click();
  await expect(page).toHaveURL(/week=\d{4}-\d{2}-\d{2}/);
  await expect(page.getByRole("region", { name: "Card completate" })).not.toContainText(title);
});
