import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { addCards, addLists, cardIn, createBoard, list } from "./helpers";

async function expectNoSeriousA11yIssues(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(
    serious.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`),
  ).toEqual([]);
}

test("theme can be switched to dark and back, and persists across reloads", async ({ page }) => {
  await createBoard(page, `Tema ${Date.now()}`);
  await addLists(page, ["Uno"]);
  await addCards(page, "Uno", ["Card al buio"]);
  await page.getByRole("button", { name: "Menu utente" }).click();
  await page.getByRole("menuitemradio", { name: "Scuro" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expectNoSeriousA11yIssues(page);
  await cardIn(list(page, "Uno"), "Card al buio").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expectNoSeriousA11yIssues(page);
  await page.keyboard.press("Escape");
  await page.goto("/calendar");
  await page.waitForLoadState("networkidle");
  await expectNoSeriousA11yIssues(page);
  await page.getByRole("button", { name: "Menu utente" }).click();
  await page.getByRole("menuitemradio", { name: "Chiaro" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("accessibility: no serious axe violations on the main pages", async ({ page }) => {
  await createBoard(page, `A11y ${Date.now()}`);
  await addLists(page, ["Uno"]);
  await addCards(page, "Uno", ["Card accessibile"]);
  await expectNoSeriousA11yIssues(page);

  await cardIn(list(page, "Uno"), "Card accessibile").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expectNoSeriousA11yIssues(page);
  await page.keyboard.press("Escape");

  for (const path of [
    "/boards",
    "/calendar",
    "/search?q=accessibile",
    "/archive",
    "/connections",
  ]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expectNoSeriousA11yIssues(page);
  }
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("pages fit the viewport and the board scrolls horizontally", async ({ page }) => {
    await createBoard(page, `Mobile ${Date.now()}`);
    await addLists(page, ["Uno", "Due", "Tre"]);
    await addCards(page, "Uno", ["Card mobile"]);

    const pageOverflow = () =>
      page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(await pageOverflow()).toBeLessThanOrEqual(0);

    // The lists container scrolls instead of the page.
    const lastList = list(page, "Tre");
    await lastList.scrollIntoViewIfNeeded();
    await expect(lastList).toBeInViewport();
    expect(await pageOverflow()).toBeLessThanOrEqual(0);

    // The card dialog fits the screen.
    await cardIn(list(page, "Uno"), "Card mobile").tap();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    await page.keyboard.press("Escape");

    for (const path of ["/boards", "/calendar", "/archive", "/connections"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(await pageOverflow(), path).toBeLessThanOrEqual(0);
    }
  });
});
