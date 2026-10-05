import { expect, test } from "./fixtures";
import { addCards, addLists, cardIn, createBoard, expectPersisted, list, settle } from "./helpers";

test("completing a recurring card creates the next occurrence", async ({ page }) => {
  const stamp = Date.now();
  const title = `Settimanale ${stamp}`;
  await createBoard(page, `Ricorrenti ${stamp}`);
  await addLists(page, ["Routine"]);
  await addCards(page, "Routine", [title]);

  // Due today at 12:00, repeating every 2 weeks.
  await cardIn(list(page, "Routine"), title).click();
  const dialog = page.getByRole("dialog", { name: title });
  await dialog.getByRole("button", { name: "Ripeti" }).click();
  await expect(page.getByText("Imposta prima una scadenza")).toBeVisible();
  await page.keyboard.press("Escape");
  await dialog.getByRole("button", { name: "Date" }).click();
  await page.getByRole("checkbox", { name: "Data di scadenza" }).click();
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(dialog.getByTestId("due-badge")).toBeVisible();
  const due = await dialog.getByTestId("due-badge").innerText();

  await dialog.getByRole("button", { name: "Ripeti" }).click();
  await page.getByRole("combobox", { name: "Frequenza" }).click();
  await page.getByRole("option", { name: "Ogni settimana" }).click();
  await page.getByLabel("Ogni", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(dialog.getByRole("button", { name: "Ogni 2 settimane" })).toBeVisible();

  await dialog.getByRole("checkbox", { name: "Completata" }).click();
  await expect(page.getByText(/Creata la prossima occorrenza/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // The completed card no longer repeats; the new one does, two weeks later.
  const cards = cardIn(list(page, "Routine"), title);
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0).getByTestId("due-badge")).toHaveAttribute("data-status", "completed");
  await expect(cards.nth(0).getByTestId("recurring-badge")).toHaveCount(0);
  await expect(cards.nth(1).getByTestId("recurring-badge")).toBeVisible();
  await expect(cards.nth(1).getByTestId("due-badge")).not.toHaveText(due);
  await settle(page);

  await expectPersisted(page, async () => {
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(1).getByTestId("recurring-badge")).toBeVisible();
  });
});
