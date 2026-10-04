import { expect, test } from "./fixtures";
import { addCards, addLists, cardIn, createBoard, list, settle } from "./helpers";

test("archive: restore a card (and its list), delete a board permanently", async ({ page }) => {
  const stamp = Date.now();
  const boardTitle = `Archivio ${stamp}`;
  const cardTitle = `Card archiviata ${stamp}`;
  const listTitle = `Lista archiviata ${stamp}`;
  await createBoard(page, boardTitle);
  await addLists(page, [listTitle]);
  await addCards(page, listTitle, [cardTitle]);

  // Archive the card, then its list.
  await page
    .getByRole("button", { name: `Azioni per ${cardTitle}`, exact: true })
    .click({ force: true });
  await page.getByRole("menuitem", { name: "Archivia" }).click();
  await expect(cardIn(list(page, listTitle), cardTitle)).toHaveCount(0);
  await page.getByRole("button", { name: `Azioni per ${listTitle}`, exact: true }).click();
  await page.getByRole("menuitem", { name: "Archivia lista" }).click();
  await expect(list(page, listTitle)).toHaveCount(0);
  await settle(page);

  // The archive is reachable from the user menu.
  await page.getByRole("button", { name: "Menu utente" }).click();
  await page.getByRole("menuitem", { name: "Archivio" }).click();
  await expect(page).toHaveURL(/\/archive$/);
  await expect(page.getByRole("region", { name: "Liste" })).toContainText(listTitle);
  await expect(page.getByRole("region", { name: "Card" })).toContainText(cardTitle);

  // Restoring the card brings back its list too.
  await page.getByRole("button", { name: `Ripristina ${cardTitle}` }).click();
  await expect(page.getByRole("region", { name: "Card" })).not.toContainText(cardTitle);
  await expect(page.getByRole("region", { name: "Liste" })).not.toContainText(listTitle);
  await page.goto("/boards");
  await page.getByRole("link", { name: boardTitle }).click();
  await expect(cardIn(list(page, listTitle), cardTitle)).toBeVisible();

  // Archive the board from its menu, then delete it permanently.
  await page.getByRole("button", { name: "Azioni board" }).click();
  await page.getByRole("menuitem", { name: "Archivia board" }).click();
  await expect(page).toHaveURL(/\/boards$/);
  await expect(page.getByRole("link", { name: boardTitle })).toHaveCount(0);
  await page.goto("/archive");
  const boards = page.getByRole("region", { name: "Board" });
  await expect(boards).toContainText(boardTitle);
  await page.getByRole("button", { name: `Elimina ${boardTitle}` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Elimina" }).click();
  await expect(boards).not.toContainText(boardTitle);
  await page.reload();
  await expect(boards).not.toContainText(boardTitle);
});

test("backup export returns every board as JSON and requires a session", async ({
  page,
  playwright,
  baseURL,
}) => {
  const boardTitle = `Backup ${Date.now()}`;
  await createBoard(page, boardTitle);
  await addLists(page, ["Contenuto"]);
  await addCards(page, "Contenuto", ["Da esportare"]);

  const response = await page.request.get("/api/export");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-disposition"]).toMatch(
    /attachment; filename="rdlproductivity-backup-\d{4}-\d{2}-\d{2}\.json"/,
  );
  const data = await response.json();
  expect(data).toMatchObject({ app: "rdlproductivity", version: 1 });
  const board = data.boards.find((b: { title: string }) => b.title === boardTitle);
  expect(board.lists[0].title).toBe("Contenuto");
  expect(board.lists[0].cards[0].title).toBe("Da esportare");

  // The menu link triggers a download.
  await page.getByRole("button", { name: "Menu utente" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "Esporta backup (JSON)" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^rdlproductivity-backup-.*\.json$/);

  // Without a session nothing is exported.
  const anonymous = await playwright.request.newContext({ baseURL });
  const denied = await anonymous.get("/api/export", { maxRedirects: 0 });
  expect(denied.status()).not.toBe(200);
  await anonymous.dispose();
});
