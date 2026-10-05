import { expect, test } from "./fixtures";
import { addCards, addLists, cardIn, createBoard, list, settle } from "./helpers";

test("card detail: description, labels, dates, checklist, persisted and shown on the card", async ({
  page,
}) => {
  const boardUrl = await createBoard(page, `Dettaglio ${Date.now()}`);
  await addLists(page, ["Da fare", "Fatto"]);
  await addCards(page, "Da fare", ["Preparare viaggio"]);

  await cardIn(list(page, "Da fare"), "Preparare viaggio").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Preparare viaggio" })).toBeVisible();
  await expect(page).toHaveURL(/\?card=/);
  const cardUrl = page.url();

  // Markdown description.
  await dialog.getByRole("button", { name: /Aggiungi una descrizione/ }).click();
  await dialog.getByLabel("Descrizione").fill("Prenotare **hotel** e treno");
  await dialog.getByRole("tab", { name: "Anteprima" }).click();
  await expect(dialog.locator("strong", { hasText: "hotel" })).toBeVisible();
  await dialog.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(dialog.locator("strong", { hasText: "hotel" })).toBeVisible();

  // New label, assigned automatically.
  await dialog.getByRole("button", { name: "Etichette" }).click();
  await page.getByRole("button", { name: "Crea una nuova etichetta" }).click();
  await page.getByLabel("Nome").fill("Vacanze");
  await page.getByRole("radio", { name: "Viola" }).click();
  await page.getByRole("button", { name: "Crea", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Etichetta Vacanze" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.keyboard.press("Escape");
  await expect(dialog.getByRole("list", { name: "Etichette" })).toContainText("Vacanze");

  // Due date in the past: overdue until completed.
  await dialog.getByRole("button", { name: "Date" }).click();
  await page.getByRole("checkbox", { name: "Data di scadenza" }).click();
  await page
    .getByRole("button", { name: /^Go to the Previous Month|Vai al mese precedente/ })
    .click();
  await page.getByRole("grid").getByRole("button").filter({ hasText: /^10$/ }).first().click();
  await page.getByLabel("Ora di scadenza").fill("09:30");
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(dialog.getByTestId("due-badge")).toHaveAttribute("data-status", "overdue");
  await dialog.getByRole("checkbox", { name: "Completata" }).click();
  await expect(dialog.getByTestId("due-badge")).toHaveAttribute("data-status", "completed");

  // Checklist with progress.
  await dialog.getByRole("button", { name: "Checklist" }).click();
  await page.getByLabel("Titolo della checklist").fill("Bagagli");
  await page.getByLabel("Titolo della checklist").press("Enter");
  const checklist = dialog.getByRole("region", { name: "Checklist Bagagli" });
  await expect(checklist).toBeVisible();
  await checklist.getByRole("button", { name: "Aggiungi un elemento" }).click();
  const itemInput = checklist.getByLabel("Aggiungi un elemento");
  for (const text of ["Passaporto", "Caricabatterie"]) {
    await itemInput.fill(text);
    await itemInput.press("Enter");
  }
  await itemInput.press("Escape");
  await expect(checklist.getByRole("checkbox", { name: "Passaporto" })).toBeEnabled();
  await checklist.getByRole("checkbox", { name: "Passaporto" }).click();
  await expect(checklist.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");

  // Close: the card summary shows everything.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page).not.toHaveURL(/\?card=/);
  const card = cardIn(list(page, "Da fare"), "Preparare viaggio");
  await expect(card.getByRole("list", { name: "Etichette" })).toContainText("Vacanze");
  await expect(card.getByTestId("due-badge")).toHaveAttribute("data-status", "completed");
  await expect(card.getByTestId("checklist-badge")).toHaveText("1/2");
  await expect(card.getByLabel("Descrizione")).toBeVisible();

  // Everything is persisted and the URL opens the dialog directly.
  await settle(page);
  await page.goto(cardUrl);
  await expect(dialog.locator("strong", { hasText: "hotel" })).toBeVisible();
  await expect(dialog.getByRole("list", { name: "Etichette" })).toContainText("Vacanze");
  await expect(
    dialog.getByRole("region", { name: "Checklist Bagagli" }).getByRole("progressbar"),
  ).toHaveAttribute("aria-valuenow", "50");
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(boardUrl);
});

test("card detail: move, copy and archive", async ({ page }) => {
  await createBoard(page, `Sposta ${Date.now()}`);
  await addLists(page, ["Uno", "Due"]);
  await addCards(page, "Uno", ["Alfa", "Beta"]);

  // Move "Beta" to the top of "Due".
  await cardIn(list(page, "Uno"), "Beta").click();
  const dialog = page.getByRole("dialog").first();
  await dialog.getByRole("button", { name: "Sposta" }).click();
  const moveDialog = page.getByRole("dialog", { name: "Sposta card" });
  await moveDialog.getByRole("combobox", { name: "Lista" }).click();
  await page.getByRole("option", { name: "Due" }).click();
  await moveDialog.getByRole("button", { name: "Sposta" }).click();
  await expect(dialog.getByText("nella lista")).toContainText("Due");
  await page.keyboard.press("Escape");
  await expect(cardIn(list(page, "Due"), "Beta")).toBeVisible();
  await expect(cardIn(list(page, "Uno"), "Beta")).toHaveCount(0);

  // Copy "Alfa" into "Due" with a new title.
  await cardIn(list(page, "Uno"), "Alfa").click();
  await dialog.getByRole("button", { name: "Copia" }).click();
  const copyDialog = page.getByRole("dialog", { name: "Copia card" });
  await copyDialog.getByLabel("Titolo").fill("Alfa (copia)");
  await copyDialog.getByRole("combobox", { name: "Lista" }).click();
  await page.getByRole("option", { name: "Due" }).click();
  await copyDialog.getByRole("button", { name: "Crea copia" }).click();
  await expect(copyDialog).toBeHidden();

  // Archive the original.
  await dialog.getByRole("button", { name: "Archivia" }).click();
  await expect(dialog).toBeHidden();
  await expect(cardIn(list(page, "Uno"), "Alfa")).toHaveCount(0);

  await settle(page);
  await page.reload();
  await expect(cardIn(list(page, "Due"), "Beta")).toBeVisible();
  await expect(cardIn(list(page, "Due"), "Alfa (copia)")).toBeVisible();
  await expect(list(page, "Uno").getByTestId("card")).toHaveCount(0);
});
