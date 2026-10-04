import { expect, test } from "@playwright/test";

test("home page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("RDL Productivity");
  await expect(page.getByRole("heading", { name: "RDL Productivity" })).toBeVisible();
});
