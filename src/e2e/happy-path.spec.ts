import { expect, test } from "@playwright/test";

test("authenticated user can reach stock from homepage CTA", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "PrepStock（綢繆）" })).toBeVisible();
  await expect(page.getByRole("link", { name: "前往庫存" })).toHaveAttribute(
    "href",
    "/stock",
  );

  await page.goto("/stock");
  await expect(page.getByRole("heading", { name: "Stock" })).toBeVisible();
});

test("/protected returns 404", async ({ page }) => {
  const response = await page.goto("/protected");

  expect(response?.status()).toBe(404);
});
