import { defineConfig } from 'vitest/config'

export const baseVitestConfig = defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
})
