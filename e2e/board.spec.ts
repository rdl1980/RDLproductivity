import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

const list = (page: Page, title: string) =>
  page.getByTestId("list").filter({ has: page.getByRole("button", { name: title, exact: true }) });
const cardTitles = (column: Locator) => column.getByTestId("card").allInnerTexts();

/** Waits until optimistic items have been saved (temp items are not draggable). */
async function settle(page: Page) {
  await expect(page.locator('[aria-roledescription="sortable"][aria-disabled="true"]')).toHaveCount(
    0,
  );
  await page.waitForLoadState("networkidle");
}

async function dragTo(page: Page, source: Locator, target: Locator) {
  const from = (await source.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2 + 2, { steps: 2 });
  await page.mouse.up();
}

test("create a board, lists and cards, move a card and persist everything", async ({ page }) => {
  const boardTitle = `E2E ${Date.now()}`;

  await page.goto("/");
  await expect(page).toHaveURL(/\/boards$/);

  await page.getByRole("button", { name: "Crea una board" }).click();
  await page.getByLabel("Titolo").fill(boardTitle);
  await page.getByRole("button", { name: "Verde" }).click();
  await page.getByRole("button", { name: "Crea", exact: true }).click();
  await expect(page).toHaveURL(/\/boards\/[^/]+$/);
  await expect(page.getByRole("heading", { name: boardTitle })).toBeVisible();

  // Two lists through the composer, which stays open after each Enter.
  await page.getByRole("button", { name: "Aggiungi una lista" }).click();
  const listInput = page.getByLabel("Titolo della lista");
  await listInput.fill("Da fare");
  await listInput.press("Enter");
  await listInput.fill("Fatto");
  await listInput.press("Enter");
  await listInput.press("Escape");
  await expect(page.getByTestId("list")).toHaveCount(2);
  await settle(page);

  // Cards via the `n` shortcut on the hovered list.
  await list(page, "Da fare").hover();
  await page.keyboard.press("n");
  const cardInput = page.getByLabel("Titolo della card");
  for (const title of ["Uno", "Due", "Tre"]) {
    await cardInput.fill(title);
    await cardInput.press("Enter");
  }
  await cardInput.press("Escape");
  await expect.poll(() => cardTitles(list(page, "Da fare"))).toEqual(["Uno", "Due", "Tre"]);

  await settle(page);
  await page.reload();
  await expect.poll(() => cardTitles(list(page, "Da fare"))).toEqual(["Uno", "Due", "Tre"]);

  // Move "Uno" into the empty "Fatto" list.
  await dragTo(
    page,
    list(page, "Da fare").getByTestId("card").filter({ hasText: "Uno" }),
    list(page, "Fatto"),
  );
  await expect.poll(() => cardTitles(list(page, "Fatto"))).toEqual(["Uno"]);
  await settle(page);

  // Reorder inside "Da fare": "Tre" above "Due".
  await dragTo(
    page,
    list(page, "Da fare").getByTestId("card").filter({ hasText: "Tre" }),
    list(page, "Da fare").getByTestId("card").filter({ hasText: "Due" }),
  );
  await expect.poll(() => cardTitles(list(page, "Da fare"))).toEqual(["Tre", "Due"]);
  await settle(page);

  // Rename and archive through the card menu.
  await page.getByRole("button", { name: "Azioni per Due" }).click({ force: true });
  await page.getByRole("menuitem", { name: "Rinomina" }).click();
  const rename = page.getByLabel("Titolo della card");
  await rename.fill("Due bis");
  await rename.press("Enter");
  await page.getByRole("button", { name: "Azioni per Tre" }).click({ force: true });
  await page.getByRole("menuitem", { name: "Archivia" }).click();

  await settle(page);
  await page.reload();
  await expect.poll(() => cardTitles(list(page, "Da fare"))).toEqual(["Due bis"]);
  await expect.poll(() => cardTitles(list(page, "Fatto"))).toEqual(["Uno"]);
});

test("reorder lists by dragging their header", async ({ page }) => {
  await page.goto("/boards");
  await page.getByRole("button", { name: "Crea una board" }).click();
  await page.getByLabel("Titolo").fill(`Liste ${Date.now()}`);
  await page.getByRole("button", { name: "Crea", exact: true }).click();
  await expect(page).toHaveURL(/\/boards\/[^/]+$/);

  await page.getByRole("button", { name: "Aggiungi una lista" }).click();
  const input = page.getByLabel("Titolo della lista");
  for (const title of ["A", "B", "C"]) {
    await input.fill(title);
    await input.press("Enter");
  }
  await input.press("Escape");
  await settle(page);

  const titles = () =>
    page.getByTestId("list").locator('header button[title="Rinomina"]').allInnerTexts();
  await dragTo(page, list(page, "C").locator("header"), list(page, "A").locator("header"));
  await expect.poll(titles).toEqual(["C", "A", "B"]);

  await settle(page);
  await page.reload();
  await expect.poll(titles).toEqual(["C", "A", "B"]);
});
