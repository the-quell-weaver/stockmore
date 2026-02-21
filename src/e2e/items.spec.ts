import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

test("authenticated user can create, search, and update item", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const itemName = `Item-${suffix}`;
  const updatedNote = `note-${suffix}`;

  await page.goto("/stock/items");

  const createForm = page.getByTestId("create-item-form");
  await createForm.getByLabel("品名").fill(itemName);
  await createForm.getByLabel("單位").fill("pack");
  await createForm.getByLabel("最低庫存").fill("2");
  await createForm.getByRole("button", { name: "儲存品項" }).click();

  await expect(page.getByTestId("items-success")).toContainText("created");

  await page.getByTestId("items-search-input").fill(itemName);
  await page.getByRole("button", { name: "搜尋" }).click();

  const row = page.getByTestId(`item-row-${itemName}`);
  await expect(row).toBeVisible();
  await row.getByLabel("備註").fill(updatedNote);
  await row.getByRole("button", { name: "更新品項" }).click();

  await expect(page.getByTestId("items-success")).toContainText("updated");
  await expect(page.getByTestId(`item-row-${itemName}`).getByLabel("備註")).toHaveValue(updatedNote);
});
