import { expect, test } from "./fixtures";
import { expectPersisted } from "./helpers";
import { addWeeks, weekRangeLabel, weekStartOf } from "../src/lib/kdp";

// A far week of its own for each run, so leftovers of a failed run never count.
const stamp = Date.now();
const week = addWeeks(weekStartOf("2040-01-01")!, (stamp % 1000) * 2);
const next = addWeeks(week, 1);

test("a Pianificato cell moves to the following week, after what is already there", async ({
  page,
}) => {
  const [a, b, c] = [`Bozza A ${stamp}`, `Bozza B ${stamp}`, `Già lì ${stamp}`];
  await page.goto(`/kdp?week=${week}`);
  const cell = (w: string) =>
    page.getByRole("cell", { name: `Ilaria · Pianificato, settimana ${weekRangeLabel(w)}` });
  const add = async (w: string, title: string) => {
    const input = cell(w).getByRole("textbox");
    await cell(w)
      .getByRole("button", { name: /^Aggiungi attività/ })
      .click();
    await input.fill(title);
    await input.press("Enter");
    await expect(cell(w).getByTestId("kdp-task").filter({ hasText: title })).toBeVisible();
    await input.press("Escape");
  };
  const titles = (w: string) => cell(w).getByTestId("kdp-task").allInnerTexts();

  await expect(cell(week).getByTestId("kdp-shift")).toHaveCount(0);
  await add(week, a);
  await add(week, b);
  await add(next, c);
  // Done tasks move too.
  await cell(week).getByRole("checkbox").first().check();

  await cell(week)
    .getByRole("button", { name: "Sposta le attività pianificate di Ilaria alla settimana dopo" })
    .click();
  await expect(page.locator("[data-sonner-toast]")).toContainText("2 attività spostate");
  await expectPersisted(page, async () => {
    await expect(cell(week).getByTestId("kdp-task")).toHaveCount(0);
    expect(await titles(next)).toEqual([c, a, b].map((t) => expect.stringContaining(t)));
    await expect(cell(next).getByRole("checkbox", { name: `Fatta: ${a}` })).toBeChecked();
  });

  // Clean up.
  for (const title of [a, b, c]) {
    await cell(next).getByRole("button", { name: title }).click();
    const dialog = page.getByRole("dialog", { name: "Attività KDP" });
    await dialog.getByRole("button", { name: "Elimina" }).click();
    await expect(cell(next).getByTestId("kdp-task").filter({ hasText: title })).toHaveCount(0);
  }
});
