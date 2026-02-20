import { mergeConfig } from 'vitest/config'
import { baseVitestConfig } from './vitest.shared.mjs'

export default mergeConfig(baseVitestConfig, {
  test: {
    name: 'integration',
    include: ['**/*.integration.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/.next/**', '**/e2e/**'],
  },
})
