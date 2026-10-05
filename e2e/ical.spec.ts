import { expect, test } from "./fixtures";
import { addCards, addLists, cardIn, createBoard, list, settle } from "./helpers";

test("the private iCal feed lists due cards and can be rotated and disabled", async ({
  page,
  request,
}) => {
  const stamp = Date.now();
  const title = `Feed ${stamp}`;
  await createBoard(page, `iCal ${stamp}`);
  await addLists(page, ["Lista"]);
  await addCards(page, "Lista", [title]);
  await cardIn(list(page, "Lista"), title).click();
  const dialog = page.getByRole("dialog", { name: title });
  await dialog.getByRole("button", { name: "Date" }).click();
  await page.getByRole("checkbox", { name: "Data di scadenza" }).click();
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(dialog.getByTestId("due-badge")).toBeVisible();
  await page.keyboard.press("Escape");
  await settle(page);

  await page.goto("/connections");
  const enable = page.getByRole("button", { name: "Attiva il feed" });
  if (await enable.isVisible()) await enable.click();
  const url = await page.getByTestId("ical-url").innerText();
  expect(url).toMatch(/\/api\/calendar\/[\w-]+\.ics$/);

  // Calendar apps fetch it without a session.
  const feed = await request.get(url);
  expect(feed.status()).toBe(200);
  expect(feed.headers()["content-type"]).toContain("text/calendar");
  const body = await feed.text();
  expect(body).toContain("BEGIN:VCALENDAR");
  expect(body).toContain(`SUMMARY:${title}`);

  // A new URL revokes the old one.
  await page.getByRole("button", { name: "Rigenera URL" }).click();
  await expect(page.getByTestId("ical-url")).not.toHaveText(url);
  const rotated = await page.getByTestId("ical-url").innerText();
  expect((await request.get(url)).status()).toBe(404);
  expect((await request.get(rotated)).status()).toBe(200);

  await page.getByRole("button", { name: "Disattiva" }).click();
  await expect(page.getByRole("button", { name: "Attiva il feed" })).toBeVisible();
  expect((await request.get(rotated)).status()).toBe(404);
});
