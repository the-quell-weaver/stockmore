import { mergeConfig } from 'vitest/config'
import { baseVitestConfig } from './vitest.shared.mjs'

export default mergeConfig(baseVitestConfig, {
  test: {
    name: 'unit',
    include: ['**/*.unit.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/.next/**', '**/e2e/**'],
  },
})
