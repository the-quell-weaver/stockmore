import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

// E2E smoke test for UC-06 (Consumption):
//   item → inbound → consume → verify stock view reflects reduced quantity.
//
// Prerequisites (handled by global-setup): authenticated session cookie.

test("authenticated user can consume from a batch", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const itemName = `ConsumeItem-${suffix}`;
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

  // ── Step 2: Inbound — create batch with quantity=10 ───────────────────────
  await page.goto("/stock/inbound");

  await page.getByTestId("item-select").selectOption({ label: itemLabel });
  await page.getByRole("button", { name: "確認" }).click();

  await expect(page.getByTestId("inbound-new-batch-form")).toBeVisible({ timeout: 10_000 });

  await page.getByTestId("inbound-new-batch-form").getByTestId("quantity-input").fill("10");
  await page.getByTestId("inbound-new-batch-form").getByTestId("submit-inbound").click();

  await expect(page).toHaveURL(/\/stock\/inbound\?success=inbound_created/, { timeout: 15_000 });

  // ── Step 3: Navigate to consume page ─────────────────────────────────────
  await page.goto("/stock/consume");
  await expect(page.getByTestId("consume-page")).toBeVisible();

  await page.getByTestId("item-select").selectOption({ label: itemLabel });
  await page.getByRole("button", { name: "確認" }).click();

  // Wait for batch list to appear
  await expect(page.getByTestId("batch-list")).toBeVisible({ timeout: 10_000 });

  // Verify current quantity shown is 10
  await expect(page.getByTestId("batch-summary-quantity").first()).toContainText("10");

  // ── Step 4: Submit consumption of 3 units ────────────────────────────────
  const consumeForm = page.getByTestId("consume-form").first();
  await consumeForm.getByTestId("consume-quantity-input").fill("3");
  await consumeForm.getByTestId("consume-note-input").fill("used in drill");
  await consumeForm.getByTestId("submit-consume").click();

  await expect(page).toHaveURL(/\/stock\/consume\?success=consumed/, { timeout: 15_000 });
  await expect(page.getByTestId("consume-success")).toBeVisible();

  // ── Step 5: Verify batch quantity updated to 7 (re-select item) ──────────
  await page.getByTestId("item-select").selectOption({ label: itemLabel });
  await page.getByRole("button", { name: "確認" }).click();

  await expect(page.getByTestId("batch-list")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("batch-summary-quantity").first()).toContainText("7");
});
