import { expect, test } from "@playwright/test";

// AC1 + AC2: unauthenticated visitor gets redirected and sees seeded stock data
test("unauthenticated visitor: /demo redirects to /stock with seed data visible", async ({
  browser,
}) => {
  const baseURL =
    process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5566";
  // Fresh context with no auth state (overrides the global storageState)
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  await page.goto("/demo");

  await expect(page).toHaveURL(/\/stock/, { timeout: 20_000 });

  // At least one seeded item name should be visible
  await expect(
    page.getByText("礦泉水").or(page.getByText("即食乾糧")),
  ).toBeVisible({ timeout: 10_000 });

  await context.close();
});

// AC5: authenticated (non-anonymous) user visiting /demo is redirected to /stock
// Uses the default pre-authenticated storageState from global-setup
test("authenticated user: /demo redirects to /stock without clearing their session", async ({
  page,
}) => {
  await page.goto("/demo");
  await expect(page).toHaveURL(/\/stock/, { timeout: 10_000 });
  // Verify they weren't signed out (stock page heading renders correctly)
  await expect(page.getByRole("heading", { name: "庫存列表" })).toBeVisible({
    timeout: 5_000,
  });
});
