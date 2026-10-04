import { expect, test } from "@playwright/test";

test("unauthenticated visitors are redirected to the login page", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "RDL Productivity" })).toBeVisible();
  await expect(page.getByText("Accedi per continuare")).toBeVisible();
});

test("login page shows access denied errors", async ({ page }) => {
  await page.goto("/login?error=AccessDenied");
  await expect(page.getByRole("alert").filter({ hasText: "autorizzato" })).toHaveText(
    "Questo account non è autorizzato ad accedere.",
  );
});
