import { join } from 'node:path'
import process from 'node:process'
import { defineConfig } from './packages/relizy/src'
import { generateAgentDocs } from './packages/relizy/src/core/mcp/knowledge/generate'

export default defineConfig({
  // The name of the published package, not the one of the private root of the repository
  projectName: 'relizy',

  monorepo: {
    groups: [
      // relizy owns the root version, the `v*` tags and the root CHANGELOG.md
      {
        name: 'relizy',
        title: 'relizy',
        versionMode: 'selective',
        packages: ['packages/relizy'],
      },
      // @relizy/core has its own version line and its own `@relizy/core@x.y.z` tags
      {
        name: 'core',
        title: '@relizy/core',
        versionMode: 'independent',
        packages: ['packages/core'],
        changelog: { rootChangelog: false },
      },
    ],
  },

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
    providerRelease: { enabled: true },
    social: {
      twitter: { enabled: true },
    },
  },

  templates: {
    emptyChangelogContent: 'No relevant changes since last release',
    changelogTitle: '{{newVersion}} ({{date}})',
  },

  publish: {
    registry: 'https://registry.npmjs.org',
    buildCmd: process.env.CI ? undefined : 'pnpm build',
    access: 'public',
    packageManager: 'pnpm',
  },

  social: {
    changelogUrl: 'https://relizy.dev/changelog',
    twitter: { enabled: true },
  },
  prComment: {
    mode: 'update',
  },
  commitlint: {
    scopes: ['docs', 'release', 'deps'],
  },
  mergePreview: {
    // The pull requests are merged with a merge commit, never squashed
    squash: false,
  },
  hooks: {
    // The CI builds before the bump: the docs bundle of the MCP server (agent-docs/) gets the new version
    'success:bump': () => {
      generateAgentDocs({
        rootDir: join(process.cwd(), 'packages/relizy'),
      })
    },
  },
})
