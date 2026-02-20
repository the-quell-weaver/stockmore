import { expect, test } from '@playwright/test'

test('login page can request a magic link', async ({ page }) => {
  await page.route('**/auth/v1/otp**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'access-control-allow-origin': '*',
      },
      body: JSON.stringify({}),
    })
  })

  await page.goto('/login')
  await page.getByLabel('Email').fill('user@example.com')
  await page.getByRole('button', { name: 'Send magic link' }).click()

  await expect(
    page.getByText('Check your email for the magic link to sign in.'),
  ).toBeVisible()
})
