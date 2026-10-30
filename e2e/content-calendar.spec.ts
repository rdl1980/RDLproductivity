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
