import type { ReleaseReport } from '../release-report'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { createMockConfig } from '../../../tests/mocks'
import { describeReleaseAI, describeReleaseContent, describeTags, formatReleaseReportMarkdown, formatReleaseReportText, getReleaseName, getReleaseReportOutputs, getReleaseSummary, writeReleaseReport } from '../release-report'

const groupsRelease: ReleaseReport['release'] = {
  projectName: 'maz-ui',
  groups: [
    {
      name: 'main',
      title: 'maz-ui',
      versionMode: 'selective',
      version: '5.2.1',
      oldVersion: '5.2.0',
      tag: 'v5.2.1',
      packages: [
        {
          name: 'maz-ui',
          oldVersion: '5.2.0',
          newVersion: '5.2.1',
          tag: 'v5.2.1',
          private: false,
        },
      ],
    },
    {
      name: 'tooling',
      title: 'Tooling',
      versionMode: 'independent',
      packages: [
        {
          name: '@maz-ui/eslint-config',
          oldVersion: '5.0.0',
          newVersion: '5.1.0',
          tag: '@maz-ui/eslint-config@5.1.0',
          private: false,
        },
      ],
    },
  ],
}

const released: ReleaseReport = {
  status: 'released',
  released: true,
  dryRun: false,
  canary: false,
  release: groupsRelease,
  version: '5.2.1',
  tags: ['v5.2.1', '@maz-ui/eslint-config@5.1.0'],
  steps: [
    { name: 'publish', status: 'done', detail: '2 package(s)' },
    { name: 'social', status: 'failed', detail: 'slack: down' },
    { name: 'prComment', status: 'skipped' },
  ],
}

const nothing: ReleaseReport = {
  status: 'nothing',
  released: false,
  dryRun: false,
  canary: false,
  tags: [],
  steps: [],
}

// A release with what the summary tells: content, git, publication, AI and links
const detailed: ReleaseReport = {
  status: 'released',
  released: true,
  dryRun: false,
  canary: false,
  release: {
    projectName: 'relizy',
    groups: [
      {
        name: '',
        title: 'relizy',
        versionMode: 'unified',
        version: '2.0.0',
        oldVersion: '1.14.3',
        tag: 'v2.0.0',
        packages: [
          {
            name: 'relizy',
            oldVersion: '1.14.3',
            newVersion: '2.0.0',
            tag: 'v2.0.0',
            private: false,
          },
        ],
      },
    ],
  },
  version: '2.0.0',
  tags: ['v2.0.0'],
  steps: [
    { name: 'changelog', status: 'done' },
    {
      name: 'publish',
      status: 'done',
      detail: 'relizy@2.0.0',
      links: [
        { label: 'relizy@2.0.0', url: 'https://www.npmjs.com/package/relizy/v/2.0.0' },
      ],
    },
    { name: 'commit', status: 'done', detail: 'v2.0.0' },
    { name: 'push', status: 'done' },
    {
      name: 'providerRelease',
      status: 'done',
      detail: '1 release on github',
      links: [
        { label: 'v2.0.0', url: 'https://github.com/user/relizy/releases/tag/v2.0.0' },
      ],
    },
    { name: 'social', status: 'skipped' },
  ],
  content: {
    commits: 21,
    features: 11,
    fixes: 7,
    breaking: 7,
    contributors: 2,
  },
  git: { branch: 'main', commit: 'a1b2c3d', remote: 'origin/main' },
  publish: {
    tags: ['latest'],
    registries: ['registry.npmjs.org'],
    install: 'pnpm add relizy@2.0.0',
  },
  ai: {
    provider: 'claude-code',
    rewrites: 2,
    simulated: false,
    durationMs: 31200,
    inputTokens: 10200,
    outputTokens: 2200,
    costUsd: 0.0421,
  },
}

describe('Given the renderers of the release report', () => {
  it('Then renders a release as text for the terminal', () => {
    expect(formatReleaseReportText(released)).toBe([
      'Release completed',
      '',
      'Version (maz-ui): 5.2.1',
      'Version (Tooling): @maz-ui/eslint-config@5.1.0',
      'Tag(s): v5.2.1, @maz-ui/eslint-config@5.1.0',
      'Publish: 2 package(s)',
      'Social media: slack: down',
      'PR comment: Skipped',
    ].join('\n'))
    expect(formatReleaseReportText({ ...nothing, dryRun: true })).toBe('Nothing to release (dry run)')
    expect(formatReleaseReportText({ ...nothing, status: 'failed', error: 'boom' })).toBe('Release failed\n\nError: boom')
  })

  it('Then renders a release as markdown, with a table per version group', () => {
    const markdown = formatReleaseReportMarkdown(released)

    expect(markdown).toContain('## 🚀 Released maz-ui 5.2.1, @maz-ui/eslint-config 5.1.0')
    expect(markdown).toContain('### maz-ui `5.2.1` (selective)\n\n| Package | Version |\n| --- | --- |\n| `maz-ui` | `5.2.0` → `5.2.1` |')
    expect(markdown).toContain('### Tooling (independent)')
    // The tables of the groups give the versions and the tags: the summary does not repeat them
    expect(markdown).not.toContain('**Version')
    expect(markdown).not.toContain('**Tags**')
    // A failed step does not stop the release
    expect(markdown).toContain('| ⚠️ **Social media** | slack: down |')
    expect(markdown).toContain('| ⏭️ **PR comment** | skipped |')
    expect(markdown).toContain('| Step | Result |\n| --- | --- |')
  })

  it('Then counts the released packages in the title beyond two versions, the tables listing them', () => {
    const navigation = {
      name: '@maz-ui/nav',
      oldVersion: '1.0.0',
      newVersion: '1.1.0',
      tag: '@maz-ui/nav@1.1.0',
      private: false,
    }
    const icons = {
      name: '@maz-ui/icons',
      oldVersion: '2.0.0',
      newVersion: '2.0.1',
      tag: '@maz-ui/icons@2.0.1',
      private: false,
    }
    const tooling = groupsRelease!.groups[1]!
    const many = {
      ...released,
      release: {
        ...groupsRelease!,
        groups: [
          {
            ...groupsRelease!.groups[0]!,
            // the selective group ships several packages with its single version
            packages: [
              ...groupsRelease!.groups[0]!.packages,
              {
                name: '@maz-ui/utils',
                oldVersion: '5.2.0',
                newVersion: '5.2.1',
                tag: 'v5.2.1',
                private: false,
              },
            ],
          },
          {
            ...tooling,
            packages: [...tooling.packages, navigation, icons],
          },
        ],
      },
    } satisfies ReleaseReport
    const markdown = formatReleaseReportMarkdown(many)

    expect(getReleaseName(released)).toBe('maz-ui 5.2.1, @maz-ui/eslint-config 5.1.0')
    expect(getReleaseName(many)).toBe('5 packages of maz-ui')
    expect(markdown).toContain('## 🚀 Released 5 packages of maz-ui\n')
    expect(markdown).toContain('| `@maz-ui/nav` | `1.0.0` → `1.1.0` |')
    // In the terminal, a version line per group, titled with it: the packages of a group are counted beyond 2
    expect(getReleaseSummary(many).slice(0, 2)).toEqual([
      { label: 'Version (maz-ui)', value: '5.2.1', code: true },
      { label: 'Version (Tooling)', value: '3 packages' },
    ])
    expect(describeTags(['v5.2.1', '@maz-ui/nav@1.1.0'])).toBe('v5.2.1, @maz-ui/nav@1.1.0')
    expect(describeTags(['v5.2.1', '@maz-ui/nav@1.1.0', '@maz-ui/icons@2.0.1'])).toBe('3 tags')
  })

  it('Then lists the links of a step up to two, the value counting them beyond', () => {
    const links = ['v1', 'v2', 'v3'].map(tag => ({ label: tag, url: `https://github.com/acme/lib/releases/tag/${tag}` }))
    const report = (count: number) => ({
      ...released,
      steps: [
        {
          name: 'providerRelease',
          status: 'done',
          detail: `${count} releases on github`,
          links: links.slice(0, count),
        },
      ],
    }) satisfies ReleaseReport

    expect(formatReleaseReportMarkdown(report(2))).toContain('| ✅ **Provider release** | 2 releases on github<br>[v1](https://github.com/acme/lib/releases/tag/v1) · [v2](https://github.com/acme/lib/releases/tag/v2) |')
    expect(formatReleaseReportMarkdown(report(3))).toContain('| ✅ **Provider release** | 3 releases on github |')
  })

  it('Then gives why a step did nothing: the social posts of a prerelease', () => {
    const report = {
      ...released,
      steps: [
        { name: 'social', status: 'skipped', detail: 'twitter: prerelease' },
      ],
    } satisfies ReleaseReport

    expect(formatReleaseReportMarkdown(report)).toContain('| ⏭️ **Social media** | skipped (twitter: prerelease) |')
    expect(formatReleaseReportText(report)).toContain('Social media: Skipped (twitter: prerelease)')
  })

  it('Then renders the summary of a release as markdown: what each step did, with its links', () => {
    const markdown = formatReleaseReportMarkdown(detailed)

    expect(markdown).toContain('| **Content** | 11 features · 7 fixes · 7 breaking · 2 contributors |')
    // A link replaces its label in the value, else follows it
    expect(markdown).toContain('| ✅ **Publish** | [relizy@2.0.0](https://www.npmjs.com/package/relizy/v/2.0.0) · latest · registry.npmjs.org |')
    expect(markdown).toContain('| ✅ **Provider release** | 1 release on github<br>[v2.0.0](https://github.com/user/relizy/releases/tag/v2.0.0) |')
    expect(markdown).toContain('| ✅ **Commit and tags** | a1b2c3d · v2.0.0 |')
    expect(markdown).toContain('| ✅ **Push** | main → origin/main |')
    expect(markdown).toContain('| ✨ **AI** | 2 rewrites by claude-code in 31.2s · 12.4k tokens · $0.042 |')
    expect(markdown).toContain('| **Install** | `pnpm add relizy@2.0.0` |')
    // The packages and their versions, even for a single package
    expect(markdown).toContain('### Packages\n\n| Package | Version |\n| --- | --- |\n| `relizy` | `1.14.3` → `2.0.0` |')
    expect(markdown).toMatch(/<sub>`main` · \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC · by \[relizy\]\(https:\/\/relizy\.dev\)<\/sub>\n$/)
  })

  it('Then tells a dry run, nothing to release and a failure apart', () => {
    expect(formatReleaseReportMarkdown({ ...detailed, dryRun: true, released: false })).toContain('## 🧪 Dry run: relizy 2.0.0\n\nNothing was written nor published.')
    expect(formatReleaseReportMarkdown(nothing)).toContain('## ℹ️ Nothing to release\n\nNo commit since the last release triggers a new version.')
    expect(formatReleaseReportMarkdown({ ...nothing, status: 'failed', error: 'npm publish failed\nat line 2' })).toContain('## ❌ Release failed\n\n```text\nnpm publish failed\nat line 2\n```\n')
  })

  it('Then a failure gives its step and its whole error, without the versions of the release', () => {
    const markdown = formatReleaseReportMarkdown({
      ...detailed,
      status: 'failed',
      released: false,
      steps: detailed.steps.filter(step => step.name === 'changelog'),
      failedStep: 'Publish',
      error: 'before:publish hook failed: Published files missing after the build:\nmaz-ui: dist/index.js',
    })

    expect(markdown).toContain('## ❌ Release failed at the Publish step\n\n```text\nbefore:publish hook failed: Published files missing after the build:\nmaz-ui: dist/index.js\n```\n')
    expect(markdown).not.toContain('| Package |')
    expect(markdown).not.toContain('Changelog')
    expect(markdown).not.toContain('Content')
  })

  it('Then a failure after the publication tells what already left the machine', () => {
    const markdown = formatReleaseReportMarkdown({
      ...detailed,
      status: 'failed',
      released: false,
      steps: detailed.steps.filter(step => ['changelog', 'publish', 'commit'].includes(step.name)),
      failedStep: 'Push',
      error: Array.from({ length: 25 }, (_, index) => `line ${index + 1}`).join('\n'),
    })

    expect(markdown).toContain('| ✅ **Publish** | [relizy@2.0.0](https://www.npmjs.com/package/relizy/v/2.0.0) · latest · registry.npmjs.org |')
    expect(markdown).not.toContain('Commit and tags')
    expect(markdown).not.toContain('Install')
    expect(markdown).toContain('line 20\n... 5 more lines in the log\n```')
  })

  it('Then gives the summary as label and value pairs', () => {
    expect(getReleaseSummary(detailed).map(({ label, value }) => `${label}: ${value}`)).toEqual([
      'Version: 2.0.0',
      'Tag: v2.0.0',
      'Content: 11 features · 7 fixes · 7 breaking · 2 contributors',
      'Changelog: done',
      'Publish: relizy@2.0.0 · latest · registry.npmjs.org',
      'Commit and tags: a1b2c3d · v2.0.0',
      'Push: main → origin/main',
      'Provider release: 1 release on github',
      'Social media: skipped',
      'AI: 2 rewrites by claude-code in 31.2s · 12.4k tokens · $0.042',
      'Install: pnpm add relizy@2.0.0',
    ])
    expect(getReleaseSummary(nothing)).toEqual([])
  })

  it('Then describes the content and the AI in words', () => {
    expect(describeReleaseContent({
      commits: 3,
      features: 0,
      fixes: 0,
      breaking: 0,
      contributors: 0,
    })).toBe('3 commits')
    expect(describeReleaseContent({
      commits: 2,
      features: 1,
      fixes: 1,
      breaking: 0,
      contributors: 1,
    })).toBe('1 feature · 1 fix · 1 contributor')
    expect(describeReleaseAI({
      provider: 'claude-code',
      rewrites: 1,
      simulated: true,
      durationMs: 0,
    })).toBe('1 rewrite simulated (claude-code)')
    expect(describeReleaseAI({
      provider: 'ai-sdk',
      rewrites: 1,
      simulated: false,
      durationMs: 800,
    })).toBe('1 rewrite by ai-sdk in 800ms')
  })

  it('Then gives the outputs of the release', () => {
    expect(getReleaseReportOutputs(released)).toEqual({
      released: 'true',
      status: 'released',
      version: '5.2.1',
      tags: 'v5.2.1,@maz-ui/eslint-config@5.1.0',
      packages: 'maz-ui@5.2.1,@maz-ui/eslint-config@5.1.0',
      branch: '',
      commit: '',
      dist_tags: '',
      urls: '',
      install: '',
      failed_steps: 'social',
      group_main_version: '5.2.1',
      package_maz_ui_version: '5.2.1',
      package_maz_ui_eslint_config_version: '5.1.0',
    })
    expect(getReleaseReportOutputs(detailed)).toEqual(expect.objectContaining({
      branch: 'main',
      commit: 'a1b2c3d',
      dist_tags: 'latest',
      urls: 'https://www.npmjs.com/package/relizy/v/2.0.0,https://github.com/user/relizy/releases/tag/v2.0.0',
      install: 'pnpm add relizy@2.0.0',
      failed_steps: '',
    }))
    expect(getReleaseReportOutputs(nothing)).toEqual(expect.objectContaining({
      released: 'false',
      status: 'nothing',
      version: '',
      tags: '',
      packages: '',
    }))
  })

  it('Then gives the versions of the groups and the packages only when the release happened', () => {
    // A group without name (no `monorepo.groups`) has no group output
    expect(Object.keys(getReleaseReportOutputs(detailed)).filter(name => name.startsWith('group_'))).toEqual([])
    expect(getReleaseReportOutputs(detailed)).toEqual(expect.objectContaining({ package_relizy_version: '2.0.0' }))

    const outputs = getReleaseReportOutputs({ ...released, released: false, dryRun: true })
    expect(Object.keys(outputs).filter(name => name.startsWith('group_') || name.startsWith('package_'))).toEqual([])
    expect(outputs.packages).toBe('maz-ui@5.2.1,@maz-ui/eslint-config@5.1.0')
  })
})

describe('Given writeReleaseReport function', () => {
  let cwd: string
  const env = { ...process.env }

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'relizy-report-'))
  })

  afterEach(() => {
    process.env = { ...env }
    rmSync(cwd, { recursive: true, force: true })
  })

  it('Then writes the outputs and the summary of a GitHub Actions run', () => {
    process.env.GITHUB_ACTIONS = 'true'
    process.env.GITHUB_OUTPUT = join(cwd, 'output')
    process.env.GITHUB_STEP_SUMMARY = join(cwd, 'summary')
    writeFileSync(process.env.GITHUB_OUTPUT, 'previous=1\n')

    writeReleaseReport({
      config: {
        ...createMockConfig({
          bump: { type: 'release' },
        }),
        cwd,
      },
      report: released,
    })

    const output = readFileSync(join(cwd, 'output'), 'utf8')
    expect(output).toContain('previous=1\nreleased=true\nstatus=released\nversion=5.2.1\n')
    expect(JSON.parse(output.split('\n').find(line => line.startsWith('report='))!.slice('report='.length))).toEqual(released)
    // The multiline summary, between its delimiters
    expect(output).toContain(`summary<<RELIZY_SUMMARY_EOF\n${formatReleaseReportMarkdown(released).trimEnd()}\nRELIZY_SUMMARY_EOF\n`)
    expect(readFileSync(join(cwd, 'summary'), 'utf8')).toBe(formatReleaseReportMarkdown(released))
  })

  it('Then writes nothing to GitHub Actions outside of it or with github disabled', () => {
    // Set when the tests run in GitHub Actions
    delete process.env.GITHUB_ACTIONS
    process.env.GITHUB_OUTPUT = join(cwd, 'output')

    writeReleaseReport({
      config: {
        ...createMockConfig({
          bump: { type: 'release' },
        }),
        cwd,
      },
      report: released,
    })
    process.env.GITHUB_ACTIONS = 'true'
    const config = createMockConfig({
      bump: { type: 'release' },
    })
    writeReleaseReport({
      config: {
        ...config,
        cwd,
        release: {
          ...config.release,
          report: { github: false },
        },
      },
      report: released,
    })

    expect(() => readFileSync(join(cwd, 'output'))).toThrow()
  })

  it('Then writes the JSON and dotenv files', () => {
    const config = createMockConfig({
      bump: { type: 'release' },
    })

    writeReleaseReport({
      config: {
        ...config,
        cwd,
        release: {
          ...config.release,
          report: { json: 'reports/relizy.json', dotenv: 'relizy.env', markdown: 'reports/summary.md' },
        },
      },
      report: nothing,
    })

    expect(JSON.parse(readFileSync(join(cwd, 'reports/relizy.json'), 'utf8'))).toEqual(nothing)
    expect(readFileSync(join(cwd, 'relizy.env'), 'utf8')).toBe('RELIZY_RELEASED=false\nRELIZY_STATUS=nothing\nRELIZY_VERSION=\nRELIZY_TAGS=\nRELIZY_PACKAGES=\nRELIZY_BRANCH=\nRELIZY_COMMIT=\nRELIZY_DIST_TAGS=\nRELIZY_URLS=\nRELIZY_FAILED_STEPS=\n')
    expect(readFileSync(join(cwd, 'reports/summary.md'), 'utf8')).toBe(formatReleaseReportMarkdown(nothing))
  })

  it('Then writes a dotenv file without space, to source it', () => {
    const config = createMockConfig({
      bump: { type: 'release' },
    })

    writeReleaseReport({
      config: {
        ...config,
        cwd,
        release: {
          ...config.release,
          report: { dotenv: 'relizy.env' },
        },
      },
      report: { ...detailed, release: groupsRelease },
    })

    const dotenv = readFileSync(join(cwd, 'relizy.env'), 'utf8')
    expect(dotenv).not.toContain('RELIZY_INSTALL')
    expect(dotenv).not.toContain(' ')
    expect(dotenv).toContain('RELIZY_GROUP_MAIN_VERSION=5.2.1\nRELIZY_PACKAGE_MAZ_UI_VERSION=5.2.1\nRELIZY_PACKAGE_MAZ_UI_ESLINT_CONFIG_VERSION=5.1.0\n')
  })
})
