/// <reference types="vitest" />

import { coverageConfigDefaults, defaultExclude, defineConfig } from 'vitest/config'
import { isInCI } from './src/core/utils'

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
        'src/cli.ts',
        '**/*/index.ts',
        'src/types.ts',
        'src/commands/__tests__/*',
      ],
      thresholds: {
        autoUpdate: !isInCI(),
        statements: 82.03,
        functions: 86.74,
        branches: 77.5,
        lines: 81.98,
      },
    },
    exclude: defaultExclude,
  },
})