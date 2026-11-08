import type { MergePreviewOutcome } from '../merge-preview/plan'
import type { MergePreviewResult } from '../merge-preview/render'
import { stripVTControlCharacters } from 'node:util'
import { formatMergePreviewMarkdown, getMergePreviewStatusDescription, getMergePreviewTerminalOutput } from '../merge-preview/render'

const outcome: MergePreviewOutcome = {
  bumpResult: { bumped: false },
  overview: {
    projectName: 'monorepo',
    groups: [
      {
        title: 'monorepo',
        versionMode: 'selective',
        oldVersion: '1.0.0',
        version: '1.1.0',
        tag: 'v1.1.0',
        packages: [
          {
            name: 'a',
            oldVersion: '1.0.0',
            newVersion: '1.1.0',
            tag: 'v1.1.0',
            private: false,
          },
          {
            name: 'b',
            oldVersion: '1.0.0',
            newVersion: '1.1.0',
            tag: 'v1.1.0',
            private: false,
          },
          {
            name: 'c',
            oldVersion: '1.0.0',
            newVersion: '1.1.0',
            tag: 'v1.1.0',
            private: false,
          },
        ],
      },
    ],
  },
  packages: [
    {
      name: 'a',
      oldVersion: '1.0.0',
      newVersion: '1.1.0',
      reason: 'commits',
      fromPullRequest: true,
      commits: [
        {
          type: 'feat',
          scope: 'a',
          description: 'add',
          isBreaking: false,
          shortHash: 'aaa',
          fromPullRequest: true,
        },
      ],
    },
    {
      name: 'b',
      oldVersion: '1.0.0',
      newVersion: '1.1.0',
      reason: 'commits',
      fromPullRequest: false,
      commits: [
        {
          type: 'fix',
          scope: 'b',
          description: 'fix',
          isBreaking: false,
          shortHash: 'bbb',
          fromPullRequest: false,
        },
      ],
    },
    {
      name: 'c',
      oldVersion: '1.0.0',
      newVersion: '1.1.0',
      reason: 'dependency',
      dependency: 'a',
      fromPullRequest: false,
      commits: [],
    },
  ],
}

function resultOf(overrides: Partial<MergePreviewResult> = {}): MergePreviewResult {
  return {
    context: {
      pullRequest: {
        provider: 'github',
        kind: 'pull request',
        number: 4,
        title: 'feat(a): add',
        targetBranch: 'main',
      },
      targetSha: 'abc1234567',
      headSha: 'def4567890',
      commits: ['def4567890'],
      merged: true,
    },
    plan: {
      squash: { mode: 'commits', reason: 'the repository does not allow squash merges' },
      outcome,
    },
    checks: { problems: [], warnings: [] },
    publish: { enabled: true, distTag: 'latest' },
    branch: 'main',
    ...overrides,
  }
}

describe('Given the merge preview of a pull request', () => {
  it('When the merge releases packages, Then lists them with what the pull request brings', () => {
    expect(formatMergePreviewMarkdown(resultOf())).toBe([
      '<!-- relizy-merge-preview -->',
      '### 🔮 If you merge this pull request',
      '',
      'relizy releases **3 packages** from `main`, published with the dist-tag `latest`:',
      '',
      '**monorepo** `1.0.0` → `1.1.0` (tag `v1.1.0`)',
      '',
      '| Package | Version | Why |',
      '|---|---|---|',
      '| a | `1.0.0` → `1.1.0` | this PR: 1 feature |',
      '| b | `1.0.0` → `1.1.0` | `main`: 1 fix |',
      '| c | `1.0.0` → `1.1.0` | depends on `a` |',
      '',
      '<sub>Computed on `main@abc1234` + this pull request `@def4567` · commits kept: the repository does not allow squash merges · by relizy</sub>',
    ].join('\n'))
  })

  it('When the merge releases nothing, Then says so', () => {
    const markdown = formatMergePreviewMarkdown(resultOf({
      plan: {
        squash: { mode: 'commits', reason: 'test' },
        outcome: {
          bumpResult: { bumped: false },
          packages: [],
        },
      },
    }))

    expect(markdown).toContain('relizy releases **nothing**: no commit since the last release changes a version.')
  })

  it('When the merge method is unknown and a squash releases other versions, Then shows both', () => {
    const squashOutcome = {
      ...outcome,
      packages: outcome.packages.map(pkg => ({ ...pkg, newVersion: '2.0.0' })),
    }
    const markdown = formatMergePreviewMarkdown(resultOf({
      plan: {
        squash: { mode: 'both', reason: 'the repository allows several merge methods' },
        outcome,
        squashOutcome,
      },
    }))

    expect(markdown).toContain('With a merge commit or a rebase, relizy releases **3 packages**')
    expect(markdown).toContain('With a **squash merge**, relizy releases **3 packages**')
    expect(markdown).toContain('merge method unknown: the repository allows several merge methods')
  })

  it('When the release would fail, Then lists the problems and the warnings', () => {
    const markdown = formatMergePreviewMarkdown(resultOf({
      checks: {
        problems: [
          { kind: 'tag-taken', message: 'The tag v1.1.0 already exists' },
        ],
        warnings: ['Could not check the registry'],
      },
    }))

    expect(markdown).toContain('#### ❌ The release of the merge would fail\n\n- The tag v1.1.0 already exists')
    expect(markdown).toContain('> ⚠️ Could not check the registry')
  })

  it('When it is a merge request of GitLab, Then names it so', () => {
    const result = resultOf()
    result.context!.pullRequest = { ...result.context!.pullRequest, provider: 'gitlab', kind: 'merge request' }

    const markdown = formatMergePreviewMarkdown(result)

    expect(markdown).toContain('### 🔮 If you merge this merge request')
    expect(markdown).toContain('this MR: 1 feature')
  })

  it('When it runs outside a pull request, Then shows a box per group in the terminal, without markdown', () => {
    const { notes, warnings, details } = getMergePreviewTerminalOutput(resultOf({
      context: undefined,
      publish: { enabled: false, distTag: 'latest' },
    }))

    expect(notes.map(note => ({
      ...note,
      lines: note.lines.map(line => stripVTControlCharacters(line)),
    }))).toEqual([
      {
        title: 'Release plan · monorepo · tag v1.1.0',
        lines: [
          'a  1.0.0  →  1.1.0  1 feature',
          expect.stringMatching(/^b {2}1\.0\.0 {2}→ {2}1\.1\.0 {2}\S/),
          expect.stringMatching(/^c {2}1\.0\.0 {2}→ {2}1\.1\.0 {2}\S/),
        ],
        footer: ['Not published'],
      },
    ])
    expect(warnings).toEqual([])
    expect(details).toEqual(['Computed on main'])
  })

  it('When the release of the merge would fail, Then shows the problems in a failed box', () => {
    const { notes, details } = getMergePreviewTerminalOutput(resultOf({
      checks: {
        problems: [
          { kind: 'error', message: 'a@1.1.0 is already published' },
        ],
        warnings: ['a warning'],
      },
    }))

    expect(notes.at(-1)).toEqual({
      title: 'The release of the merge would fail',
      lines: ['✖ a@1.1.0 is already published'],
      failed: true,
    })
    expect(stripVTControlCharacters(notes[0]!.lines[0]!)).toBe('a  1.0.0  →  1.1.0  this PR: 1 feature')
    expect(details).toEqual(['Computed on main@abc1234 + this pull request @def4567 · commits kept: the repository does not allow squash merges'])
  })
})

describe('Given the merge preview of a unified group in the terminal', () => {
  const unifiedGroup = (version: string) => ({
    title: 'maz-ui',
    versionMode: 'unified' as const,
    oldVersion: '5.5.0',
    version,
    tag: `v${version}`,
    packages: ['maz-ui', '@maz-ui/icons', '@maz-ui/utils'].map(name => ({
      name,
      oldVersion: '5.5.0',
      newVersion: version,
      tag: `v${version}`,
      private: false,
    })),
  })
  const toolingGroup = {
    title: 'Tooling',
    versionMode: 'independent' as const,
    packages: [
      {
        name: '@maz-ui/eslint-config',
        oldVersion: '5.1.0',
        newVersion: '5.1.1',
        tag: '@maz-ui/eslint-config@5.1.1',
        private: false,
      },
    ],
  }
  const unifiedOutcome = (version: string): MergePreviewOutcome => ({
    bumpResult: { bumped: false },
    overview: {
      projectName: 'maz-ui',
      groups: [
        unifiedGroup(version),
        toolingGroup,
      ],
    },
    packages: [
      {
        name: 'maz-ui',
        oldVersion: '5.5.0',
        newVersion: version,
        reason: 'commits',
        fromPullRequest: true,
        commits: [
          {
            type: 'feat',
            scope: '',
            description: 'add',
            isBreaking: false,
            shortHash: 'aaa',
            fromPullRequest: true,
          },
          {
            type: 'fix',
            scope: '',
            description: 'fix',
            isBreaking: false,
            shortHash: 'bbb',
            fromPullRequest: false,
          },
        ],
      },
      ...['@maz-ui/icons', '@maz-ui/utils'].map(name => ({
        name,
        oldVersion: '5.5.0',
        newVersion: version,
        reason: 'commits' as const,
        fromPullRequest: false,
        commits: [],
      })),
      {
        name: '@maz-ui/eslint-config',
        oldVersion: '5.1.0',
        newVersion: '5.1.1',
        reason: 'commits',
        fromPullRequest: false,
        commits: [
          {
            type: 'fix',
            scope: '',
            description: 'fix',
            isBreaking: false,
            shortHash: 'ccc',
            fromPullRequest: false,
          },
        ],
      },
    ],
  })
  const plain = (lines: string[]) => lines.map(line => stripVTControlCharacters(line))

  it('When packages only follow the unified version, Then lists them on one line', () => {
    const { notes } = getMergePreviewTerminalOutput(resultOf({
      plan: {
        squash: { mode: 'commits', reason: '' },
        outcome: unifiedOutcome('5.6.0'),
      },
    }))

    expect(notes[0]!.title).toBe('Release plan · maz-ui · tag v5.6.0')
    expect(plain(notes[0]!.lines)).toEqual([
      'maz-ui  5.5.0  →  5.6.0  this PR: 1 feature · main: 1 fix',
      '+ 2 packages on the unified version: @maz-ui/icons, @maz-ui/utils',
    ])
    expect(notes[0]!.footer).toEqual(['Published with the dist-tag latest'])
    expect(notes[1]!.title).toBe('Release plan · Tooling')
    expect(notes[1]!.footer).toEqual(['Published with the dist-tag latest'])
  })

  it('When a squash merge releases another version, Then only shows the groups it changes', () => {
    const { notes } = getMergePreviewTerminalOutput(resultOf({
      plan: {
        squash: { mode: 'both', reason: '' },
        outcome: unifiedOutcome('5.6.0'),
        squashOutcome: unifiedOutcome('5.5.1'),
      },
    }))

    expect(notes.map(note => note.title)).toEqual([
      'With a merge commit or a rebase · maz-ui · tag v5.6.0',
      'With a merge commit or a rebase · Tooling',
      'With a squash merge · maz-ui · tag v5.5.1',
    ])
  })
})

describe('Given the commit status of the merge preview', () => {
  it('When the merge releases packages, Then describes their versions', () => {
    expect(getMergePreviewStatusDescription(resultOf())).toBe('Releases a@1.1.0, b@1.1.0, c@1.1.0')
  })

  it('When the release would fail, Then describes the first problem, cut to 140 characters', () => {
    const description = getMergePreviewStatusDescription(resultOf({
      checks: {
        problems: [
          {
            kind: 'error',
            message: 'x'.repeat(200),
          },
          { kind: 'error', message: 'other' },
        ],
        warnings: [],
      },
    }))

    expect(description).toHaveLength(140)
    expect(description.endsWith('…')).toBe(true)
  })

  it('When the merge releases nothing, Then says so', () => {
    expect(getMergePreviewStatusDescription(resultOf({ plan: undefined }))).toBe('The merge releases nothing')
  })
})
