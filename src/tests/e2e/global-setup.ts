import { provisionAuthState } from './auth-state'

async function warmupPages(baseUrl: string) {
  const paths = ['/stock', '/stock/items', '/stock/locations', '/stock/tags']
  await Promise.all(
    paths.map((p) =>
      fetch(`${baseUrl}${p}`, { redirect: 'manual' }).catch(() => {}),
    ),
  )
  // Give webpack time to finish compiling newly triggered bundles
  await new Promise((resolve) => setTimeout(resolve, 3000))
}

async function globalSetup() {
  await provisionAuthState()
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5566'
  await warmupPages(baseUrl)
}

export default globalSetup
