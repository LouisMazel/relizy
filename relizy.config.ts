import { defineConfig } from './src'

export default defineConfig({
  types: {
    feat: { title: '🚀 Features', semver: 'minor' },
    perf: { title: '🔥 Performance', semver: 'patch' },
    fix: { title: '🩹 Fixes', semver: 'patch' },
    refactor: { title: '💅 Refactors', semver: 'patch' },
    types: { title: '🌊 Types', semver: 'patch' },
    style: { title: '💄 Styles', semver: 'patch' },
    docs: { title: '📖 Documentation' },
    test: { title: '🧪 Tests' },
    chore: false,
    examples: false,
    ci: false,
    build: false,
  },

  templates: {
    emptyChangelogContent: 'No relevant changes since last release',
  },

  changelog: {
    formatCmd: 'git add --all && pnpm pre-commit && git reset',
  },

  publish: {
    registry: 'https://registry.npmjs.org',
    buildCmd: process.env.CI ? undefined : 'pnpm build',
    access: 'public',
    token: process.env.RELIZY_NPM_TOKEN,
    packageManager: 'npm',
  },
})
