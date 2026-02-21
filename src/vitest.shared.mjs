import { defineConfig } from 'vitest/config'
import path from 'node:path'

export const baseVitestConfig = defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
  test: {
    environment: 'node',
    globals: true,
  },
})
