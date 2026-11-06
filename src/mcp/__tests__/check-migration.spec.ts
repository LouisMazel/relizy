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
import { buildReleaseSummary, confirmBump, formatTweetMessage, BUILT_IN_RULES as rules, release as runRelease } from 'relizy'

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
    expect(text).toContain('**`relizy` no longer exports `buildReleaseSummary`, `confirmBump`, `formatTweetMessage`, `BUILT_IN_RULES`** (`scripts/release.ts:2`)')
    expect(text).toContain('`confirmBump()`: `bump()`, with `dryRun` to preview it')
    expect(text).toContain('`formatTweetMessage()`: `social()`, or the `release` parameter of a hook')
    expect(text).toContain('`buildReleaseSummary()`: the report returned by `release()`')
    expect(text).toContain('`BUILT_IN_RULES`: internal, use the commands or the CLI')
    expect(text).toContain('sections: ["Public API"]')
    expect(text).toContain('**`GroupBumpResult` objects** (`scripts/release.ts:1`, `scripts/release.ts:4`)')
    expect(text).toContain('**Commands called from code: a refused prompt throws** (`scripts/release.ts:7`)')
    expect(text).not.toContain('node_modules/')
  })

  it('Then sorts the findings by what to change and what to review', () => {
    const toChange = text.slice(text.indexOf('## To change'), text.indexOf('## To review'))
    const toReview = text.slice(text.indexOf('## To review'))

    expect(toChange).toContain('## To change (5)')
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

describe('Given check_migration on a relizy 1 project linting its commits', () => {
  it('Then points out the commits crediting an AI tool, unless the rule is configured', async () => {
    const files = {
      'package.json': JSON.stringify({ name: 'lib', version: '1.0.0', devDependencies: { relizy: '^1.14.0' } }),
      '.husky/commit-msg': 'pnpm exec relizy commitlint --edit "$1"\n',
    }

    expect(await checkMigration(createTestContext(writeProject(files)), {})).toContain('`relizy commitlint` rejects the commits crediting an AI tool')

    const configured = writeProject({ ...files, 'relizy.config.mjs': `export default { commitlint: { rules: { 'no-ai-attribution': 'off' } } }\n` })
    expect(await checkMigration(createTestContext(configured), {})).not.toContain('crediting an AI tool')
  })
})

describe('Given check_migration on a relizy 1 project with a formatter', () => {
  it('Then points out the changelogs formatted by it, unless changelog.formatCmd is set', async () => {
    const files = {
      'package.json': JSON.stringify({ name: 'lib', version: '1.0.0', devDependencies: { relizy: '^1.14.0', eslint: '^9.0.0' } }),
    }

    expect(await checkMigration(createTestContext(writeProject(files)), {})).toContain('The changelogs are formatted with eslint')

    const configured = writeProject({ ...files, 'relizy.config.mjs': `export default { changelog: { formatCmd: false } }\n` })
    expect(await checkMigration(createTestContext(configured), {})).not.toContain('The changelogs are formatted')
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

  it('Then points out the removed publish.private', async () => {
    const cwd = writeProject({
      'package.json': JSON.stringify({ name: 'lib', version: '1.0.0', devDependencies: { relizy: '^1.14.0' } }),
      'relizy.config.mjs': `export default {\n  publish: {\n    private: false,\n  },\n}\n`,
    })

    const text = await checkMigration(createTestContext(cwd), {})

    expect(text).toContain('**`publish.private` is removed** (`relizy.config.mjs:3`)')
  })

  it('Then points out the imports of the removed relizy/types entry', async () => {
    const cwd = writeProject({
      'package.json': JSON.stringify({ name: 'lib', version: '1.0.0', devDependencies: { relizy: '^1.14.0' } }),
      'scripts/release.ts': `import type { RelizyConfig } from 'relizy/types'\n\nexport const config: RelizyConfig = {}\n`,
    })

    const text = await checkMigration(createTestContext(cwd), {})

    expect(text).toContain('**The `relizy/types` entry is removed** (`scripts/release.ts:1`)')
  })

  it('Then points out the options relizy never read: newVersion and publish.packages', async () => {
    const cwd = writeProject({
      'package.json': JSON.stringify({ name: 'lib', version: '1.0.0', devDependencies: { relizy: '^1.14.0' } }),
      'relizy.config.mjs': `export default {\n  newVersion: '2.0.0',\n  publish: {\n    packages: ['packages/*'],\n  },\n}\n`,
    })

    const text = await checkMigration(createTestContext(cwd), {})

    expect(text).toContain('**`newVersion` is removed** (`relizy.config.mjs:2`)')
    expect(text).toContain('**`publish.packages` is removed** (`relizy.config.mjs:4`)')
  })

  it('Then points out the removed repo.token', async () => {
    const cwd = writeProject({
      'package.json': JSON.stringify({ name: 'lib', version: '1.0.0', devDependencies: { relizy: '^1.14.0' } }),
      'relizy.config.mjs': `export default {\n  repo: {\n    provider: 'gitlab', domain: 'gitlab.example.com', repo: 'team/app',\n    token: 'glpat_test',\n  },\n}\n`,
    })

    const text = await checkMigration(createTestContext(cwd), {})

    expect(text).toContain('**`repo.token` is removed** (`relizy.config.mjs:4`)')
  })

  it('Then points out the removed publish.token', async () => {
    const cwd = writeProject({
      'package.json': JSON.stringify({ name: 'lib', version: '1.0.0', devDependencies: { relizy: '^1.14.0' } }),
      'relizy.config.mjs': `export default {\n  publish: {\n    token: process.env.MY_NPM_TOKEN,\n  },\n}\n`,
    })
    process.env.MY_NPM_TOKEN = 'npm_test'

    try {
      const text = await checkMigration(createTestContext(cwd), {})

      expect(text).toContain('**`publish.token` is removed** (`relizy.config.mjs:3`)')
    }
    finally {
      delete process.env.MY_NPM_TOKEN
    }
  })

  it('Then points out monorepo.ignorePackageNames first, as the config cannot load with it', async () => {
    const cwd = writeProject({
      'package.json': JSON.stringify({ name: 'monorepo', version: '1.0.0', private: true, devDependencies: { relizy: '^1.14.0' } }),
      'relizy.config.mjs': `export default {\n  monorepo: {\n    versionMode: 'selective',\n    packages: ['packages/*'],\n    ignorePackageNames: ['@scope/legacy'],\n  },\n}\n`,
    })

    const text = await checkMigration(createTestContext(cwd), {})

    expect(text).toContain('## To change first (1)')
    expect(text).toContain('**`monorepo.ignorePackageNames` is removed** (`relizy.config.mjs:5`)')
    expect(text).toContain('then call `check_migration()` again for the other changes')
  })

  it('Then points out templates.tagBody first when it repeats {{newVersion}}, as the config cannot load with it', async () => {
    const cwd = writeProject({
      'package.json': JSON.stringify({ name: 'lib', version: '1.0.0', devDependencies: { relizy: '^1.14.0' } }),
      'relizy.config.mjs': `export default {\n  templates: {\n    tagBody: 'v{{newVersion}}-{{newVersion}}',\n  },\n}\n`,
    })

    const text = await checkMigration(createTestContext(cwd), {})

    expect(text).toContain('## To change first (1)')
    expect(text).toContain('**`templates.tagBody` repeats `{{newVersion}}`** (`relizy.config.mjs:3`)')
  })

  it('Then points out monorepo.includePrivates, renamed privatePackages', async () => {
    const cwd = writeProject({
      'package.json': JSON.stringify({ name: 'lib', version: '1.0.0', devDependencies: { relizy: '^1.14.0' } }),
      'relizy.config.mjs': `export default {\n  monorepo: {\n    includePrivates: true,\n  },\n}\n`,
    })

    const text = await checkMigration(createTestContext(cwd), {})

    expect(text).toContain('**`monorepo.includePrivates` is renamed `monorepo.privatePackages`** (`relizy.config.mjs:3`)')
  })

  it('Then points out includePrivates in the code, --include-private in the scripts and the CI calls without --yes', async () => {
    const cwd = writeProject({
      'package.json': JSON.stringify({ name: 'lib', version: '1.0.0', scripts: { release: 'relizy release --include-private' }, devDependencies: { relizy: '^1.14.0' } }),
      'scripts/release.ts': `import { bump } from 'relizy'

await bump({ includePrivates: true, yes: true })
`,
      '.github/workflows/release.yml': 'jobs:\n  release:\n    steps:\n      - run: npx relizy release\n      - run: npx relizy bump --yes\n',
    })

    const text = await checkMigration(createTestContext(cwd), {})

    expect(text).toContain('**The `includePrivates` option of `bump()`, `changelog()` and `release()` is renamed `privatePackages`** (`scripts/release.ts:3`)')
    expect(text).toContain('**The `--include-private` flag is renamed `--private-packages <mode>`** (`package.json:1`)')
    expect(text).toContain('**`relizy release` or `relizy bump` in CI without `--yes`** (`.github/workflows/release.yml:4`)')
  })

  it('Then leaves the dependency types of a version group alone, used as they are by relizy 1', async () => {
    const cwd = writeProject({
      'package.json': JSON.stringify({ name: 'monorepo', version: '1.0.0', private: true, devDependencies: { relizy: '^1.14.0' } }),
      'relizy.config.mjs': `export default {
  monorepo: {
    groups: [{ name: 'main', title: 'Main', versionMode: 'selective', packages: ['packages/*'], bump: { dependencyTypes: ['peerDependencies'] } }],
  },
}
`,
    })

    const text = await checkMigration(createTestContext(cwd), {})

    expect(text).not.toContain('`bump.dependencyTypes` without `dependencies`')
  })
})
