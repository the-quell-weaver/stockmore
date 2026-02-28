import { expect, test } from "@playwright/test";

test.describe("UC-12: print inventory", () => {
  test("print button is visible on /stock", async ({ page }) => {
    await page.goto("/stock");
    await expect(page.getByRole("button", { name: "列印" })).toBeVisible();
  });

  test("clicking print button calls window.print", async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as Record<string, unknown>).__printCalled = false;
      window.print = () => {
        (window as unknown as Record<string, unknown>).__printCalled = true;
      };
    });
    await page.goto("/stock");
    await page.getByRole("button", { name: "列印" }).click();
    const called = await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__printCalled,
    );
    expect(called).toBe(true);
  });
});
