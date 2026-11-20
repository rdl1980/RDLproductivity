import { expect, test } from "./fixtures";
import { expectPersisted } from "./helpers";

/** A far week of its own (Monday), away from the Robotti tests' weeks. */
function ownWeek(stamp: number) {
  return new Date(Date.UTC(2036, 0, 7 + 7 * (stamp % 400))).toISOString().slice(0, 10);
}

test("the writer calendar runs beside Robotti: own rubrics, one 18:00 slot, Instagram only", async ({
  page,
}) => {
  const stamp = Date.now();
  const monday = ownWeek(stamp);
  const title = `Parola ${stamp}`;

  await page.goto("/robotti");
  await page
    .getByRole("navigation", { name: "Principale" })
    .getByRole("link", { name: "Rosario Di Leva" })
    .click();
  await expect(page).toHaveURL(/\/scrittore$/);
  await expect(page.getByRole("heading", { name: "Rosario Di Leva" })).toBeVisible();

  await page.goto(`/scrittore?view=settimana&date=${monday}`);
  const week = page.getByTestId("content-week");
  // One slot a day, no platform toggles nor A/B/C/D cycle.
  await expect(week.getByRole("rowheader")).toHaveText(["18:00"]);
  await expect(page.getByTestId("platform-toggles")).toHaveCount(0);
  await expect(page.getByTestId("cycle-week")).toHaveCount(0);
  // The plan leaves a rubric a day to fill; none of Robotti's.
  await expect(week.getByTestId("empty-slot")).toHaveCount(7);
  await expect(week.getByTestId("empty-slot").first()).toContainText("Notizia AI dal Loop");
  await expect(week.getByText(/Il Trono/)).toHaveCount(0);

  // Tuesday's empty slot creates a piece of its rubric, with an Instagram post.
  await week.getByTestId("empty-slot").nth(1).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Rubrica")).toHaveValue("la-parola-della-settimana");
  await expect(dialog.getByLabel("Fascia")).toHaveValue("18:00");
  await dialog.getByLabel("Codice (es. ep002)").fill(`parola${stamp}`);
  await dialog.getByLabel("Titolo").fill(title);
  await dialog.getByRole("button", { name: "Crea scheda" }).click();
  await expect(dialog.getByRole("tab", { name: "Instagram" })).toBeVisible();
  await expect(dialog.getByRole("tab", { name: "TikTok" })).toHaveCount(0);
  await expect(dialog.getByLabel("Tipo")).toHaveValue("Post");
  await page.keyboard.press("Escape");

  await expectPersisted(page, async () => {
    const card = page.getByTestId("content-piece").filter({ hasText: title });
    await expect(card).toHaveAttribute("data-code", /^parola\d{3,}$/);
    await expect(week.getByTestId("empty-slot")).toHaveCount(6);
  });

  // Robotti does not see it.
  await page.goto(`/robotti?view=settimana&date=${monday}`);
  await expect(page.getByText(title)).toHaveCount(0);
});
