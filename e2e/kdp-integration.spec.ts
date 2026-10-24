import { expect, test } from "./fixtures";
import { mondayOf, todayIn, weekRangeLabel } from "../src/lib/kdp";

const today = todayIn(process.env.DEFAULT_TIME_ZONE ?? "Europe/Rome");
const week = mondayOf(today)!;

test("this week's KDP tasks show in Today and in the calendar, and search finds them", async ({
  page,
}) => {
  const title = `Caricare interni ${Date.now()}`;
  await page.goto("/kdp");
  const cell = page.getByRole("cell", {
    name: `Account principale · Pianificato, settimana ${weekRangeLabel(week)}`,
  });
  await cell.getByRole("button", { name: /^Aggiungi attività/ }).click();
  await cell.getByRole("textbox").fill(title);
  await cell.getByRole("textbox").press("Enter");
  await expect(cell.getByTestId("kdp-task").filter({ hasText: title })).toBeVisible();

  // Today: the task can be ticked from there.
  await page.goto("/today");
  const row = page.getByTestId("kdp-week-task").filter({ hasText: title });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Account principale · Pianificato");
  await row.getByRole("checkbox").click();
  await expect(row.getByRole("checkbox")).toBeChecked();
  await page.reload();
  await expect(
    page.getByTestId("kdp-week-task").filter({ hasText: title }).getByRole("checkbox"),
  ).toBeChecked();

  // Calendar: the Monday of the week links to the KDP calendar.
  await page.goto(`/calendar?date=${today}`);
  const monday = page.locator(`[data-day="${week}"]`);
  await expect(monday.getByTestId("calendar-kdp")).toContainText("KDP:");
  await expect(monday.getByTestId("calendar-kdp")).toHaveAttribute(
    "href",
    `/kdp?month=${week.slice(0, 7)}`,
  );

  // Search: KDP tasks are results too.
  await page.goto(`/search?q=${encodeURIComponent(title)}`);
  const result = page.getByRole("region", { name: "Attività KDP" });
  await expect(result).toContainText(title);
  await expect(result).toContainText("fatta");
});
