/**
 * Regression test: commits whose type declares a `title` (without `semver`)
 * must appear in changelog/provider-release/social outputs.
 *
 * Bug: pre-fix, `pkg.commits` carried in `bumpResult` was collected for bump
 * purposes (`getPackageCommits({ changelog: false })`), which filters out
 * types like `docs: { title: '📖 Documentation' }`. Downstream consumers
 * (changelog file, GitHub/GitLab release notes, social posts) reused that
 * filtered array, so docs commits never surfaced even when configured.
 *
 * Fix: `generateChangelog` now fetches commits internally with
 * `changelog: true`; github/gitlab/social go through `generateChangelog` so
 * they all benefit automatically.
 *
 * Expected rules:
 *   - `docs: false`                            → not in changelog, no bump
 *   - `docs: { title: 'X' }`                   → in changelog, no bump
 *   - `docs: { title: 'X', semver: 'patch' }`  → in changelog AND bump
 */
import type { GitCommit } from 'changelogen'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockConfig } from '../../../tests/mocks'
import { generateChangelog } from '../changelog'
import { getPackageCommits } from '../repo'

vi.mock('../repo', () => ({
  getPackageCommits: vi.fn(),
}))

vi.mock('../git', () => ({
  getFirstCommit: vi.fn(() => 'first-commit-hash'),
  getCurrentGitRef: vi.fn(() => 'HEAD'),
}))

vi.mock('../utils', async () => {
  const actual = await vi.importActual('../utils')
  return {
    ...actual,
    executeHook: vi.fn(),
  }
})

function makeCommit(overrides: Partial<GitCommit>): GitCommit {
  return {
    shortHash: 'abc1234',
    author: { name: 'Alice', email: 'alice@example.com' },
    message: 'docs: update README',
    body: '',
    type: 'docs',
    scope: '',
    references: [{ value: 'abc1234', type: 'hash' }],
    description: 'update README',
    isBreaking: false,
    authors: [{ name: 'Alice', email: 'alice@example.com' }],
    ...overrides,
  } as GitCommit
}

describe('Given a commit type with a `title` but no `semver`', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('When the changelog is rendered via `generateChangelog`', () => {
    it('Then the section appears under the configured title', async () => {
      vi.mocked(getPackageCommits).mockResolvedValue([
        makeCommit({ type: 'docs', description: 'update README' }),
      ])

      const config = createMockConfig({
        cwd: '/repo',
        bump: { type: 'release' },
        monorepo: { versionMode: 'selective', packages: ['packages/*'] },
        types: {
          docs: { title: '📖 Documentation' },
        },
      })

      const changelog = await generateChangelog({
        pkg: { name: 'root', path: '/repo', fromTag: 'v1.0.0' },
        config,
        dryRun: false,
        newVersion: '1.1.0',
      })

      expect(changelog).toContain('📖 Documentation')
      expect(changelog).toContain('Update README')
    })

    it('Then the section is excluded when the type is set to `false`', async () => {
      vi.mocked(getPackageCommits).mockResolvedValue([
        makeCommit({ type: 'docs', description: 'update README' }),
      ])

      const config = createMockConfig({
        cwd: '/repo',
        bump: { type: 'release' },
        monorepo: { versionMode: 'selective', packages: ['packages/*'] },
        types: {
          docs: false,
        } as any,
      })

      const changelog = await generateChangelog({
        pkg: { name: 'root', path: '/repo', fromTag: 'v1.0.0' },
        config,
        dryRun: false,
        newVersion: '1.1.0',
      })

      expect(changelog).not.toContain('Update README')
    })

    it('Then `getPackageCommits` is called with `changelog: true`', async () => {
      vi.mocked(getPackageCommits).mockResolvedValue([])

      const config = createMockConfig({
        cwd: '/repo',
        bump: { type: 'release' },
        monorepo: { versionMode: 'selective', packages: ['packages/*'] },
        types: { docs: { title: '📖 Documentation' } },
      })

      await generateChangelog({
        pkg: { name: 'root', path: '/repo', fromTag: 'v1.0.0' },
        config,
        dryRun: false,
        newVersion: '1.1.0',
      })

      expect(getPackageCommits).toHaveBeenCalledWith(
        expect.objectContaining({ changelog: true }),
      )
    })
  })

  describe('When `generateChangelog` is invoked in body-only mode (used by provider releases / social posts)', () => {
    it('Then the docs commit still appears (no title, no compareLink, no contributors)', async () => {
      vi.mocked(getPackageCommits).mockResolvedValue([
        makeCommit({ type: 'docs', description: 'update README' }),
      ])

      const config = createMockConfig({
        cwd: '/repo',
        bump: { type: 'release' },
        monorepo: { versionMode: 'selective', packages: ['packages/*'] },
        types: { docs: { title: '📖 Documentation' } },
      })

      const body = await generateChangelog({
        pkg: { name: 'root', path: '/repo', fromTag: 'v1.0.0' },
        config,
        dryRun: false,
        newVersion: '1.1.0',
        include: { title: false, compareLink: false, body: true, contributors: false },
      })

      expect(body).toContain('📖 Documentation')
      expect(body).toContain('Update README')
      expect(body).not.toContain('## v1.0.0...v1.1.0')
    })

    it('Then `transformBody` receives the rendered body for AI rewriting', async () => {
      vi.mocked(getPackageCommits).mockResolvedValue([
        makeCommit({ type: 'docs', description: 'update README' }),
      ])

      const config = createMockConfig({
        cwd: '/repo',
        bump: { type: 'release' },
        monorepo: { versionMode: 'selective', packages: ['packages/*'] },
        types: { docs: { title: '📖 Documentation' } },
      })

      const seen: string[] = []

      await generateChangelog({
        pkg: { name: 'root', path: '/repo', fromTag: 'v1.0.0' },
        config,
        dryRun: false,
        newVersion: '1.1.0',
        include: { title: false, compareLink: false, body: true, contributors: false },
        transformBody: (body) => {
          seen.push(body)
          return `AI(${body})`
        },
      })

      expect(seen).toHaveLength(1)
      expect(seen[0]).toContain('📖 Documentation')
      expect(seen[0]).toContain('Update README')
    })
  })
})
