import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { checkMigration } from '../tools/check-migration'
import { cleanTempDirs, createTempDir, createTestContext } from './helpers'

function writeProject(files: Record<string, string>): string {
  const cwd = createTempDir('relizy-mcp-migration-')

  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(cwd, path)), { recursive: true })
    writeFileSync(join(cwd, path), content)
  }

  return cwd
}

const V1_CONFIG = `export default {
  monorepo: {
    groups: [
      { name: 'main', versionMode: 'selective', packages: ['packages/*'] },
      { name: 'tooling', title: 'Tooling', versionMode: 'independent', packages: ['tooling/*'] },
    ],
  },
  bump: { dependencyTypes: ['peerDependencies'] },
  ai: { providerRelease: { enabled: true } },
  templates: {
    commitMessage: 'chore(release): {{newVersion}}',
    twitterMessage: '📣 {{projectName}} {{newVersion}} is out!\\n\\n{{changelog}}\\n\\n{{releaseUrl}}',
  },
  social: {
    twitter: { enabled: true },
    slack: { enabled: true, template: '*{{projectName}} v{{version}}* {{changelog}}' },
  },
  hooks: {
    'success:social': () => {},
  },
}
`

const V1_SCRIPT = `import type { GroupBumpResult } from 'relizy'
import { buildReleaseSummary, confirmBump, formatTweetMessage, release as runRelease } from 'relizy'

export async function main(groups: GroupBumpResult[]) {
  await confirmBump({ versionMode: 'unified', packages: [], force: false, dryRun: false })
  formatTweetMessage({ template: '', projectName: 'p', version: '1.0.0', changelog: '', postMaxLength: 280 })
  await runRelease({ yes: true })
  return groups
}
`

afterAll(() => {
  cleanTempDirs()
})

describe('Given check_migration on a relizy 1 project', () => {
  let text: string

  beforeAll(async () => {
    const cwd = writeProject({
      'package.json': JSON.stringify({ name: 'monorepo', version: '1.0.0', private: true, devDependencies: { relizy: '^1.14.0' } }),
      'relizy.config.mjs': V1_CONFIG,
      'scripts/release.ts': V1_SCRIPT,
      'node_modules/other/index.js': `import { confirmBump } from 'relizy'\nconfirmBump()`,
    })

    text = await checkMigration(createTestContext(cwd), {})
  })

  it('Then asks to upgrade the dependency', () => {
    expect(text).toContain('**`relizy` is required as `^1.14.0` in `package.json`**')
  })

  it('Then points out the social templates to change, with their lines', () => {
    expect(text).toContain('**`{{version}}` is not a variable of the social templates** (`relizy.config.mjs:16`)')
    expect(text).toContain('**A social template builds the title of the release from `{{projectName}}` and `{{newVersion}}`** (`relizy.config.mjs:12`)')
    expect(text).toContain('sections: ["Release Title"]')
  })

  it('Then points out the dependency types that relied on the default ones', () => {
    expect(text).toContain('**`bump.dependencyTypes` without `dependencies`** (`relizy.config.mjs:8`)')
  })

  it('Then points out what changes with the version groups', () => {
    expect(text).toContain('**The version groups are released as one release**')
    expect(text).toContain('**Version groups without `title`: `main`**')
    expect(text).toContain('**Hooks of `social`, `twitter` or `slack` with version groups** (`relizy.config.mjs:19`)')
    expect(text).toContain('**AI provider releases for the `independent` groups `tooling`**')
  })

  it('Then points out the code calling the changed API, outside node_modules', () => {
    expect(text).toContain('**`confirmBump()` or the `confirm()` of a bump plan** (`scripts/release.ts:5`)')
    expect(text).toContain('**The social functions take the `variables` of the template** (`scripts/release.ts:2`, `scripts/release.ts:6`)')
    expect(text).toContain('**`GroupBumpResult` objects** (`scripts/release.ts:1`, `scripts/release.ts:4`)')
    expect(text).toContain('**Commands called from code: a refused prompt throws** (`scripts/release.ts:7`)')
    expect(text).toContain('**`buildReleaseSummary()` is replaced by the release report** (`scripts/release.ts:2`)')
    expect(text).not.toContain('node_modules/')
  })

  it('Then sorts the findings by what to change and what to review', () => {
    const toChange = text.slice(text.indexOf('## To change'), text.indexOf('## To review'))
    const toReview = text.slice(text.indexOf('## To review'))

    expect(toChange).toContain('## To change (7)')
    expect(toChange).toContain('`confirmBump()`')
    expect(toReview).toContain('## To review (8)')
    expect(toReview).toContain('`GroupBumpResult` objects')
    expect(toReview).toContain('`--dry-run` no longer calls the AI')
    expect(toReview).toContain('The PR comment of a release is its summary')
  })
})

describe('Given check_migration on a project already on relizy 2', () => {
  it('Then finds nothing to change', async () => {
    const cwd = writeProject({
      'package.json': JSON.stringify({ name: 'lib', version: '1.0.0', devDependencies: { relizy: '^2.0.0' } }),
      'relizy.config.mjs': `export default { social: { twitter: { enabled: true } } }\n`,
    })

    const text = await checkMigration(createTestContext(cwd), {})

    expect(text).toContain('## To change (0)\n\nNothing to change.')
    expect(text).toContain('## To review (0)\n\nNothing to review.')
  })
})

describe('Given check_migration on a project with the options renamed in relizy 2', () => {
  it('Then points out commitlint.codeBlocksLinter and the CommitlintCodeBlocksLinter type', async () => {
    const cwd = writeProject({
      'package.json': JSON.stringify({ name: 'lib', version: '1.0.0', devDependencies: { relizy: '^1.14.0' } }),
      'relizy.config.mjs': `export default {\n  commitlint: {\n    codeBlocksLinter: 'oxc',\n  },\n}\n`,
      'scripts/lint.ts': `import type { CommitlintCodeBlocksLinter } from 'relizy'\n\nexport const linter: CommitlintCodeBlocksLinter = 'oxc'\n`,
    })

    const text = await checkMigration(createTestContext(cwd), {})

    expect(text).toContain('**`commitlint.codeBlocksLinter` is renamed `commitlint.changelogLinter`** (`relizy.config.mjs:3`)')
    expect(text).toContain('**The `CommitlintCodeBlocksLinter` type is renamed `CommitlintChangelogLinter`** (`scripts/lint.ts:1`, `scripts/lint.ts:3`)')
  })
})
