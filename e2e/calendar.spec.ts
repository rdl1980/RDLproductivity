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

/** "YYYY-MM-DD" in the browser's time zone, `offset` days from today. */
function dayKeyIn(page: import("@playwright/test").Page, offset: number) {
  return page.evaluate((days) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }, offset);
}

// Six week rows of a month fit with room to spare: a drop on the last rows of a
// 720px window falls in dnd-kit's auto-scroll band and misses its day.
test.use({ viewport: { width: 1280, height: 1100 } });

test("calendar shows due cards, moves them by drag and filters by board", async ({ page }) => {
  const stamp = Date.now();
  const boardTitle = `Calendario ${stamp}`;
  const cardTitle = `Riunione ${stamp}`;
  await createBoard(page, boardTitle);
  await addLists(page, ["Agenda"]);
  await addCards(page, "Agenda", [cardTitle]);

  // Due today at 12:00 (the default when enabling the due date).
  await cardIn(list(page, "Agenda"), cardTitle).click();
  const dialog = page.getByRole("dialog", { name: cardTitle });
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
    .getByRole("button", { name: /^Altro/ })
    .click();
  await page.getByRole("menuitem", { name: "Calendario" }).click();
  await expect(page).toHaveURL(/\/calendar$/);
  const today = await dayKeyIn(page, 0);
  const chip = page.getByTestId("calendar-card").filter({ hasText: cardTitle });
  await expect(page.locator(`[data-day="${today}"]`)).toContainText(cardTitle);

  // Drag to a neighbouring day in the same week row: on the last day of the week
  // tomorrow starts the next row.
  const todayTop = (await page.locator(`[data-day="${today}"]`).boundingBox())!.y;
  const tomorrow = await dayKeyIn(page, 1);
  const tomorrowBox = await page.locator(`[data-day="${tomorrow}"]`).boundingBox();
  const target = tomorrowBox?.y === todayTop ? tomorrow : await dayKeyIn(page, -1);
  await dragTo(page, chip, page.locator(`[data-day="${target}"]`));
  await expect(page.locator(`[data-day="${target}"]`)).toContainText(cardTitle);
  await expectPersisted(page, () =>
    expect(page.locator(`[data-day="${target}"]`)).toContainText(cardTitle),
  );

  // Click opens the detail dialog; time of day is preserved (12:00).
  await chip.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("due-badge")).toContainText("12:00");
  await page.keyboard.press("Escape");

  // Week view of the target day.
  await page.goto(`/calendar?view=week&date=${target}`);
  await expect(page.getByTestId("calendar-day")).toHaveCount(7);
  await expect(page.locator(`[data-day="${target}"]`)).toContainText(cardTitle);

  // Board filter.
  await page.getByRole("combobox", { name: "Filtro board" }).click();
  await page.getByRole("option", { name: boardTitle }).click();
  await expect(page).toHaveURL(/board=/);
  await expect(chip).toBeVisible();
  await page.getByRole("combobox", { name: "Filtro board" }).click();
  await page.getByRole("option", { name: "Tutte le board" }).click();
  await expect(page).not.toHaveURL(/board=/);
  await expect(chip).toBeVisible();

  // Month navigation keeps working.
  await page.getByRole("button", { name: "Mese" }).click();
  await page.getByRole("button", { name: "Periodo successivo" }).click();
  await expect(page).toHaveURL(/date=/);
  await page.getByRole("button", { name: "Oggi", exact: true }).click();
  await expect(page.locator(`[data-day="${today}"]`)).toBeVisible();
});
