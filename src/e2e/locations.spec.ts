import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

test("authenticated user can create and rename storage location", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const locationName = `客廳-${suffix}`;
  const renamedLocationName = `客廳抽屜-${suffix}`;

  await page.goto("/stock");
  await page.getByRole("link", { name: "存放點" }).click();
  await expect(page).toHaveURL(/\/stock\/locations/, { timeout: 15_000 });
  await expect(page.getByTestId("create-location-form")).toBeVisible();

  const createForm = page.getByTestId("create-location-form");
  await createForm.getByLabel("名稱").fill(locationName);
  await createForm.getByRole("button", { name: "新增存放點" }).click();

  await expect(page.getByTestId("location-list")).toContainText(locationName, {
    timeout: 15_000,
  });

  const item = page.getByTestId("location-item").filter({ hasText: locationName }).first();
  await item.getByTestId("rename-form").getByLabel("新名稱").fill(renamedLocationName);
  await item.getByRole("button", { name: "儲存改名" }).click();

  await expect(page.getByTestId("location-list")).toContainText(renamedLocationName, {
    timeout: 15_000,
  });
});
