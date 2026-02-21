import { expect, test } from '@playwright/test'

test('login page can request a magic link', async ({ page }) => {
  await page.route('**/auth/v1/otp*', async (route) => {
    const request = route.request()
    if (request.method() !== 'POST') {
      await route.continue()
      return
    }

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
  await page.evaluate(() => {
    ;(window as unknown as { __captureAuthRedirectTo?: boolean })
      .__captureAuthRedirectTo = true
  })
  await page.getByLabel('Email').fill('user@example.com')
  const [request] = await Promise.all([
    page.waitForRequest(
      (req) => req.url().includes('/auth/v1/otp') && req.method() === 'POST',
    ),
    page.getByRole('button', { name: 'Send magic link' }).click(),
  ])

  const capturedRedirectUrl = extractRedirectUrlFromRequest(request)

  expect(capturedRedirectUrl).not.toBeNull()
  expect(capturedRedirectUrl).toContain('localhost:5566')
  expect(capturedRedirectUrl).toContain('/auth/callback')
  expect(capturedRedirectUrl).toContain('next=%2Fstock')
  expect(capturedRedirectUrl).toContain('type=magiclink')

  await expect(
    page.getByText('Check your email for the magic link to sign in.'),
  ).toBeVisible()
})

function extractRedirectUrlFromRequest(request: {
  url(): string
  postData(): string | null
  postDataBuffer(): Buffer | null
  postDataJSON?: () => unknown
}): string | null {
  try {
    const url = new URL(request.url())
    const fromQuery = url.searchParams.get('redirect_to')
    if (fromQuery) return fromQuery
  } catch {
    // ignore
  }

  try {
    if (request.postDataJSON) {
      const json = request.postDataJSON()
      const candidate = findRedirectUrl(json)
      if (candidate) return candidate
    }
  } catch {
    // ignore json parse errors
  }

  const postData =
    request.postData() ?? request.postDataBuffer()?.toString('utf8') ?? ''

  if (!postData) return null

  try {
    const json = JSON.parse(postData) as Record<string, unknown>
    const candidate = findRedirectUrl(json)
    if (candidate) return candidate
  } catch {
    // fall through to url-encoded scan
  }

  const params = new URLSearchParams(postData)
  return (
    params.get('email_redirect_to') ??
    params.get('redirect_to') ??
    params.get('emailRedirectTo') ??
    params.get('redirectTo')
  )
}

function findRedirectUrl(value: unknown): string | null {
  if (!value) return null
  if (typeof value === 'string') {
    return value.startsWith('http') ? value : null
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findRedirectUrl(entry)
      if (found) return found
    }
    return null
  }
  if (typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (
        key === 'emailRedirectTo' ||
        key === 'redirectTo' ||
        key === 'email_redirect_to' ||
        key === 'redirect_to'
      ) {
        if (typeof entry === 'string') return entry
      }
      const found = findRedirectUrl(entry)
      if (found) return found
    }
  }
  return null
}
