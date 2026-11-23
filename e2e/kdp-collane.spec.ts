import { expectNoSeriousA11yIssues } from "./a11y";
import { expect, test } from "./fixtures";
import { encodeImportHash } from "../src/lib/kdp-books";
import { addDays, encodeSalesHash } from "../src/lib/kdp-sales";

const today = new Date().toISOString().slice(0, 10);
const dmy = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`;

test("series: Bookshelf books, planned books, publication dates and links", async ({ page }) => {
  test.slow();
  const stamp = Date.now();
  const name = `collana e2e ${stamp}`;
  const display = `Collana E2e ${stamp}`;
  const author = `Autrice ${stamp}`;
  const asin = (p: string) => `${p}${String(stamp).slice(-8)}`;
  const shelf = (books: object[]) => `/kdp/libri/importa#${encodeImportHash({ v: 1, books })}`;
  const live = (a: string) => [{ format: "ebook", status: "Online", asin: a, price: "€2,99 EUR" }];
  const importOn = async (url: string, done: RegExp) => {
    await page.goto(url);
    await page.getByRole("radio", { name: "Mario" }).check();
    await page.getByRole("button", { name: "Importa" }).click();
    await expect(page).toHaveURL(done);
  };

  // Two books of the series on the Bookshelf (one live, one draft) and one without a series.
  const books = [
    {
      kdpId: `C1${stamp}`,
      title: `Primo ${stamp}: un giallo`,
      series: `Libro in ${name}`,
      author: `${author} (Autore)`,
      formats: live(asin("C1")),
    },
    {
      kdpId: `C2${stamp}`,
      title: `Secondo ${stamp} 2`,
      series: `Libro in ${name}`,
      author: `${author} (Autore)`,
      formats: [{ format: "ebook", status: "Bozza", asin: null, price: null }],
    },
    {
      kdpId: `C3${stamp}`,
      title: `Sciolto ${stamp}`,
      series: null,
      author: `${author} (Autore)`,
      formats: live(asin("C3")),
    },
  ];
  await importOn(shelf(books), /\/kdp\/libri(\?|$)/);
  const sales = await encodeSalesHash({
    v: 1,
    kind: "sales",
    currency: "EUR",
    from: addDays(today, -12),
    to: today,
    rows: [
      [addDays(today, -10), "Amazon.it", `DIGITAL=${asin("C1")}::`, 1, 0, 0, 0, 2, 2, 0, 0, 0],
    ],
  });
  await importOn(`/kdp/vendite/importa#${sales}`, /\/kdp\/vendite(\?|$)/);

  // The menu entry (from a page that does not rewrite its URL after loading);
  // the Bookshelf series is offered and added in one click.
  await page.goto("/boards");
  await page
    .getByRole("navigation", { name: "Principale" })
    .getByRole("link", { name: "Collane" })
    .click();
  await expect(page).toHaveURL(/\/collane$/);
  await page.getByRole("button", { name: `Aggiungi la collana ${display}` }).click();
  const card = page.getByTestId("series-card").filter({ hasText: display });
  await expect(card).toContainText("Mario");
  await expect(card).toContainText(author);
  await expect(card).toContainText("1 pubblicati");
  await card.click();
  await expect(page.getByTestId("series-title")).toHaveText(display);
  const seriesUrl = page.url();

  const rows = page.getByTestId("series-book");
  const row = (title: string) => rows.filter({ hasText: title });
  await expect(rows).toHaveCount(2);
  // The live one, dated by its first sale; the draft one with its volume read from the title.
  await expect(row(`Primo ${stamp}`).getByTestId("stage")).toHaveText("Pubblicato");
  await expect(row(`Primo ${stamp}`)).toContainText(dmy(addDays(today, -10)));
  await expect(row(`Primo ${stamp}`)).toContainText("da prima vendita");
  await expect(row(`Secondo ${stamp}`).getByTestId("stage")).toHaveText("In lavorazione");
  await expect(row(`Secondo ${stamp}`).locator("td").first()).toHaveText("2");
  // Without the toast of the add, which fades in and out.
  await page.reload();
  await expect(rows).toHaveCount(2);
  await expectNoSeriousA11yIssues(page);

  // A planned book.
  await page.getByRole("button", { name: "Libro in lavorazione" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Titolo").fill(`Il terzo ${stamp}`);
  await dialog.getByLabel("Volume").fill("3");
  await dialog.getByLabel("Stato").selectOption({ label: "Pronto" });
  await dialog.getByLabel("Uscita prevista").fill("2027-03-01");
  await expectNoSeriousA11yIssues(page);
  await dialog.getByRole("button", { name: "Salva" }).click();
  await expect(dialog).toBeHidden();
  const planned = row(`Il terzo ${stamp}`);
  await expect(planned.getByTestId("stage")).toHaveText("Pronto");
  await expect(planned).toContainText("01/03/2027");
  await expect(planned).toContainText("Non ancora su KDP");
  // Reading order: numbered volumes first, «Primo» has no number.
  await expect(rows.nth(1)).toContainText(`Il terzo ${stamp}`);

  // Planned volumes on the series.
  await page.getByRole("button", { name: "Modifica", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Volumi previsti").fill("5");
  await page.getByRole("dialog").getByRole("button", { name: "Salva" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("1 pubblicati di 5 previsti")).toBeVisible();

  // A Bookshelf book without a series joins by hand, with a publication date set by hand.
  await page.getByRole("button", { name: "Aggiungi dal Bookshelf" }).click();
  await dialog.getByLabel("Libro KDP").selectOption({ label: `Sciolto ${stamp}` });
  await dialog.getByRole("button", { name: "Salva" }).click();
  await expect(dialog).toBeHidden();
  await expect(row(`Sciolto ${stamp}`).getByTestId("stage")).toHaveText("Pubblicato");
  await row(`Sciolto ${stamp}`)
    .getByRole("button", { name: `Modifica Sciolto ${stamp}` })
    .click();
  await dialog.getByLabel("Data di pubblicazione").fill("2025-05-04");
  await dialog.getByRole("button", { name: "Salva" }).click();
  await expect(dialog).toBeHidden();
  await expect(row(`Sciolto ${stamp}`)).toContainText("04/05/2025");
  await expect(row(`Sciolto ${stamp}`)).toContainText("a mano");

  // The planned book comes out on KDP: suggested, then linked; its volume carries over.
  await importOn(
    shelf([
      ...books,
      {
        kdpId: `C4${stamp}`,
        title: `Il terzo ${stamp}: un altro giallo`,
        series: null,
        author: `${author} (Autore)`,
        formats: live(asin("C4")),
      },
    ]),
    /\/kdp\/libri(\?|$)/,
  );
  await page.goto(seriesUrl);
  await expect(planned).toContainText(`Su KDP: «Il terzo ${stamp}»?`);
  await planned.getByRole("button", { name: "Collega" }).click();
  await expect(planned.getByTestId("stage")).toHaveText("Pubblicato");
  await expect(planned).toContainText(asin("C4"));
  await expect(planned.locator("td").first()).toHaveText("3");
  await expect(rows).toHaveCount(4);

  // Removing the hand-added book; the undo brings it back.
  await row(`Sciolto ${stamp}`)
    .getByRole("button", { name: `Togli Sciolto ${stamp} dalla collana` })
    .click();
  await expect(rows).toHaveCount(3);
  await page.goto("/activity");
  await page
    .getByRole("button", { name: `Annulla: «Sciolto ${stamp}» tolto dalla collana «${display}»` })
    .click();
  await expect(page.getByText(`Annullato: «Sciolto ${stamp}» tolto`)).toBeVisible();
  await page.goto(seriesUrl);
  await expect(rows).toHaveCount(4);
});
