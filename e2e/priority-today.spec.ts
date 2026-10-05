import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import {
  addCards,
  addLists,
  cardIn,
  createBoard,
  dragTo,
  expectPersisted,
  list,
  settle,
} from "./helpers";

async function setPriority(page: Page, cardTitle: string, label: string) {
  const dialog = page.getByRole("dialog", { name: cardTitle });
  await dialog.getByRole("combobox", { name: "Priorità" }).click();
  await page.getByRole("option", { name: label }).click();
  await expect(dialog.getByRole("combobox", { name: "Priorità" })).toContainText(
    label.split(" ")[0],
  );
}

test("priorities show on cards, filter the board and feed the super board", async ({ page }) => {
  const stamp = Date.now();
  const urgent = `Urgente ${stamp}`;
  const normal = `Normale ${stamp}`;
  const boardUrl = await createBoard(page, `Priorità ${stamp}`);
  await addLists(page, ["Da fare", "Fatto"]);
  await addCards(page, "Da fare", [urgent, normal]);

  await cardIn(list(page, "Da fare"), urgent).click();
  await setPriority(page, urgent, "P0 Critica");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(cardIn(list(page, "Da fare"), urgent).getByTestId("priority-badge")).toHaveText(
    /P0/,
  );
  await settle(page);

  // Board filter by priority.
  await page.getByRole("button", { name: /^Filtri( \d+)?$/ }).click();
  await page.getByRole("checkbox", { name: "P0 · Critica" }).click();
  await expect(page).toHaveURL(/priority=0/);
  await expect(list(page, "Da fare").getByTestId("card")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Cancella filtri" }).first().click();
  await expect(list(page, "Da fare").getByTestId("card")).toHaveCount(2);

  // Super board: P0 lane, "Da fare" column.
  await page.goto("/priority");
  const cell = (lane: string, column: string) =>
    page.getByRole("cell", { name: `${lane} · ${column}`, exact: true });
  await expect(
    cell("P0", "Da fare").getByTestId("super-card").filter({ hasText: urgent }),
  ).toBeVisible();
  await expect(page.getByTestId("super-card").filter({ hasText: normal })).toHaveCount(0);

  // Drag to P1 lane, "Fatto" column: priority and list both change.
  await dragTo(
    page,
    page.getByTestId("super-card").filter({ hasText: urgent }),
    cell("P1", "Fatto"),
  );
  await expect(cell("P1", "Fatto")).toContainText(urgent);
  await expectPersisted(page, () => expect(cell("P1", "Fatto")).toContainText(urgent));

  await page.goto(boardUrl);
  await expect(cardIn(list(page, "Fatto"), urgent).getByTestId("priority-badge")).toHaveText(/P1/);

  // Lowering the priority from the super board dialog removes the card.
  await page.goto("/priority");
  await page.getByTestId("super-card").filter({ hasText: urgent }).getByRole("button").click();
  await setPriority(page, urgent, "P3 Bassa");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("super-card").filter({ hasText: urgent })).toHaveCount(0);
});

test("today view groups due cards and completes them", async ({ page }) => {
  const stamp = Date.now();
  const title = `Scadenza odierna ${stamp}`;
  await createBoard(page, `Agenda ${stamp}`);
  await addLists(page, ["Lista"]);
  await addCards(page, "Lista", [title]);

  // Due today at 12:00 (the default when enabling the due date).
  await cardIn(list(page, "Lista"), title).click();
  const dialog = page.getByRole("dialog", { name: title });
  await dialog.getByRole("button", { name: "Date" }).click();
  await page.getByRole("checkbox", { name: "Data di scadenza" }).click();
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(dialog.getByTestId("due-badge")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Data di scadenza" })).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await settle(page);

  await page
    .getByRole("navigation", { name: "Principale" })
    .getByRole("link", { name: "Oggi" })
    .click();
  await expect(page).toHaveURL(/\/today$/);
  const today = page.getByRole("region", { name: "Oggi" });
  const item = today.getByTestId("agenda-card").filter({ hasText: title });
  await expect(item).toBeVisible();

  await item.getByRole("checkbox", { name: `Completata: ${title}` }).click();
  await expect(item.getByRole("checkbox")).toBeChecked();
  await expectPersisted(page, () => expect(item.getByRole("checkbox")).toBeChecked());

  // The title opens the card dialog.
  await item.getByRole("button", { name: title }).click();
  await expect(page.getByRole("dialog", { name: title })).toBeVisible();
});
