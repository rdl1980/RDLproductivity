import { expect, test } from "./fixtures";
import { encodeImportHash } from "../src/lib/kdp-books";
import { addDays, encodeSalesHash } from "../src/lib/kdp-sales";

const today = new Date().toISOString().slice(0, 10);

test("Amazon Ads spend: upload the report, net royalty and ACoS on the dashboard", async ({
  page,
}) => {
  const stamp = Date.now();
  const asin = `B6${String(stamp).slice(-8)}`;
  await page.goto(
    `/kdp/libri/importa#${encodeImportHash({
      v: 1,
      books: [
        {
          kdpId: `ADS${stamp}`,
          title: `Ads Test ${stamp}: un libro`,
          series: null,
          formats: [{ format: "ebook", status: "Online", asin, price: "€4,99 EUR" }],
        },
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
    from: addDays(today, -7),
    to: today,
    rows: [[addDays(today, -2), "Amazon.it", `DIGITAL=${asin}::`, 5, 0, 0, 0, 10, 10, 0, 0, 0]],
  });
  await page.goto(`/kdp/vendite/importa#${fragment}`);
  await page.getByRole("radio", { name: "Account principale" }).check();
  await page.getByRole("button", { name: "Importa" }).click();
  await expect(page).toHaveURL(/\/kdp\/vendite$/);

  // The report as the Italian console exports it, semicolons and decimal commas.
  const csv = [
    "Data;Valuta;Nome della campagna;Gruppo di annunci;ASIN pubblicizzato;Impressioni;Clic;Spesa;Vendite totali in 7 giorni;Ordini totali in 7 giorni (n.)",
    `${addDays(today, -2).split("-").reverse().join("/")};EUR;Calcio IT;Auto;${asin};1200;10;3,50;9,98;2`,
    `${addDays(today, -1).split("-").reverse().join("/")};EUR;Calcio IT;Auto;${asin};800;4;1,50;0;0`,
    "Totale;;;;;2000;14;5,00;9,98;2",
  ].join("\n");
  await page.goto("/kdp/ads/importa");
  await expect(page.getByLabel("Report «Prodotto pubblicizzato»")).toBeEnabled();
  await page
    .getByLabel("Report «Prodotto pubblicizzato»")
    .setInputFiles({ name: "report.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf-8") });
  await expect(page.getByTestId("ads-import-summary")).toContainText("5.00 EUR");
  await expect(page.getByTestId("account-hint")).toContainText("«Account principale»");
  await expect(page.getByRole("radio", { name: "Account principale" })).toBeChecked();
  await page.getByRole("button", { name: "Importa" }).click();
  await expect(page).toHaveURL(/\/kdp\/vendite$/);

  const kpis = page.getByTestId("ads-kpis");
  await expect(kpis).toBeVisible();
  await page.getByRole("combobox", { name: "Libro" }).click();
  await page.getByRole("option", { name: `Ads Test ${stamp}` }).click();
  await expect(kpis.getByTestId("stat-tile").filter({ hasText: "Spesa Ads" })).toContainText(
    "5,00",
  );
  await expect(kpis.getByTestId("stat-tile").filter({ hasText: "Netto" })).toContainText("5,00");
  await expect(kpis.getByTestId("stat-tile").filter({ hasText: "ACoS" })).toContainText("50%");
  const row = page
    .getByTestId("sales-books")
    .getByRole("row")
    .filter({ hasText: `Ads Test ${stamp}` });
  await expect(row).toContainText("5,00");
  await expect(page.getByRole("region", { name: "Pubblicità" }).first()).toBeVisible();

  // Wrong account is refused.
  await page.goto("/kdp/ads/importa");
  await expect(page.getByLabel("Report «Prodotto pubblicizzato»")).toBeEnabled();
  await page
    .getByLabel("Report «Prodotto pubblicizzato»")
    .setInputFiles({ name: "report.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf-8") });
  await page.getByRole("radio", { name: "Account secondario" }).check();
  await page.getByRole("button", { name: "Importa" }).click();
  await expect(page.getByText(/sembrano di «Account principale»/)).toBeVisible();
});
