import { expect, test } from "./fixtures";
import { addCards, addLists, cardIn, createBoard, expectPersisted, list, settle } from "./helpers";
import { encodeImportHash } from "../src/lib/kdp-books";

test("KDP books: import from the bookmarklet link, auto-link and confirm a suggestion", async ({
  page,
}) => {
  const stamp = Date.now();
  const name = `Zebra Quiz ${stamp}`;
  const exactCard = `${name} (US) — pronto`;
  await createBoard(page, `Libri ${stamp}`);
  await addLists(page, ["Da pubblicare"]);
  await addCards(page, "Da pubblicare", [exactCard]);
  await settle(page);

  const payload = {
    v: 1,
    books: [
      {
        kdpId: `A${stamp}`,
        title: `${name}: 300 Questions for Young Players`,
        series: null,
        formats: [
          { format: "ebook", status: "Live", asin: "B0TESTAAA1", price: "$5,99 USD" },
          { format: "paperback", status: "Bozza", asin: null, price: "$12,99 USD" },
        ],
      },
      {
        kdpId: `B${stamp}`,
        title: `${name} Deluxe Edition: Puzzles and Answers`,
        series: "Libro in zebra quiz",
        formats: [
          { format: "paperback", status: "Online", asin: "B0TESTBBB2", price: "$9,99 USD" },
        ],
      },
    ],
  };
  await page.goto(`/kdp/libri/importa#${encodeImportHash(payload)}`);
  await expect(page.getByText("Trovati 2 libri con 2 ASIN.")).toBeVisible();
  await page.getByRole("radio", { name: "Account secondario" }).check();
  await page.getByRole("button", { name: "Importa" }).click();
  await expect(page).toHaveURL(/\/kdp\/libri$/);

  const book = (title: string) => page.getByTestId("kdp-book").filter({ hasText: title });
  const exact = book("300 Questions for Young Players");
  await expect(exact).toContainText("B0TESTAAA1");
  await expect(exact).toContainText("Account secondario");
  // Exact title in the same market: linked without asking.
  await expect(exact.getByRole("link", { name: exactCard })).toBeVisible();

  // The deluxe edition is only a suggestion for the same card.
  const suggestions = page.getByTestId("kdp-suggestions");
  const entry = suggestions.getByRole("listitem").filter({ hasText: exactCard });
  await expect(entry).toContainText(`${name} Deluxe Edition`);
  await entry.getByRole("button", { name: "Scarta" }).click();
  await expect(suggestions.filter({ hasText: exactCard })).toHaveCount(0);
  await expectPersisted(page, async () => {
    await expect(book("Deluxe Edition").getByRole("link", { name: exactCard })).toHaveCount(0);
    await expect(page.getByTestId("kdp-suggestions").filter({ hasText: exactCard })).toHaveCount(0);
  });

  // The card shows its book and ASIN.
  await exact.getByRole("link", { name: exactCard }).click();
  const section = page.getByTestId("card-kdp-books");
  await expect(section).toContainText(name);
  await expect(section.getByRole("button", { name: "Copia ASIN B0TESTAAA1" })).toBeVisible();
});

test("lists: archive the completed cards, then all the cards, and undo", async ({ page }) => {
  const stamp = Date.now();
  const listTitle = `Fatto ${stamp}`;
  const titles = [`Uno ${stamp}`, `Due ${stamp}`, `Tre ${stamp}`];
  await createBoard(page, `Archivio in blocco ${stamp}`);
  await addLists(page, [listTitle]);
  await addCards(page, listTitle, titles);
  const column = list(page, listTitle);

  // Complete the first card from its detail.
  await cardIn(column, titles[0]).click();
  await page.getByRole("dialog").getByRole("checkbox", { name: "Completata" }).click();
  await settle(page);
  await page.keyboard.press("Escape");

  const menu = page.getByRole("button", { name: `Azioni per ${listTitle}`, exact: true });
  await menu.click();
  await page.getByRole("menuitem", { name: "Archivia le card completate" }).click();
  await expect(cardIn(column, titles[0])).toHaveCount(0);
  await expect(cardIn(column, titles[1])).toBeVisible();

  await menu.click();
  await page.getByRole("menuitem", { name: "Archivia tutte le card" }).click();
  await expect(column.getByTestId("card")).toHaveCount(0);
  await expect(column).toBeVisible();
  await expectPersisted(page, async () => {
    await expect(list(page, listTitle).getByTestId("card")).toHaveCount(0);
  });

  // One undo brings back the whole batch.
  await page.keyboard.press("Control+z");
  await expect(cardIn(list(page, listTitle), titles[1])).toBeVisible();
  await expect(cardIn(list(page, listTitle), titles[2])).toBeVisible();
  await expect(cardIn(list(page, listTitle), titles[0])).toHaveCount(0);
});
