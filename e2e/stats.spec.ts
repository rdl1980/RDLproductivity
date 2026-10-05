import { expect, test } from "./fixtures";
import { addCards, addLists, cardIn, createBoard, dragTo, list, settle } from "./helpers";

test("the statistics page counts completions and shows time in list", async ({ page }) => {
  const stamp = Date.now();
  const title = `Stat ${stamp}`;
  const stage = `Fase ${stamp}`;
  await createBoard(page, `Statistiche ${stamp}`);
  await addLists(page, ["Inizio", stage]);
  await addCards(page, "Inizio", [title, `Altra ${stamp}`]);

  // Move one card to a uniquely named list and complete the other.
  await dragTo(page, cardIn(list(page, "Inizio"), title), list(page, stage));
  await expect(cardIn(list(page, stage), title)).toHaveCount(1);
  await cardIn(list(page, "Inizio"), `Altra ${stamp}`).click();
  const dialog = page.getByRole("dialog", { name: `Altra ${stamp}` });
  await dialog.getByRole("checkbox", { name: "Completata" }).click();
  await expect(dialog.getByRole("checkbox", { name: "Completata" })).toBeChecked();
  await page.keyboard.press("Escape");
  await settle(page);

  await page.getByRole("button", { name: "Menu utente" }).click();
  await page.getByRole("menuitem", { name: "Statistiche" }).click();
  await expect(page).toHaveURL(/\/stats$/);

  const completedTile = page
    .getByTestId("stat-tile")
    .filter({ has: page.getByText("Completate", { exact: true }) });
  await expect(completedTile).not.toContainText("–");
  expect(Number(await completedTile.locator(".text-3xl").innerText())).toBeGreaterThanOrEqual(1);

  // This week's column includes the completion, also in the table view.
  const weekly = page.getByRole("region", { name: "Card completate per settimana" });
  await expect(weekly.getByRole("group", { name: /ultime 12 settimane/ })).toBeVisible();
  await expect(weekly.getByRole("img")).toHaveCount(12);
  await weekly.getByText("Mostra tabella").click();
  const lastRow = weekly.locator("tbody tr").last();
  expect(Number(await lastRow.locator("td").last().innerText())).toBeGreaterThanOrEqual(1);

  const age = page.getByRole("region", { name: "Tempo medio nella lista" });
  await age.getByText("Mostra tabella").click();
  await expect(age.locator("tbody")).toContainText(`${stage} (1 card)`);
});
