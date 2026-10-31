import { expect, test } from "./fixtures";
import { dragTo, expectPersisted } from "./helpers";

/** A far week of its own (Monday), so parallel runs do not meet. */
function ownWeek(stamp: number) {
  return new Date(Date.UTC(2034, 0, 2 + 7 * (stamp % 400))).toISOString().slice(0, 10);
}
const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

test("week view: an empty slot becomes a piece, its layers drive the status, platforms filter", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const stamp = Date.now();
  const monday = ownWeek(stamp);
  const code = `ui${stamp}`;
  const title = `Trono UI ${stamp}`;

  await page.goto(`/robotti?view=settimana&date=${monday}`);
  await expect(page.getByTestId("content-week")).toBeVisible();
  await expect(page.getByTestId("cycle-week")).toHaveText(/Settimana [ABCD]/);

  // Monday 19:00 plans Il Trono: the placeholder creates the piece with date, slot and rubric.
  const mondayEvening = page.getByRole("cell", { name: /19:00 principale/ }).first();
  await mondayEvening.getByTestId("empty-slot").filter({ hasText: "Il Trono" }).click();
  const dialog = page.getByTestId("piece-dialog");
  await expect(dialog.getByLabel("Rubrica")).toHaveValue("il-trono");
  await expect(dialog.getByLabel("Data di uscita")).toHaveValue(monday);
  await dialog.getByLabel("Codice (es. ep002)").fill(code);
  await dialog.getByLabel("Titolo").fill(title);
  await dialog.getByRole("button", { name: "Crea scheda" }).click();

  // The detail: one tab per default layer, texts with a Copy button.
  await expect(dialog.getByRole("tab")).toHaveText(["TikTok", "YouTube", "Instagram"]);
  const tiktok = dialog.getByTestId("layer-tiktok");
  await tiktok.getByLabel("Didascalia (con hashtag)").fill("Chi vince? #robottierobotte");
  await tiktok.getByRole("button", { name: "Salva TikTok" }).click();
  await expect(tiktok.getByRole("button", { name: /Copia\s+Didascalia/ })).toBeVisible();

  // Scheduling every layer from the checklist makes the piece "programmato".
  for (const platform of ["TikTok", "YouTube", "Instagram"]) {
    await dialog.getByRole("tab", { name: platform }).click();
    const checkbox = dialog.getByRole("checkbox", { name: `Programmato (${platform})` });
    await checkbox.click();
    await expect(checkbox).toBeChecked();
  }
  await expect(dialog.getByRole("heading", { name: title })).toBeVisible();
  await expect(dialog.getByTestId("piece-history")).toContainText("rosario");
  await page.keyboard.press("Escape");

  const card = page.locator(`[data-testid="content-piece"][data-code="${code}"]`);
  await expect(card).toContainText("programmato");
  await expect(card.getByTestId("layer-badge")).toHaveCount(3);
  await expect(mondayEvening.getByTestId("empty-slot").filter({ hasText: "Il Trono" })).toHaveCount(
    0,
  );

  // Only Instagram: the card keeps one badge.
  await page.getByRole("button", { name: "TikTok", exact: true }).click();
  await page.getByRole("button", { name: "YouTube", exact: true }).click();
  await expect(card.getByTestId("layer-badge")).toHaveCount(1);
  await expect(card.getByTestId("layer-badge")).toHaveAttribute("data-platform", "instagram");
  await page.getByRole("button", { name: "TikTok", exact: true }).click();
  await page.getByRole("button", { name: "YouTube", exact: true }).click();

  // Dragging moves it to Tuesday 13:00, and the layers' times follow.
  const tuesdayNoon = page.getByRole("cell", { name: /13:00 extra/ }).nth(1);
  await dragTo(page, card, tuesdayNoon);
  await expectPersisted(page, async () => {
    await expect(
      page
        .getByRole("cell", { name: /13:00 extra/ })
        .nth(1)
        .locator(`[data-code="${code}"]`),
    ).toBeVisible();
  });

  // Archive from the detail; the list view finds it among the archived and restores it.
  await page.locator(`[data-code="${code}"]`).getByRole("button").first().click();
  await dialog.getByRole("button", { name: "Archivia" }).click();
  await expect(dialog.getByText("archiviata", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(`[data-code="${code}"]`)).toHaveCount(0);

  await page.goto(`/robotti?view=elenco&date=${monday}`);
  const list = page.getByTestId("content-list");
  await expect(list).not.toContainText(code);
  await page.getByLabel("Archiviate").check();
  await list.getByRole("button", { name: title }).click();
  await dialog.getByRole("button", { name: "Ripristina" }).click();
  await expect(dialog.getByText("archiviata", { exact: true })).toHaveCount(0);
});

test("month view shows the pieces as dots and links to their week", async ({ page }) => {
  const stamp = Date.now();
  const monday = ownWeek(stamp + 7);
  const code = `mese${stamp}`;
  await page.goto(`/robotti?view=settimana&date=${monday}`);
  await page.getByRole("button", { name: "Nuova scheda" }).click();
  const dialog = page.getByTestId("piece-dialog");
  await dialog.getByLabel("Codice (es. ep002)").fill(code);
  await dialog.getByLabel("Titolo").fill(`Mese ${stamp}`);
  await dialog.getByLabel("Rubrica").selectOption("carosello");
  await dialog.getByLabel("Data di uscita").fill(addDays(monday, 6));
  await dialog.getByRole("button", { name: "Crea scheda" }).click();
  // A carousel only goes to Instagram.
  await expect(dialog.getByRole("tab")).toHaveText(["Instagram"]);
  await page.keyboard.press("Escape");

  await page.goto(`/robotti?view=mese&date=${addDays(monday, 6)}`);
  const day = page
    .getByTestId("month-day")
    .filter({ has: page.locator(`[title^="Mese ${stamp}"]`) });
  await expect(day).toHaveCount(1);
  await day.click();
  await expect(page).toHaveURL(/view=settimana/);
  await expect(page.locator(`[data-code="${code}"]`)).toBeVisible();
});

test("a cell adds a piece inline with the next code of the rubric", async ({ page }) => {
  const stamp = Date.now();
  const monday = ownWeek(stamp + 14);
  const title = `In cella ${stamp}`;
  await page.goto(`/robotti?view=settimana&date=${monday}`);

  const cell = page.getByRole("cell", { name: /13:00 extra/ }).nth(2);
  await cell.getByRole("button", { name: /Aggiungi contenuto/ }).click();
  await cell.getByRole("textbox", { name: /Nuovo contenuto/ }).fill(title);
  await cell.getByRole("combobox", { name: /Rubrica del nuovo contenuto/ }).selectOption("pov");
  await cell.getByRole("button", { name: "Aggiungi", exact: true }).click();

  const card = cell.getByTestId("content-piece").filter({ hasText: title });
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("data-code", /^pov\d{3,}$/);
  await expect(card).toContainText("idea");
  // The form stays open for the next one.
  await expect(cell.getByRole("textbox", { name: /Nuovo contenuto/ })).toHaveValue("");
  await expectPersisted(page, async () => {
    await expect(page.getByText(title)).toBeVisible();
  });
});

test("the week starts from yesterday and the to-do tab checks items off", async ({ page }) => {
  test.setTimeout(90_000);
  const stamp = Date.now();
  const title = `Da fare ${stamp}`;
  await page.goto("/robotti");
  // Yesterday, then today.
  const headers = page.getByTestId("content-week").getByRole("columnheader");
  await expect(headers.nth(2)).toHaveAttribute("aria-current", "date");

  // A carousel today, with its Instagram layer ready: «Da programmare».
  const cell = page.getByRole("cell", { name: /19:00 principale/ }).nth(1);
  await cell.getByRole("button", { name: /Aggiungi contenuto/ }).click();
  await cell.getByRole("textbox", { name: /Nuovo contenuto/ }).fill(title);
  await cell
    .getByRole("combobox", { name: /Rubrica del nuovo contenuto/ })
    .selectOption("carosello");
  await cell.getByRole("button", { name: "Aggiungi", exact: true }).click();
  const card = cell.getByTestId("content-piece").filter({ hasText: title });
  await card.getByRole("button").first().click();
  const dialog = page.getByTestId("piece-dialog");
  const instagram = dialog.getByTestId("layer-instagram");
  await instagram.getByLabel("Stato di pubblicazione").selectOption("pronto");
  await instagram.getByRole("button", { name: "Salva Instagram" }).click();
  await expect(dialog.getByRole("checkbox", { name: "Programmato (Instagram)" })).toBeVisible();
  await expect(async () => {
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden({ timeout: 1_000 });
  }).toPass();

  await page.getByRole("link", { name: /^Da fare/ }).click();
  await expect(page).toHaveURL(/\/robotti\/da-fare/);
  const item = page.getByTestId("todo-item").filter({ hasText: `Da programmare: ${title}` });
  await expect(item).toHaveCount(1);
  await item.getByRole("checkbox").click();
  await expectPersisted(page, async () => {
    await expect(page.getByTestId("todo-item").filter({ hasText: title })).toHaveCount(0);
  });
  // Done means scheduled: the layer is now «programmato».
  await page.goto("/robotti");
  await expect(
    page.locator(`[data-testid="content-piece"]`, { hasText: title }).getByTestId("layer-badge"),
  ).toHaveAttribute("data-status", "programmato");

  // An empty slot is only remembered as done, and can be put back.
  await page.goto("/robotti/da-fare");
  const slot = page.locator('[data-testid="todo-item"][data-kind="slot"]').first();
  const text = (await slot.getByRole("button").textContent())!;
  await slot.getByRole("checkbox").click();
  const done = page.getByTestId("todo-done");
  await done.locator("summary").click();
  await expect(done).toContainText(text);
  await done
    .getByRole("button", { name: `Rimetti da fare: ${text}` })
    .first()
    .click();
  await expect(page.getByTestId("todo-item").filter({ hasText: text }).first()).toBeVisible();
});
