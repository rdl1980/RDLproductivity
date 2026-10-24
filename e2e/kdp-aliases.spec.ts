import { expect, test } from "./fixtures";
import { addDays, encodeSalesHash } from "../src/lib/kdp-sales";

test("sales of an unimported title can be named by hand", async ({ page }) => {
  const stamp = Date.now();
  const asin = `B7${String(stamp).slice(-8)}`;
  const today = new Date().toISOString().slice(0, 10);
  const fragment = await encodeSalesHash({
    v: 1,
    kind: "sales",
    currency: "EUR",
    from: addDays(today, -7),
    to: today,
    rows: [[addDays(today, -1), "Amazon.it", `DIGITAL=${asin}::`, 2, 0, 0, 0, 5, 5, 0, 0, 0]],
  });
  await page.goto(`/kdp/vendite/importa#${fragment}`);
  await page.getByRole("radio", { name: "Account principale" }).check();
  await page.getByRole("button", { name: "Importa" }).click();
  await expect(page).toHaveURL(/\/kdp\/vendite$/);

  // The banner counts it, the table shows the ASIN.
  await expect(page.getByTestId("unresolved-banner")).toContainText("senza libro");
  const row = page.getByTestId("sales-books").getByRole("row").filter({ hasText: asin });
  await expect(row).toContainText("Titolo non importato");

  await row.getByRole("button", { name: "Assegna titolo" }).click();
  const dialog = page.getByRole("dialog", { name: "Assegna un titolo" });
  await dialog.getByLabel("Titolo").fill(`Agenda Test ${stamp}`);
  await dialog.getByRole("button", { name: "Salva" }).click();
  await expect(dialog).toBeHidden();
  const named = page
    .getByTestId("sales-books")
    .getByRole("row")
    .filter({ hasText: `Agenda Test ${stamp}` });
  await expect(named).toBeVisible();
  await expect(named).toContainText("Cambia titolo");
  await expect(named).not.toContainText("Titolo non importato");

  // Fresh import: no stale badge for this account.
  await expect(page.getByTestId("stale-badge").filter({ hasText: "giorni fa" })).toHaveCount(0);
});
