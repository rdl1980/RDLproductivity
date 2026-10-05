import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { addCards, addLists, cardIn, createBoard, expectPersisted, list, settle } from "./helpers";

async function setPriority(page: Page, title: string, option: string) {
  const dialog = page.getByRole("dialog", { name: title });
  await dialog.getByRole("combobox", { name: "Priorità" }).click();
  await page.getByRole("option", { name: option }).click();
  await expect(dialog.getByRole("combobox", { name: "Priorità" })).toContainText(
    option.split(" ")[0],
  );
}

test("the activity log lists changes and undoes them", async ({ page }) => {
  const stamp = Date.now();
  const title = `Storico ${stamp}`;
  const boardUrl = await createBoard(page, `Attività ${stamp}`);
  await addLists(page, ["Lista"]);
  await addCards(page, "Lista", [title]);

  await cardIn(list(page, "Lista"), title).click();
  const dialog = page.getByRole("dialog", { name: title });
  await setPriority(page, title, "P1 Alta");
  await setPriority(page, title, "P2 Media");
  await dialog.getByRole("checkbox", { name: "Completata" }).click();
  await expect(dialog.getByRole("checkbox", { name: "Completata" })).toBeChecked();
  await page.keyboard.press("Escape");
  await settle(page);

  await page.goto("/activity");
  const entry = (text: string) =>
    page.getByTestId("activity-item").filter({ hasText: `Card «${title}»: ${text}` });
  await expect(entry("completata")).toBeVisible();
  await expect(entry("priorità P2")).toBeVisible();
  await expect(page.getByTestId("activity-item").filter({ hasText: title }).first()).toContainText(
    "completata",
  );

  // An older change on the same card cannot be undone while later ones stand.
  await entry("priorità P1")
    .getByRole("button", { name: /^Annulla/ })
    .click();
  await expect(page.getByText(/Ci sono modifiche successive/)).toBeVisible();

  // The latest one can.
  await entry("completata")
    .getByRole("button", { name: /^Annulla/ })
    .click();
  await expect(page.getByText(`Annullato: Card «${title}»: completata`)).toBeVisible();
  await expect(entry("completata")).toContainText("annullata");
  await expect(entry("completata").getByRole("button", { name: /^Annulla/ })).toHaveCount(0);

  await page.goto(boardUrl);
  await cardIn(list(page, "Lista"), title).click();
  await expect(dialog.getByRole("checkbox", { name: "Completata" })).not.toBeChecked();
  await dialog.getByText("Attività", { exact: true }).click();
  await expect(dialog.getByTestId("card-activity")).toContainText("priorità P2");
});

test("Ctrl/Cmd+Z on the board undoes the latest change", async ({ page }) => {
  const stamp = Date.now();
  const title = `Annulla ${stamp}`;
  await createBoard(page, `Undo ${stamp}`);
  await addLists(page, ["Lista"]);
  await addCards(page, "Lista", [title]);

  await page.getByRole("button", { name: `Azioni per ${title}` }).click({ force: true });
  await page.getByRole("menuitem", { name: "Archivia" }).click();
  await expect(cardIn(list(page, "Lista"), title)).toHaveCount(0);
  await settle(page);

  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByText(`Annullato: Card «${title}» archiviata`)).toBeVisible();
  await expect(cardIn(list(page, "Lista"), title)).toHaveCount(1);
  await expectPersisted(page, () => expect(cardIn(list(page, "Lista"), title)).toHaveCount(1));
});
