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
        '.claude/worktrees',
        'src/cli.ts',
        '**/*/index.ts',
        'src/types.ts',
        'src/commands/__tests__/*',
      ],
      thresholds: {
        autoUpdate: !isInCI(),
        statements: 95.65,
        functions: 98.85,
        branches: 91.44,
        lines: 95.51,
      },
    },
    exclude: [...defaultExclude, '.claude/worktrees'],
  },
})
