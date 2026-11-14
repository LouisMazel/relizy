import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stripRelizyNpmrcBlocks, withRegistryNpmrc } from '../registry'

const registryTarget = { registry: 'https://registry.npmjs.org/', token: 'fake-token-for-tests' }

describe('Given withRegistryNpmrc', () => {
  let cwd: string

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'relizy-npmrc-'))
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  const npmrc = () => join(cwd, '.npmrc')
  const inject = (fn: () => Promise<unknown>) => withRegistryNpmrc({
    cwd,
    registryTarget,
    packageManager: 'npm',
    fn,
  })

  describe('When several calls run at the same time in one project', () => {
    it('Then each sees the token, and no .npmrc is left', async () => {
      const seen: boolean[] = []
      await Promise.all(Array.from({ length: 5 }, () => inject(async () => {
        await new Promise(resolve => setTimeout(resolve, 5))
        seen.push(readFileSync(npmrc(), 'utf8').includes('fake-token-for-tests'))
      })))

      expect(seen).toEqual([true, true, true, true, true])
      expect(existsSync(npmrc())).toBe(false)
    })
  })

  describe('When the project has a .npmrc', () => {
    it('Then it is written back as it was, even after concurrent calls', async () => {
      writeFileSync(npmrc(), '@acme:registry=https://npm.acme.test/\n')
      await Promise.all([
        inject(async () => {}),
        inject(async () => {}),
      ])

      expect(readFileSync(npmrc(), 'utf8')).toBe('@acme:registry=https://npm.acme.test/\n')
    })
  })

  describe('When another process left its temporary block', () => {
    it('Then the block is removed, never written back', async () => {
      writeFileSync(npmrc(), [
        'save-exact=true',
        '# relizy:start (temporary registry auth, removed after the command)',
        '//registry.npmjs.org/:_authToken=left-by-another-process',
        '# relizy:end',
        '',
      ].join('\n'))
      await inject(() => {
        expect(readFileSync(npmrc(), 'utf8')).not.toContain('left-by-another-process')
        return Promise.resolve()
      })

      expect(readFileSync(npmrc(), 'utf8')).toBe('save-exact=true\n')
    })

    it('Then a .npmrc that only held the block is removed', async () => {
      writeFileSync(npmrc(), '# relizy:start (temporary registry auth, removed after the command)\n//registry.npmjs.org/:_authToken=x\n# relizy:end\n')
      await inject(async () => {})

      expect(existsSync(npmrc())).toBe(false)
    })
  })

  describe('When stripRelizyNpmrcBlocks reads a .npmrc', () => {
    it('Then only the temporary blocks go', () => {
      expect(stripRelizyNpmrcBlocks('a=1\n# relizy:start (temporary registry auth, removed after the command)\nb=2\n# relizy:end\nc=3\n')).toBe('a=1\nc=3\n')
    })
  })
})
