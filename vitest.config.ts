/// <reference types="vitest" />

import { coverageConfigDefaults, defaultExclude, defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [],
  test: {
    globals: true,
    silent: process.env.CI ? 'passed-only' : false,
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: process.env.CI ? ['lcov'] : ['html', 'lcov', 'text', 'text-summary'],
      include: ['src/**/*'],
      exclude: [
        ...coverageConfigDefaults.exclude,
        '.claude/**',
        'src/cli.ts',
        '**/*/index.ts',
        'src/types.ts',
        'src/commands/__tests__/*',
        'src/**/*.md',
      ],
      thresholds: {
        autoUpdate: !process.env.CI,
        statements: 96.62,
        functions: 98.85,
        branches: 91.78,
        lines: 96.52,
      },
    },
    exclude: [...defaultExclude, '.claude/**'],
  },
})
