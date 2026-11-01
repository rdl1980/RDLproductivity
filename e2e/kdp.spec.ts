import { expect, test } from "./fixtures";
import { dragTo, expectPersisted } from "./helpers";
import { todayIn, weekRangeLabel, weekStartOf } from "../src/lib/kdp";

// The server reads "today" in the owner's zone.
const today = todayIn(process.env.DEFAULT_TIME_ZONE ?? "Europe/Rome");
const week = weekRangeLabel(weekStartOf(today)!);

test("KDP calendar: add, complete, move between accounts and tracks, edit and delete tasks", async ({
  page,
}) => {
  const title = `Upload manoscritto ${Date.now()}`;
  await page.goto("/kdp");
  await expect(page.getByRole("heading", { name: "Calendario KDP" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Rosario", exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Ilaria", exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Rosario · Pianificato" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Ilaria · Reale" })).toBeVisible();
  // The third account has its own lanes.
  await expect(page.getByRole("columnheader", { name: "NonnoPeppe", exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "NonnoPeppe · Pianificato" })).toBeVisible();

  // Planned on the main account, then moved to what really happened on the secondary.
  const main = page.getByRole("cell", {
    name: `Rosario · Pianificato, settimana ${week}`,
  });
  const secondary = page.getByRole("cell", {
    name: `Ilaria · Reale, settimana ${week}`,
  });

  await main.getByRole("button", { name: /^Aggiungi attività/ }).click();
  await main.getByRole("textbox").fill(title);
  await main.getByRole("textbox").press("Enter");
  const task = (cell: typeof main) => cell.getByTestId("kdp-task").filter({ hasText: title });
  await expect(task(main)).toBeVisible();

  await task(main)
    .getByRole("checkbox", { name: `Fatta: ${title}` })
    .click();
  await expectPersisted(page, async () => {
    await expect(task(main).getByRole("checkbox")).toBeChecked();
  });

  // The week can sit low on the page and its cells grow with other tests' tasks:
  // centre the task and drop at its own height, inside the target cell of the same row.
  await task(main).evaluate((item) => item.scrollIntoView({ block: "center" }));
  await dragTo(page, task(main), secondary, { keepY: true });
  await expect(task(secondary)).toBeVisible();
  await expectPersisted(page, async () => {
    await expect(task(secondary)).toBeVisible();
    await expect(task(main)).toHaveCount(0);
  });

  await task(secondary).getByRole("button", { name: title }).click();
  const dialog = page.getByRole("dialog", { name: "Attività KDP" });
  await expect(dialog).toContainText("Ilaria · Reale");
  await dialog.getByLabel("Note").fill("ASIN B000TEST");
  await dialog.getByRole("button", { name: "Salva" }).click();
  await expectPersisted(page, async () => {
    await task(secondary).getByRole("button", { name: title }).click();
    await expect(page.getByRole("dialog").getByLabel("Note")).toHaveValue("ASIN B000TEST");
  });

  await page.getByRole("dialog").getByRole("button", { name: "Elimina" }).click();
  await expect(task(secondary)).toHaveCount(0);
  await expectPersisted(page, async () => {
    await expect(page.getByRole("heading", { name: "Calendario KDP" })).toBeVisible();
    await expect(task(secondary)).toHaveCount(0);
  });
});

test("KDP calendar shows eight Sunday-to-Saturday weeks from the chosen one", async ({ page }) => {
  // Opens on the current week.
  await page.goto("/kdp");
  await expect(page.getByTestId("kdp-week")).toHaveCount(8);
  await expect(page.getByRole("rowheader").first()).toContainText(week);
  await expect(page.getByRole("rowheader").first()).toHaveAttribute("aria-current", "date");

  // 1 October 2026 is a Thursday: its week starts on Sunday 27 September.
  await page.goto("/kdp?week=2026-10-01");
  await expect(page.getByRole("rowheader").first()).toContainText("27 set – 3 ott");
  await expect(page.getByTestId("kdp-range")).toHaveText("27 set – 21 nov 2026");

  await page.getByRole("link", { name: "Settimane successive" }).click();
  await expect(page).toHaveURL(/week=2026-10-25/);
  await expect(page.getByRole("rowheader").first()).toContainText("25 – 31 ott");

  // Older links by month open on the month's first week.
  await page.goto("/kdp?month=2026-11");
  await expect(page.getByRole("rowheader").first()).toContainText("1 – 7 nov");
});
