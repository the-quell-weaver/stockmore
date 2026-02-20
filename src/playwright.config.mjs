import path from 'node:path'
import { defineConfig } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5566'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  globalSetup: path.resolve('./tests/e2e/global-setup.ts'),
  globalTeardown: path.resolve('./tests/e2e/global-teardown.ts'),
  use: {
    baseURL,
    storageState: path.resolve('./playwright/.auth/user.json'),
    trace: 'retain-on-failure',
  },
})
