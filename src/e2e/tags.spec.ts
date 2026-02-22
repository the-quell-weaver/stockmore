import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

test("authenticated user can create and rename tag", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const tagName = `飲水-${suffix}`;
  const renamedTagName = `飲用水-${suffix}`;

  await page.goto("/stock");
  await page.getByRole("link", { name: "標籤" }).click();
  await expect(page).toHaveURL(/\/stock\/tags/, { timeout: 15_000 });
  await expect(page.getByTestId("create-tag-form")).toBeVisible();

  const createForm = page.getByTestId("create-tag-form");
  await createForm.getByLabel("名稱").fill(tagName);
  await createForm.getByRole("button", { name: "新增標籤" }).click();

  await expect(page.getByTestId("tag-list")).toContainText(tagName, {
    timeout: 15_000,
  });

  const item = page.getByTestId("tag-item").filter({ hasText: tagName }).first();
  await item.getByTestId("rename-form").getByLabel("新名稱").fill(renamedTagName);
  await item.getByRole("button", { name: "儲存改名" }).click();

  await expect(page.getByTestId("tag-list")).toContainText(renamedTagName, {
    timeout: 15_000,
  });
});
