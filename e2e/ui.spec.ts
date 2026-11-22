import { expectNoSeriousA11yIssues } from "./a11y";
import { expect, test } from "./fixtures";
import { addCards, addLists, cardIn, createBoard, list } from "./helpers";

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
  // Every main page, each with a full axe run.
  test.slow();
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
    "/today",
    "/priority",
    "/activity",
    "/templates",
    "/stats",
    "/kdp",
    "/kdp/incassi",
    "/kdp/pen-name",
    "/kdp/estensione",
    "/collane",
    "/robotti",
    "/robotti?view=mese",
    "/robotti?view=elenco",
    "/robotti/da-fare",
    "/scrittore",
    "/scrittore/da-fare",
    "/riepilogo",
  ]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expectNoSeriousA11yIssues(page);
  }
});

test("the board fits the window: lists scroll inside, the horizontal scrollbar stays visible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 600 });
  await createBoard(page, `Scroll ${Date.now()}`);
  await addLists(page, ["Lunga", "Due", "Tre", "Quattro", "Cinque"]);
  await addCards(
    page,
    "Lunga",
    Array.from({ length: 15 }, (_, i) => `Card ${i + 1}`),
  );

  // The page itself never scrolls vertically.
  const pageOverflowY = () =>
    page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  expect(await pageOverflowY()).toBeLessThanOrEqual(0);

  // The lists container scrolls horizontally and its bottom edge is on screen.
  const lists = page.getByTestId("board-lists");
  const metrics = await lists.evaluate((el) => ({
    overflowX: el.scrollWidth - el.clientWidth,
    bottom: el.getBoundingClientRect().bottom,
  }));
  expect(metrics.overflowX).toBeGreaterThan(0);
  expect(metrics.bottom).toBeLessThanOrEqual(600);

  // The long list scrolls its own cards.
  const cards = list(page, "Lunga").locator("ol");
  expect(await cards.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
});

test("main navigation: «Altro» groups the agenda views and works from the keyboard", async ({
  page,
}) => {
  await page.goto("/boards");
  // Keys pressed before hydration reach a plain button, not the menu.
  await page.waitForLoadState("networkidle");
  const nav = page.getByRole("navigation", { name: "Principale" });
  for (const name of ["Board", "KDP", "Robotti&Robotte", "Rosario Di Leva"]) {
    await expect(nav.getByRole("link", { name })).toBeVisible();
  }
  const more = nav.getByRole("button", { name: "Altro" });
  await more.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem")).toHaveText(["Oggi", "Priorità", "Calendario"]);
  await expect(menu.getByRole("menuitem", { name: "Oggi" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(more).toBeFocused();

  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "Priorità" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/priority$/);

  // The trigger names the current agenda view; the menu marks it as the current page.
  const current = nav.getByRole("button", { name: "Altro: Priorità" });
  await expect(current).toBeVisible();
  await expect(nav.getByRole("link", { name: "Board" })).not.toHaveAttribute("aria-current");
  await current.click();
  await expect(page.getByRole("menuitem", { name: "Priorità" })).toHaveAttribute(
    "aria-current",
    "page",
  );
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

    for (const path of [
      "/boards",
      "/calendar",
      "/archive",
      "/connections",
      "/today",
      "/priority",
      "/activity",
      "/templates",
      "/stats",
      "/collane",
    ]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(await pageOverflow(), path).toBeLessThanOrEqual(0);
    }
    // Every main menu entry fits beside the search and the user menu.
    const userMenu = (await page.getByRole("button", { name: "Menu utente" }).boundingBox())!;
    expect(userMenu.x + userMenu.width).toBeLessThanOrEqual(390);

    // The «Altro» menu opens inside the screen.
    await page
      .getByRole("navigation", { name: "Principale" })
      .getByRole("button", { name: /^Altro/ })
      .tap();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    const menuBox = (await menu.boundingBox())!;
    expect(menuBox.x).toBeGreaterThanOrEqual(0);
    expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(390);
    expect(await pageOverflow()).toBeLessThanOrEqual(0);
    await page.keyboard.press("Escape");
  });
});
