import path from "node:path";

import { expect, test } from "./fixtures";
import { addCards, addLists, cardIn, createBoard, expectPersisted, list } from "./helpers";

const file = (name: string) => path.join(__dirname, "files", name);

test("attachments: upload, cover, download and delete", async ({ page, playwright, baseURL }) => {
  const stamp = Date.now();
  const title = `Allegati ${stamp}`;
  await createBoard(page, `Files ${stamp}`);
  await addLists(page, ["Lista"]);
  await addCards(page, "Lista", [title]);

  await cardIn(list(page, "Lista"), title).click();
  const dialog = page.getByRole("dialog", { name: title });
  await dialog
    .getByTestId("attachment-input")
    .setInputFiles([file("cover.png"), file("notes.txt")]);
  const attachments = dialog.getByTestId("attachment");
  await expect(attachments).toHaveCount(2);
  await expect(dialog.getByRole("region", { name: "Allegati" })).toContainText("cover.png");

  // The image previews inline; the text file downloads.
  const thumbnail = attachments.filter({ hasText: "cover.png" }).locator("img");
  await expect.poll(() => thumbnail.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(40);
  const notesHref = await attachments
    .filter({ hasText: "notes.txt" })
    .getByRole("link", { name: "Scarica notes.txt" })
    .getAttribute("href");
  const download = await page.request.get(notesHref!);
  expect(download.status()).toBe(200);
  expect(download.headers()["content-disposition"]).toContain("attachment");
  expect(await download.text()).toBe("Verbale riunione\n");

  // Files are private: no session, no file.
  const anonymous = await playwright.request.newContext({ baseURL });
  const denied = await anonymous.get(notesHref!, { maxRedirects: 0 });
  expect([307, 401]).toContain(denied.status());
  await anonymous.dispose();

  // Cover image on the board card.
  await dialog.getByRole("button", { name: "Usa cover.png come copertina" }).click();
  await expect(
    dialog.getByRole("button", { name: "Rimuovi cover.png come copertina" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  const card = cardIn(list(page, "Lista"), title);
  await expect(card.getByTestId("card-cover")).toBeVisible();
  await expect(card.getByTestId("attachments-badge")).toContainText("2");
  await expectPersisted(page, () => expect(card.getByTestId("card-cover")).toBeVisible());

  // Deleting the cover image removes the cover too.
  await card.click();
  await attachments
    .filter({ hasText: "cover.png" })
    .getByRole("button", { name: "Elimina cover.png" })
    .click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Elimina" }).click();
  await expect(attachments).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(card.getByTestId("card-cover")).toHaveCount(0);
  await expect(card.getByTestId("attachments-badge")).toContainText("1");
  await expectPersisted(page, () =>
    expect(card.getByTestId("attachments-badge")).toContainText("1"),
  );
});
