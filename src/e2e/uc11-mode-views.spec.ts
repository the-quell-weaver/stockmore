import { expect, test } from "@playwright/test";

test.describe("UC-11 mode-based stock views", () => {
  test("mode tabs are visible and switch correctly", async ({ page }) => {
    await page.goto("/stock");

    await expect(page.getByRole("link", { name: "消耗" })).toBeVisible();
    await expect(page.getByRole("link", { name: "採買規劃" })).toBeVisible();
    await expect(page.getByRole("link", { name: "入庫盤點" })).toBeVisible();

    await page.getByRole("link", { name: "採買規劃" }).click();
    await expect(page).toHaveURL(/mode=plan/);

    await page.getByRole("link", { name: "入庫盤點" }).click();
    await expect(page).toHaveURL(/mode=restock/);

    await page.getByRole("link", { name: "消耗" }).click();
    await expect(page).toHaveURL(/\/stock/);
  });

  test("consume mode (default) is active when no mode param is set", async ({ page }) => {
    await page.goto("/stock");
    const consumeTab = page.getByRole("link", { name: "消耗" });
    await expect(consumeTab).toHaveClass(/border-primary/);
  });

  test("restock mode loads without error", async ({ page }) => {
    await page.goto("/stock?mode=restock");
    await expect(page.locator("body")).not.toContainText("Unauthorized");
    await expect(page.locator("body")).not.toContainText("Error");
    // Wait for the list to render (empty state or items)
    await expect(
      page.locator(".divide-y, .text-muted-foreground").first()
    ).toBeVisible({ timeout: 5000 });
  });

  test("plan mode shows empty state or items without error", async ({ page }) => {
    await page.goto("/stock?mode=plan");
    await expect(page.locator("body")).not.toContainText("Unauthorized");
    await expect(page.locator("body")).not.toContainText("Error");
    // Wait for content: either empty state message or items list
    await expect(
      page.locator(".divide-y, .text-muted-foreground").first()
    ).toBeVisible({ timeout: 5000 });
  });
});
