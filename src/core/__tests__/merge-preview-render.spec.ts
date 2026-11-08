import type { MergePreviewOutcome } from '../merge-preview/plan'
import type { MergePreviewResult } from '../merge-preview/render'
import { formatMergePreviewMarkdown, formatMergePreviewText, getMergePreviewStatusDescription } from '../merge-preview/render'

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
      '| a | `1.0.0` → `1.1.0` | feat (this PR) ⭐ |',
      '| b | `1.0.0` → `1.1.0` | fix (on `main`) |',
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
    expect(markdown).toContain('feat (this MR) ⭐')
  })

  it('When it runs outside a pull request, Then previews the next release in plain text', () => {
    const text = formatMergePreviewText(resultOf({
      context: undefined,
      publish: { enabled: false, distTag: 'latest' },
    }))

    expect(text).toContain('🔮 The next release\n\nrelizy releases 3 packages from `main`, not published:')
    expect(text).toContain('| a | `1.0.0` → `1.1.0` | feat |')
    expect(text).not.toContain('<!--')
    expect(text).toContain('Computed on `main` by relizy')
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
