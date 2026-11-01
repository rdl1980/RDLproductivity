import { expect, test } from "./fixtures";
import { encodeImportHash } from "../src/lib/kdp-books";
import { addDays, encodeSalesHash } from "../src/lib/kdp-sales";

test("KDP imports recognise the account and refuse another account's data", async ({ page }) => {
  const stamp = Date.now();
  const asin = `B9${String(stamp).slice(-8)}`;
  const books = [
    {
      kdpId: `ACC${stamp}`,
      title: `Account Test ${stamp}: Libro di prova`,
      series: null,
      formats: [{ format: "ebook", status: "Online", asin, price: "€4,99 EUR" }],
    },
  ];
  const booksUrl = `/kdp/libri/importa#${encodeImportHash({ v: 1, books })}`;
  const main = page.getByRole("radio", { name: "Rosario" });
  const secondary = page.getByRole("radio", { name: "Ilaria" });
  const importButton = page.getByRole("button", { name: "Importa" });

  // Unknown books: no account is preselected, so the import waits for a choice.
  await page.goto(booksUrl);
  await expect(page.getByTestId("account-hint")).toContainText("Nessuno di questi libri");
  await expect(main).not.toBeChecked();
  await expect(secondary).not.toBeChecked();
  await expect(importButton).toBeDisabled();
  await main.check();
  await importButton.click();
  await expect(page).toHaveURL(/\/kdp\/libri$/);

  // The same Bookshelf again: recognised as the main account's.
  await page.goto(booksUrl);
  await expect(page.getByTestId("account-hint")).toContainText("«Rosario»");
  await expect(main).toBeChecked();
  // Imported as the secondary account, it is refused.
  await secondary.check();
  await importButton.click();
  await expect(page.getByText(/Questi dati sembrano di «Rosario»/)).toBeVisible();
  await expect(page).toHaveURL(/\/kdp\/libri\/importa/);

  // Reports with that book's ASIN: same recognition and refusal.
  const today = new Date().toISOString().slice(0, 10);
  const fragment = await encodeSalesHash({
    v: 1,
    kind: "sales",
    currency: "EUR",
    from: addDays(today, -7),
    to: today,
    rows: [[addDays(today, -2), "Amazon.it", `DIGITAL=${asin}::`, 1, 0, 0, 0, 2.5, 2.5, 0, 0, 0]],
  });
  await page.goto(`/kdp/vendite/importa#${fragment}`);
  await expect(page.getByTestId("account-hint")).toContainText("«Rosario»");
  await expect(main).toBeChecked();
  await secondary.check();
  await importButton.click();
  await expect(page.getByText(/Questi dati sembrano di «Rosario»/)).toBeVisible();
});
