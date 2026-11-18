import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pinCanaryWorkspaceDependencies } from '../version'

describe('Given pinCanaryWorkspaceDependencies', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'relizy-canary-deps-'))
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'relizy',
      version: '2.3.0-0.canary-4c5ce99',
      dependencies: {
        '@relizy/core': 'workspace:^',
        'helper': 'workspace:~',
        'aliased': 'workspace:other-name@^',
        'exact': 'workspace:*',
        'explicit': 'workspace:^1.2.0',
        'c12': '^3.0.0',
      },
      peerDependencies: { '@relizy/core': 'workspace:^' },
    }))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const read = () => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))

  describe('When a canary is written', () => {
    it('Then the workspace ranges become exact, the other specifiers stay', () => {
      expect(pinCanaryWorkspaceDependencies(dir)).toEqual([
        '@relizy/core',
        'helper',
        'aliased',
        '@relizy/core',
      ])
      expect(read().dependencies).toEqual({
        '@relizy/core': 'workspace:*',
        'helper': 'workspace:*',
        'aliased': 'workspace:other-name@*',
        'exact': 'workspace:*',
        'explicit': 'workspace:^1.2.0',
        'c12': '^3.0.0',
      })
      expect(read().peerDependencies).toEqual({ '@relizy/core': 'workspace:*' })
    })
  })

  describe('When it is a dry run', () => {
    it('Then nothing is written', () => {
      expect(pinCanaryWorkspaceDependencies(dir, true)).toHaveLength(4)
      expect(read().dependencies['@relizy/core']).toBe('workspace:^')
    })
  })
})
