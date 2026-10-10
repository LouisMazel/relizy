import { execSync } from 'node:child_process'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getNewPackageCompareBase } from '../repo'

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}))

function mockGit({ firstCommit, parent }: { firstCommit: string, parent?: string | Error }) {
  vi.mocked(execSync).mockImplementation(((command: string) => {
    if (command.startsWith('git log')) {
      return `${firstCommit}\n`
    }
    if (command.startsWith('git rev-parse')) {
      if (parent instanceof Error) {
        throw parent
      }
      return `${parent ?? ''}\n`
    }
    throw new Error(`Unexpected command: ${command}`)
  }) as typeof execSync)
}

describe('Given getNewPackageCompareBase function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('When the first package commit has a parent', () => {
    it('Then returns the parent commit so the whole package history is covered', () => {
      mockGit({ firstCommit: 'first123', parent: 'parent456' })

      expect(getNewPackageCompareBase('/repo/packages/web', '/repo')).toBe('parent456')
      expect(execSync).toHaveBeenCalledWith(
        'git rev-parse --verify --quiet "first123^"',
        expect.objectContaining({ cwd: '/repo' }),
      )
    })
  })

  describe('When the first package commit is the repository root commit', () => {
    it('Then falls back to the first package commit', () => {
      mockGit({ firstCommit: 'root123', parent: new Error('no parent') })

      expect(getNewPackageCompareBase('/repo/packages/web', '/repo')).toBe('root123')
    })
  })

  describe('When the package has no commits yet', () => {
    it('Then returns null', () => {
      mockGit({ firstCommit: '' })

      expect(getNewPackageCompareBase('/repo/packages/web', '/repo')).toBeNull()
    })
  })
})
