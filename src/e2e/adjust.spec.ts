import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

// Minimal E2E smoke test for UC-07 (Adjustment):
//   item → inbound → adjust → verify stock view reflects new quantity.
//
// Prerequisites (handled by global-setup): authenticated session cookie.

test("authenticated user can adjust a batch quantity", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const itemName = `AdjItem-${suffix}`;
  // The option label rendered by the page is "<itemName>（<unit>）"
  const itemLabel = `${itemName}（瓶）`;

  // ── Step 1: Create item ───────────────────────────────────────────────────
  await page.goto("/stock/items");

  const createForm = page.getByTestId("create-item-form");
  await createForm.getByLabel("品名").fill(itemName);
  await createForm.getByLabel("單位").fill("瓶");
  await createForm.getByLabel("最低庫存").fill("0");
  await createForm.getByRole("button", { name: "儲存品項" }).click();

  await expect(page).toHaveURL(/\/stock\/items\?success=created/, { timeout: 15_000 });

  // ── Step 2: Confirm item visible in list ──────────────────────────────────
  await page.goto("/stock/items");
  await page.getByTestId("items-search-input").fill(itemName);
  await page.getByRole("button", { name: "搜尋" }).click();

  const itemRow = page.getByTestId(`item-row-${itemName}`);
  await expect(itemRow).toBeVisible();

  // ── Step 3: Inbound — create batch with quantity=10 ───────────────────────
  await page.goto("/stock/inbound");

  await page.getByTestId("item-select").selectOption({ label: itemLabel });
  await page.getByRole("button", { name: "確認" }).click();

  await expect(page.getByTestId("inbound-new-batch-form")).toBeVisible({ timeout: 10_000 });

  await page.getByTestId("inbound-new-batch-form").getByTestId("quantity-input").fill("10");
  await page.getByTestId("inbound-new-batch-form").getByTestId("submit-inbound").click();

  await expect(page).toHaveURL(/\/stock\/inbound\?success=created/, { timeout: 15_000 });

  // ── Step 4: Navigate to adjust page ──────────────────────────────────────
  await page.goto("/stock/adjust");
  await expect(page.getByTestId("adjust-page")).toBeVisible();

  await page.getByTestId("item-select").selectOption({ label: itemLabel });
  await page.getByRole("button", { name: "確認" }).click();

  // Wait for batch list to appear
  await expect(page.getByTestId("batch-list")).toBeVisible({ timeout: 10_000 });

  // Verify current quantity shown is 10
  await expect(page.getByTestId("batch-summary-quantity").first()).toContainText("10");

  // ── Step 5: Submit adjustment to actual quantity=7 ────────────────────────
  const adjustForm = page.getByTestId("adjust-form").first();
  await adjustForm.getByTestId("adjust-quantity-input").fill("7");
  await adjustForm.getByTestId("adjust-note-input").fill("inventory recount");
  await adjustForm.getByTestId("submit-adjust").click();

  await expect(page).toHaveURL(/\/stock\/adjust\?success=adjusted/, { timeout: 15_000 });
  await expect(page.getByTestId("adjust-success")).toBeVisible();

  // ── Step 6: Verify batch quantity updated on adjust page (after re-select) ─
  await page.getByTestId("item-select").selectOption({ label: itemLabel });
  await page.getByRole("button", { name: "確認" }).click();

  await expect(page.getByTestId("batch-list")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("batch-summary-quantity").first()).toContainText("7");
});
