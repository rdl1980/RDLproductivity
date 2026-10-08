import { expect, test } from "./fixtures";
import { dragTo, expectPersisted } from "./helpers";
import { mondayOf, shiftMonth, todayIn, weekRangeLabel } from "../src/lib/kdp";

// The server reads "today" in the owner's zone.
const today = todayIn(process.env.DEFAULT_TIME_ZONE ?? "Europe/Rome");
const week = weekRangeLabel(mondayOf(today)!);

test("KDP calendar: add, complete, move between lanes, edit and delete tasks", async ({ page }) => {
  const title = `Upload manoscritto ${Date.now()}`;
  await page.goto("/kdp");
  await expect(page.getByRole("heading", { name: "Calendario KDP" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Account principale" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Account secondario" })).toBeVisible();

  const main = page.getByRole("cell", { name: `Account principale, settimana ${week}` });
  const secondary = page.getByRole("cell", { name: `Account secondario, settimana ${week}` });

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

  await dragTo(page, task(main), secondary);
  await expect(task(secondary)).toBeVisible();
  await expectPersisted(page, async () => {
    await expect(task(secondary)).toBeVisible();
    await expect(task(main)).toHaveCount(0);
  });

  await task(secondary).getByRole("button", { name: title }).click();
  const dialog = page.getByRole("dialog", { name: "Attività KDP" });
  await expect(dialog).toContainText("Account secondario");
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

test("KDP calendar navigates by month, one row per week", async ({ page }) => {
  await page.goto("/kdp?month=2026-10");
  await expect(page.getByTestId("kdp-month")).toHaveText("Ottobre 2026");
  // 28 Sep to 1 Nov: five weeks.
  await expect(page.getByTestId("kdp-week")).toHaveCount(5);
  await expect(page.getByRole("rowheader").first()).toContainText("28 set – 4 ott");

  await page.getByRole("link", { name: "Mese successivo" }).click();
  await expect(page).toHaveURL(new RegExp(`month=${shiftMonth("2026-10", 1)}`));
  await expect(page.getByTestId("kdp-month")).toHaveText("Novembre 2026");
  // 1 November is a Sunday: its week starts in October.
  await expect(page.getByRole("rowheader").first()).toContainText("26 ott – 1 nov");
});
