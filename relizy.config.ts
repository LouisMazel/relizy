import { defineConfig } from './src'

export default defineConfig({
  types: {
    feat: { title: '🚀 Features', semver: 'minor' },
    perf: { title: '🔥 Performance', semver: 'patch' },
    fix: { title: '🩹 Fixes', semver: 'patch' },
    refactor: { title: '💅 Refactors', semver: 'patch' },
    types: { title: '🌊 Types', semver: 'patch' },
    style: { title: '💄 Styles', semver: 'patch' },
    build: { title: '📦 Build', semver: 'patch' },
    docs: { title: '📖 Documentation' },
    test: { title: '🧪 Tests' },
    chore: false,
    examples: false,
    ci: false,
  },

  ai: {
    provider: 'claude-code',
    providers: {
      'claude-code': {
        oauthToken: process.env.CLAUDE_CODE_OAUTH_TOKEN,
      },
    },
    providerRelease: { enabled: true },
    social: { twitter: { enabled: true }, slack: { enabled: false } },
  },

  templates: {
    emptyChangelogContent: 'No relevant changes since last release',
    changelogTitle: '{{newVersion}} ({{date}})',
  },

  changelog: {
    formatCmd: 'git add --all && pnpm pre-commit && git reset',
  },

  publish: {
    registry: 'https://registry.npmjs.org',
    buildCmd: process.env.CI ? undefined : 'pnpm build',
    access: 'public',
    token: process.env.RELIZY_NPM_TOKEN,
    packageManager: 'pnpm',
    safetyCheck: true,
  },

  social: {
    changelogUrl: 'https://relizy.pages.dev/changelog',
    twitter: {
      enabled: true,
    },
  },
  prComment: {
    mode: 'append',
  },
  safetyCheck: true,
})
