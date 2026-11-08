import { expect, test } from "./fixtures";
import { expectPersisted } from "./helpers";
import { weekRangeLabel, weekStartOf } from "../src/lib/kdp";

// A far week no other test touches; the task is deleted at the end.
const day = "2031-06-04";
const week = weekStartOf(day)!;
const range = weekRangeLabel(week);

test("the Reale lane counts the weekly KDP slots per format, with manual corrections and limits", async ({
  page,
}) => {
  const title = `Uscita ${Date.now()}`;
  await page.goto(`/kdp?week=${day}`);
  const cell = page.getByRole("cell", { name: `Mario · Reale, settimana ${range}` });
  const slots = cell.getByTestId("kdp-slots");
  await expect(slots).toContainText("Ebook 2/2");
  await expect(slots).toContainText("Cartaceo 2/2");

  // A published book: ebook and paperback use one slot each.
  await cell.getByRole("button", { name: /^Aggiungi attività/ }).click();
  await cell.getByRole("textbox").fill(title);
  await cell.getByRole("textbox").press("Enter");
  const task = cell.getByTestId("kdp-task").filter({ hasText: title });
  await expect(task).toBeVisible();
  await task.getByRole("button", { name: title }).click();
  const dialog = page.getByRole("dialog", { name: "Attività KDP" });
  await dialog.getByRole("checkbox", { name: "Ebook" }).check();
  await dialog.getByRole("checkbox", { name: "Copertina flessibile" }).check();
  await dialog.getByRole("button", { name: "Salva" }).click();
  await expect(slots).toContainText("Ebook 1/2");
  await expect(slots).toContainText("Cartaceo 1/2");
  await expect(slots).toContainText("Rigida 2/2");
  await expectPersisted(page, async () => {
    await expect(cell.getByTestId("kdp-slots")).toContainText("Ebook 1/2");
  });

  // A book uploaded outside the calendar: one more ebook by hand.
  await cell.getByTestId("kdp-slots").click();
  const detail = page.getByTestId("kdp-slots-detail");
  await detail.getByRole("button", { name: "Un ebook usato in più" }).click();
  await expect(detail).toContainText("2 usati su 2 (1 dal calendario, +1 a mano)");
  await page.keyboard.press("Escape");
  await expectPersisted(page, async () => {
    await expect(cell.getByTestId("kdp-slots")).toContainText("Ebook 0/2");
  });

  // Mario gets his own limits: 3 ebooks a week.
  await page.getByRole("button", { name: "Limiti slot" }).click();
  const limits = page.getByRole("dialog", { name: "Limiti settimanali KDP" });
  await limits.getByRole("checkbox", { name: "Limiti propri per Mario" }).check();
  await limits.locator("#slot-fourth-ebook").fill("3");
  await limits.getByRole("button", { name: "Salva limiti" }).click();
  await expect(cell.getByTestId("kdp-slots")).toContainText("Ebook 1/3");

  // Back as it was: correction and limits off, task deleted.
  await cell.getByTestId("kdp-slots").click();
  await page
    .getByTestId("kdp-slots-detail")
    .getByRole("button", { name: "Un ebook usato in meno" })
    .click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Limiti slot" }).click();
  await limits.getByRole("checkbox", { name: "Limiti propri per Mario" }).uncheck();
  await limits.getByRole("button", { name: "Salva limiti" }).click();
  await task.getByRole("button", { name: title }).click();
  await dialog.getByRole("button", { name: "Elimina" }).click();
  await expectPersisted(page, async () => {
    await expect(cell.getByTestId("kdp-slots")).toContainText("Ebook 2/2");
  });
});
