import type { Locator, Page } from "@playwright/test";

import { expect } from "./fixtures";

export const list = (page: Page, title: string) =>
  page.getByTestId("list").filter({ has: page.getByRole("button", { name: title, exact: true }) });

export const cardIn = (column: Locator, title: string) =>
  column.getByTestId("card").filter({ hasText: title });

export const cardTitles = (column: Locator) =>
  column.getByTestId("card").locator("[data-card-title]").allInnerTexts();

/** Waits until optimistic items have been saved (temp items are not draggable). */
export async function settle(page: Page) {
  await expect(page.locator('[aria-roledescription="sortable"][aria-disabled="true"]')).toHaveCount(
    0,
  );
  await page.waitForLoadState("networkidle");
}

export async function dragTo(page: Page, source: Locator, target: Locator) {
  const from = (await source.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });
  // Give dnd-kit a frame to compute collisions before dropping.
  await page.waitForTimeout(100);
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2 + 2, { steps: 2 });
  await page.waitForTimeout(50);
  await page.mouse.up();
}

/** Creates a board and returns its URL. */
export async function createBoard(page: Page, title: string) {
  await page.goto("/boards");
  await page.getByRole("button", { name: "Crea una board" }).click();
  await page.getByLabel("Titolo").fill(title);
  await page.getByRole("button", { name: "Crea", exact: true }).click();
  await expect(page).toHaveURL(/\/boards\/[^/?]+$/);
  return page.url();
}

export async function addLists(page: Page, titles: string[]) {
  await page.getByRole("button", { name: /Aggiungi (una|un'altra) lista/ }).click();
  const input = page.getByLabel("Titolo della lista");
  for (const title of titles) {
    await input.fill(title);
    await input.press("Enter");
  }
  await input.press("Escape");
  await settle(page);
}

export async function addCards(page: Page, listTitle: string, titles: string[]) {
  await list(page, listTitle).getByRole("button", { name: "Aggiungi una card" }).click();
  const input = page.getByLabel("Titolo della card");
  for (const title of titles) {
    await input.fill(title);
    await input.press("Enter");
  }
  await input.press("Escape");
  await settle(page);
}
