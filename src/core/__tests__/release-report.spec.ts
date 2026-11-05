import type { ReleaseReport } from '../release-report'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { createMockConfig } from '../../../tests/mocks'
import { formatReleaseReportMarkdown, formatReleaseReportText, getReleaseReportOutputs, writeReleaseReport } from '../release-report'

const groupsRelease: ReleaseReport['release'] = {
  projectName: 'maz-ui',
  groups: [
    { name: 'main', title: 'maz-ui', versionMode: 'selective', version: '5.2.1', oldVersion: '5.2.0', tag: 'v5.2.1', packages: [{ name: 'maz-ui', oldVersion: '5.2.0', newVersion: '5.2.1', tag: 'v5.2.1', private: false }] },
    { name: 'tooling', title: 'Tooling', versionMode: 'independent', packages: [{ name: '@maz-ui/eslint-config', oldVersion: '5.0.0', newVersion: '5.1.0', tag: '@maz-ui/eslint-config@5.1.0', private: false }] },
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

const nothing: ReleaseReport = { status: 'nothing', released: false, dryRun: false, canary: false, tags: [], steps: [] }

describe('Given the renderers of the release report', () => {
  it('Then renders a release as text for the terminal', () => {
    expect(formatReleaseReportText(released)).toBe([
      'Release completed',
      '',
      'Version: maz-ui: 5.2.1',
      'Version: Tooling: @maz-ui/eslint-config@5.1.0',
      'Tag(s): v5.2.1, @maz-ui/eslint-config@5.1.0',
      'Publish: 2 package(s)',
      'Social media: slack: down',
      'PR comment: Skipped',
    ].join('\n'))
    expect(formatReleaseReportText({ ...nothing, dryRun: true })).toBe('Nothing to release (dry run)')
    expect(formatReleaseReportText({ ...nothing, status: 'failed', error: 'boom' })).toBe('Release failed\n\nError: boom')
  })

  it('Then renders a release as markdown for the summary of GitHub Actions', () => {
    const markdown = formatReleaseReportMarkdown(released)

    expect(markdown).toContain('## 🚀 Relizy: release completed')
    expect(markdown).toContain('### maz-ui `5.2.1` (selective)\n\n| Package | Version |\n| --- | --- |\n| `maz-ui` | `5.2.0` → `5.2.1` |')
    expect(markdown).toContain('### Tooling (independent)')
    expect(markdown).toContain('**Tags:** `v5.2.1`, `@maz-ui/eslint-config@5.1.0`')
    expect(markdown).toContain('| Social media | ⚠️ slack: down |')
    expect(formatReleaseReportMarkdown(nothing)).toBe('## ℹ️ Relizy: nothing to release\n')
  })

  it('Then gives the outputs of the release', () => {
    expect(getReleaseReportOutputs(released)).toEqual({
      released: 'true',
      status: 'released',
      version: '5.2.1',
      tags: 'v5.2.1,@maz-ui/eslint-config@5.1.0',
      packages: 'maz-ui@5.2.1,@maz-ui/eslint-config@5.1.0',
    })
    expect(getReleaseReportOutputs(nothing)).toEqual({ released: 'false', status: 'nothing', version: '', tags: '', packages: '' })
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

    writeReleaseReport({ config: { ...createMockConfig({ bump: { type: 'release' } }), cwd }, report: released })

    const output = readFileSync(join(cwd, 'output'), 'utf8')
    expect(output).toContain('previous=1\nreleased=true\nstatus=released\nversion=5.2.1\n')
    expect(JSON.parse(output.split('\n').find(line => line.startsWith('report='))!.slice('report='.length))).toEqual(released)
    expect(readFileSync(join(cwd, 'summary'), 'utf8')).toBe(formatReleaseReportMarkdown(released))
  })

  it('Then writes nothing to GitHub Actions outside of it or with github disabled', () => {
    process.env.GITHUB_OUTPUT = join(cwd, 'output')

    writeReleaseReport({ config: { ...createMockConfig({ bump: { type: 'release' } }), cwd }, report: released })
    process.env.GITHUB_ACTIONS = 'true'
    const config = createMockConfig({ bump: { type: 'release' } })
    writeReleaseReport({ config: { ...config, cwd, release: { ...config.release, report: { github: false } } }, report: released })

    expect(() => readFileSync(join(cwd, 'output'))).toThrow()
  })

  it('Then writes the JSON and dotenv files', () => {
    const config = createMockConfig({ bump: { type: 'release' } })

    writeReleaseReport({ config: { ...config, cwd, release: { ...config.release, report: { json: 'reports/relizy.json', dotenv: 'relizy.env' } } }, report: nothing })

    expect(JSON.parse(readFileSync(join(cwd, 'reports/relizy.json'), 'utf8'))).toEqual(nothing)
    expect(readFileSync(join(cwd, 'relizy.env'), 'utf8')).toBe('RELIZY_RELEASED=false\nRELIZY_STATUS=nothing\nRELIZY_VERSION=\nRELIZY_TAGS=\nRELIZY_PACKAGES=\n')
  })
})
