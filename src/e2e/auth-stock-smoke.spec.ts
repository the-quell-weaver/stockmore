import { expect, test } from "@playwright/test";

test("authenticated user can access /stock", async ({ page }) => {
  await page.goto("/stock");

  await expect(page.getByRole("heading", { name: "庫存列表" })).toBeVisible();
});

test("unauthenticated user is redirected to /login when opening /stock", async ({ browser }) => {
  const context = await browser.newContext({
    storageState: {
      cookies: [],
      origins: [],
    },
  });
  const page = await context.newPage();

  await page.goto("/stock");

  await expect(page).toHaveURL(/\/login\?error=AUTH_REQUIRED&next=%2Fstock/);

  await context.close();
});
