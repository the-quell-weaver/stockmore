import { expect, test } from '@playwright/test'

test('login page can request a magic link', async ({ page }) => {
  await page.route('**/auth/v1/otp**', async (route) => {
    const request = route.request()
    const postData = request.postData() ?? ''
    const redirectUrl = extractRedirectUrl(postData)

    expect(redirectUrl).not.toBeNull()
    expect(redirectUrl).toContain('localhost:5566')
    expect(redirectUrl).toContain('/auth/callback')
    expect(redirectUrl).toContain('next=%2Fstock')
    expect(redirectUrl).toContain('type=magiclink')

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

function extractRedirectUrl(postData: string): string | null {
  if (!postData) return null

  try {
    const json = JSON.parse(postData) as Record<string, unknown>
    const candidate = findRedirectUrl(json)
    if (candidate) return candidate
  } catch {
    // fall through to raw scan
  }

  const rawMatch = postData.match(/https?:[^\"'\\s]+/i)
  return rawMatch?.[0] ?? null
}

function findRedirectUrl(value: unknown): string | null {
  if (!value) return null
  if (typeof value === 'string') {
    if (value.includes('/auth/callback')) return value
    return null
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findRedirectUrl(entry)
      if (found) return found
    }
    return null
  }
  if (typeof value === 'object') {
    for (const entry of Object.values(value)) {
      const found = findRedirectUrl(entry)
      if (found) return found
    }
  }
  return null
}
