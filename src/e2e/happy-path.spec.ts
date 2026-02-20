import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'

test('authenticated user can create org, add item, inbound stock, and see stock row', async ({ page }) => {
  const suffix = randomUUID().slice(0, 8)
  const orgName = `Org-${suffix}`
  const itemName = `Item-${suffix}`

  await page.goto('/protected')

  await expect(page.getByText('This is a protected page that you can only see as an authenticated user')).toBeVisible()

  await page.getByLabel('Org 名稱').fill(orgName)
  await page.getByRole('button', { name: '建立 org' }).click()
  await expect(page.getByTestId('active-org')).toContainText(orgName)

  await page.getByLabel('品項名稱').fill(itemName)
  await page.getByRole('button', { name: '新增 item' }).click()

  await page.getByTestId('item-select').selectOption({ label: itemName })
  await page.getByLabel('數量').fill('9')
  await page.getByRole('button', { name: '入庫' }).click()

  await expect(page.getByTestId(`stock-row-${itemName}`)).toContainText(`${itemName}: 9`)
})
