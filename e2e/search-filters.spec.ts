import { expect, test } from "./fixtures";
import { addCards, addLists, cardIn, createBoard, list, settle } from "./helpers";

test("global search finds cards by title and description and opens them", async ({ page }) => {
  const token = `zq${Date.now()}`;
  await createBoard(page, `Ricerca ${token}`);
  await addLists(page, ["Spesa"]);
  await addCards(page, "Spesa", ["Comprare latte", "Altro"]);

  // Description containing a unique word.
  await cardIn(list(page, "Spesa"), "Comprare latte").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Aggiungi una descrizione/ }).click();
  await dialog.getByLabel("Descrizione").fill(`Passare al supermercato ${token} dopo il lavoro`);
  await dialog.getByRole("button", { name: "Salva", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await settle(page);

  // `/` focuses the search box from anywhere.
  await page.keyboard.press("/");
  const search = page.getByRole("searchbox", { name: "Cerca card" });
  await expect(search).toBeFocused();
  await search.fill(token);
  await search.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/search\\?q=${token}`));

  const results = page.getByRole("list", { name: "Risultati" });
  await expect(results.getByRole("link")).toHaveCount(1);
  await expect(results.locator("mark", { hasText: token })).toBeVisible();
  await expect(page.getByRole("link", { name: `Ricerca ${token}`, exact: true })).toBeVisible();

  await results.getByRole("link").click();
  await expect(page).toHaveURL(/\/boards\/[^/?]+\?card=/);
  await expect(dialog.getByRole("heading", { name: "Comprare latte" })).toBeVisible();

  // Title search is case-insensitive; no results message.
  await page.goto(`/search?q=${encodeURIComponent("COMPRARE LATTE")}`);
  await expect(results.getByRole("link").first()).toBeVisible();
  await page.goto(`/search?q=nessuna-corrispondenza-${token}`);
  await expect(page.getByText("Nessuna card trovata.")).toBeVisible();
});

test("board filters by label and status, persisted in the URL", async ({ page }) => {
  await createBoard(page, `Board filtri ${Date.now()}`);
  await addLists(page, ["Lista"]);
  await addCards(page, "Lista", ["Rossa", "Fatta", "Normale"]);
  const dialog = page.getByRole("dialog");

  // "Rossa" gets a new label.
  await cardIn(list(page, "Lista"), "Rossa").click();
  await dialog.getByRole("button", { name: "Etichette" }).click();
  await page.getByRole("button", { name: "Crea una nuova etichetta" }).click();
  await page.getByLabel("Nome").fill("Urgente");
  await page.getByRole("radio", { name: "Rosso" }).click();
  await page.getByRole("button", { name: "Crea", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Etichetta Urgente" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Crea una nuova etichetta" })).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Rossa" })).toBeHidden();

  // "Fatta" is completed.
  await cardIn(list(page, "Lista"), "Fatta").click();
  await dialog.getByRole("checkbox", { name: "Completata" }).click();
  await expect(dialog.getByRole("checkbox", { name: "Completata" })).toBeChecked();
  await page.keyboard.press("Escape");
  await settle(page);

  const visible = () =>
    list(page, "Lista").getByTestId("card").locator("[data-card-title]").allInnerTexts();
  const filtersButton = page.getByRole("button", { name: /^Filtri( \d+)?$/ });

  await filtersButton.click();
  await page.getByRole("checkbox", { name: "Urgente" }).click();
  await expect.poll(visible).toEqual(["Rossa"]);
  await expect(list(page, "Lista").getByTestId("list-card-count")).toHaveAttribute(
    "title",
    "1 di 3 card visibili",
  );
  await expect(page).toHaveURL(/labels=/);
  await expect(page.getByRole("status").filter({ hasText: "Filtri attivi" })).toContainText(
    "2 card nascoste",
  );

  // Label OR "no label", then completed only.
  await page.getByRole("checkbox", { name: "Senza etichette" }).click();
  await expect.poll(visible).toEqual(["Rossa", "Fatta", "Normale"]);
  await page.getByRole("combobox", { name: "Filtro stato" }).click();
  await page.getByRole("option", { name: "Completate" }).click();
  await expect.poll(visible).toEqual(["Fatta"]);
  await page.keyboard.press("Escape");

  // Filters survive a reload.
  await page.reload();
  await expect.poll(visible).toEqual(["Fatta"]);
  await expect(filtersButton).toContainText("3");

  // Due filter: no card has a due date.
  await filtersButton.click();
  await page.getByRole("combobox", { name: "Filtro scadenza" }).click();
  await page.getByRole("option", { name: "Scadute" }).click();
  await expect.poll(visible).toEqual([]);
  await page.getByRole("button", { name: "Cancella filtri" }).first().click();
  await expect.poll(visible).toEqual(["Rossa", "Fatta", "Normale"]);
  await expect(page).not.toHaveURL(/labels=|status=|due=/);
});
