import { expect, test } from '@playwright/test'

test('stock page shows default warehouse after bootstrap', async ({ page }) => {
  await page.goto('/stock')
  await expect(page.getByText('倉庫：Default Warehouse')).toBeVisible()
})
