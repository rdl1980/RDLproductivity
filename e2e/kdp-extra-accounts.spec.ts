import { expect, test } from "./fixtures";
import { todayIn, weekRangeLabel, weekStartOf } from "../src/lib/kdp";
import { encodeImportHash } from "../src/lib/kdp-books";

const today = todayIn(process.env.DEFAULT_TIME_ZONE ?? "Europe/Rome");
const week = weekRangeLabel(weekStartOf(today)!);

for (const name of ["NonnoPeppe", "Mario"]) {
  test(`the account ${name} has its lanes and imports its own books`, async ({ page }) => {
    const stamp = Date.now();
    const title = `${name} ${stamp}`;
    const asin = `${name[0]}${String(stamp).slice(-9)}`;

    // A task in its planned lane.
    await page.goto("/kdp");
    const lane = page.getByRole("cell", { name: `${name} · Pianificato, settimana ${week}` });
    await lane.getByRole("button", { name: /^Aggiungi attività/ }).click();
    await lane.getByRole("textbox").fill(`Attività ${title}`);
    await lane.getByRole("textbox").press("Enter");
    await expect(
      lane.getByTestId("kdp-task").filter({ hasText: `Attività ${title}` }),
    ).toBeVisible();

    // Its Bookshelf: imported into the account, then recognised as its own.
    const payload = {
      v: 1 as const,
      books: [
        {
          kdpId: `${name}${stamp}`,
          title,
          series: null,
          author: `Autore ${name}`,
          formats: [{ format: "ebook" as const, status: "Online", asin, price: "€3,99 EUR" }],
        },
      ],
    };
    await page.goto(`/kdp/libri/importa#${encodeImportHash(payload)}`);
    await page.getByRole("radio", { name: name }).check();
    await page.getByRole("button", { name: "Importa" }).click();
    await expect(page).toHaveURL(/\/kdp\/libri$/);
    const book = page
      .getByTestId("kdp-book")
      .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
    await expect(book).toContainText(name);

    await page.goto(`/kdp/libri/importa#${encodeImportHash(payload)}`);
    await expect(page.getByTestId("account-hint")).toContainText(`«${name}»`);
    await page.getByRole("radio", { name: "Rosario" }).check();
    await page.getByRole("button", { name: "Importa" }).click();
    await expect(page.getByText(new RegExp(`Questi dati sembrano di «${name}»`))).toBeVisible();
  });
}
