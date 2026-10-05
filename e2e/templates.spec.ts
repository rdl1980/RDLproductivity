import { expect, test } from "./fixtures";
import { addCards, addLists, cardIn, createBoard, list, settle } from "./helpers";

test("boards and cards can be saved as templates and reused", async ({ page }) => {
  const stamp = Date.now();
  const cardTitle = `Modello ${stamp}`;
  const boardTemplate = `Tpl board ${stamp}`;
  const cardTemplate = `Tpl card ${stamp}`;
  await createBoard(page, `Sorgente ${stamp}`);
  await addLists(page, ["Da fare", "Fatto"]);
  await addCards(page, "Da fare", [cardTitle]);

  // The card gets a new label and a priority.
  await cardIn(list(page, "Da fare"), cardTitle).click();
  const dialog = page.getByRole("dialog", { name: cardTitle });
  await dialog.getByRole("button", { name: "Etichette" }).click();
  await page.getByRole("button", { name: "Crea una nuova etichetta" }).click();
  await page.getByLabel("Nome").fill(`Tag ${stamp}`);
  await page.getByRole("radio", { name: "Viola" }).click();
  await page.getByRole("button", { name: "Crea", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: `Etichetta Tag ${stamp}` })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.keyboard.press("Escape");
  await dialog.getByRole("combobox", { name: "Priorità" }).click();
  await page.getByRole("option", { name: "P1 Alta" }).click();
  await expect(dialog.getByRole("combobox", { name: "Priorità" })).toContainText("P1");

  // Save the card as a template.
  await dialog.getByRole("button", { name: "Salva come template" }).click();
  await page.getByLabel("Nome del template").fill(cardTemplate);
  await page.getByRole("button", { name: "Salva template" }).click();
  await expect(page.getByText(`Template "${cardTemplate}" salvato`)).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Salva la card come template" })).toBeHidden();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await settle(page);

  // Add a card from the template to "Fatto".
  await page.getByRole("button", { name: "Azioni per Fatto", exact: true }).click();
  await page.getByRole("menuitem", { name: "Aggiungi card da template…" }).click();
  await page.getByRole("button", { name: new RegExp(cardTemplate) }).click();
  const fromTemplate = cardIn(list(page, "Fatto"), cardTitle);
  await expect(fromTemplate).toBeVisible();
  await expect(fromTemplate.getByTestId("priority-badge")).toHaveText(/P1/);
  await expect(fromTemplate).toContainText(`Tag ${stamp}`);
  await settle(page);

  // Save the whole board, cards included, and create a new board from it.
  await page.getByRole("button", { name: "Azioni board" }).click();
  await page.getByRole("menuitem", { name: "Salva come template…" }).click();
  await page.getByLabel("Nome del template").fill(boardTemplate);
  await page.getByRole("checkbox", { name: /Includi le card/ }).click();
  await page.getByRole("button", { name: "Salva template" }).click();
  await expect(page.getByText(`Template "${boardTemplate}" salvato`)).toBeVisible();

  await page.goto("/boards");
  await page.getByRole("button", { name: "Crea una board" }).click();
  await page.getByLabel("Titolo").fill(`Copia ${stamp}`);
  await page.getByRole("combobox", { name: "Template" }).click();
  await page.getByRole("option", { name: new RegExp(boardTemplate) }).click();
  await page.getByRole("button", { name: "Crea", exact: true }).click();
  await expect(page).toHaveURL(/\/boards\/[^/]+$/);
  await expect(page.getByRole("heading", { name: `Copia ${stamp}` })).toBeVisible();
  await expect(cardIn(list(page, "Da fare"), cardTitle)).toContainText(`Tag ${stamp}`);
  await expect(cardIn(list(page, "Fatto"), cardTitle)).toHaveCount(1);

  // Templates can be deleted from their page.
  await page.goto("/templates");
  const item = page.getByTestId("template-item").filter({ hasText: cardTemplate });
  await expect(item).toContainText("1 etichetta");
  await item.getByRole("button", { name: `Elimina il template ${cardTemplate}` }).click();
  await expect(item).toHaveCount(0);
});
