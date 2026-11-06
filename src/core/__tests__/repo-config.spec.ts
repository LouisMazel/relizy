import type { RepoConfig } from '../../types'
import { execSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { formatCompareChanges, formatReference, getRepoConfig, resolveRepoConfig } from '../repo-config'

// Mocked globally in `vitest.setup.ts`
vi.unmock('../repo-config')

/**
 * Cases ported from the tests of changelogen 0.6.2 (MIT, Pooya Parsa):
 * https://github.com/unjs/changelogen/blob/v0.6.2/test/repo.test.ts
 * https://github.com/unjs/changelogen/blob/v0.6.2/test/git.test.ts
 */

const github: RepoConfig = { provider: 'github', repo: 'unjs/changelogen', domain: 'github.com' }
const gitlab: RepoConfig = { provider: 'gitlab', repo: 'unjs/changelogen', domain: 'gitlab.com' }
const bitbucket: RepoConfig = { provider: 'bitbucket', repo: 'unjs/changelogen', domain: 'bitbucket.org' }

describe('Given getRepoConfig', () => {
  describe('When the URL has a provider prefix (`provider:owner/name` or `user@host:owner/name`)', () => {
    it.each([
      { input: 'github:donaldsh/test', output: { domain: 'github.com', provider: 'github', repo: 'donaldsh/test' } },
      { input: 'gitlab:donaldsh/test.git', output: { domain: 'gitlab.com', provider: 'gitlab', repo: 'donaldsh/test' } },
      { input: 'git@bitbucket.org:donaldsh/test.git', output: { domain: 'bitbucket.org', provider: 'bitbucket', repo: 'donaldsh/test' } },
      { input: 'a@x:b/c', output: { domain: 'x', provider: undefined, repo: 'b/c' } },
      { input: 'github:unjs/changelogen', output: github },
      { input: 'git@github.com:unjs/changelogen.git', output: github },
      { input: 'gitlab:unjs/changelogen', output: gitlab },
      { input: 'git@gitlab.com:unjs/changelogen.git', output: gitlab },
      { input: 'bitbucket:unjs/changelogen', output: bitbucket },
      { input: 'git@bitbucket.org:unjs/changelogen.git', output: bitbucket },
    ])('Then $input is resolved', ({ input, output }) => {
      expect(getRepoConfig(input)).toStrictEqual(output)
    })
  })

  describe('When the URL is an http(s) URL', () => {
    it.each([
      { input: 'https://github.com/unjs/changelogen.git', output: github },
      { input: 'https://github.com/unjs/changelogen', output: github },
      { input: 'https://github.com/myproject.git', output: { domain: 'github.com', provider: 'github', repo: 'myproject' } },
      { input: 'https://github.com/account/project/sub1/sub2/myproject.git', output: { domain: 'github.com', provider: 'github', repo: 'account/project/sub1/sub2/myproject' } },
      { input: 'https://gitlab.com/unjs/changelogen', output: gitlab },
      { input: 'https://gitlab.com/unjs/changelogen.git', output: gitlab },
      { input: 'https://bitbucket.org/unjs/changelogen', output: bitbucket },
      { input: 'https://bitbucket.org/unjs/changelogen.git', output: bitbucket },
      { input: 'https://donaldsh@bitbucket.org/unjs/changelogen.git', output: bitbucket },
    ])('Then $input is resolved', ({ input, output }) => {
      expect(getRepoConfig(input)).toStrictEqual(output)
    })
  })

  describe('When the URL is only `owner/name`', () => {
    it.each([
      { input: 'donaldsh/test.git', output: { domain: 'github.com', provider: 'github', repo: 'donaldsh/test' } },
      { input: 'unjs/changelogen', output: github },
    ])('Then $input is a GitHub repository', ({ input, output }) => {
      expect(getRepoConfig(input)).toStrictEqual(output)
    })
  })

  describe('When the repository is self-hosted', () => {
    it('Then the provider is undefined when the host does not name one', () => {
      const selfhosted = { repo: 'unjs/changelogen', domain: 'git.unjs.io' }

      expect(getRepoConfig('selfhosted:unjs/changelogen')).toStrictEqual({ provider: undefined, repo: 'unjs/changelogen', domain: 'selfhosted' })
      expect(getRepoConfig('https://git.unjs.io/unjs/changelogen')).toStrictEqual({ ...selfhosted, provider: undefined })
      expect(getRepoConfig('https://git.unjs.io/unjs/changelogen.git')).toMatchObject(selfhosted)
      expect(getRepoConfig('https://donaldsh@git.unjs.io/unjs/changelogen.git')).toMatchObject(selfhosted)
      expect(getRepoConfig('git@git.unjs.io:unjs/changelogen.git')).toMatchObject(selfhosted)
    })
  })

  describe('When the host of a self-hosted repository names its provider', () => {
    it.each([
      { input: 'git@gitlab.example.com:team/app.git', output: { domain: 'gitlab.example.com', provider: 'gitlab', repo: 'team/app' } },
      { input: 'https://gitlab.example.com/team/app.git', output: { domain: 'gitlab.example.com', provider: 'gitlab', repo: 'team/app' } },
      { input: 'https://github.mycompany.com/team/app', output: { domain: 'github.mycompany.com', provider: 'github', repo: 'team/app' } },
      { input: 'git@bitbucket.mycompany.com:team/app.git', output: { domain: 'bitbucket.mycompany.com', provider: 'bitbucket', repo: 'team/app' } },
    ])('Then $input keeps its host and gets the provider', ({ input, output }) => {
      expect(getRepoConfig(input)).toStrictEqual(output)
    })
  })

  describe('When the URL is empty or invalid', () => {
    it('Then everything is undefined', () => {
      const empty = { provider: undefined, repo: undefined, domain: undefined }

      expect(getRepoConfig()).toStrictEqual(empty)
      expect(getRepoConfig(undefined)).toStrictEqual(empty)
      expect(getRepoConfig('')).toStrictEqual(empty)
      expect(getRepoConfig('unjs')).toStrictEqual(empty)
    })
  })
})

describe('Given formatReference', () => {
  describe('When there is no repository or an unknown provider', () => {
    it('Then it returns the raw value', () => {
      const unknown: RepoConfig = { repo: 'unjs/changelogen', domain: 'git.unjs.io' }

      expect(formatReference({ type: 'hash', value: '3828bda' })).toBe('3828bda')
      expect(formatReference({ type: 'pull-request', value: '#123' })).toBe('#123')
      expect(formatReference({ type: 'issue', value: '#14' })).toBe('#14')
      expect(formatReference({ type: 'hash', value: '3828bda' }, unknown)).toBe('3828bda')
      expect(formatReference({ type: 'pull-request', value: '#123' }, unknown)).toBe('#123')
      expect(formatReference({ type: 'issue', value: '#14' }, unknown)).toBe('#14')
    })
  })

  describe('When the provider is known', () => {
    it.each([
      { repo: github, hash: 'https://github.com/unjs/changelogen/commit/3828bda', pr: 'https://github.com/unjs/changelogen/pull/123', issue: 'https://github.com/unjs/changelogen/issues/14' },
      { repo: gitlab, hash: 'https://gitlab.com/unjs/changelogen/commit/3828bda', pr: 'https://gitlab.com/unjs/changelogen/merge_requests/123', issue: 'https://gitlab.com/unjs/changelogen/issues/14' },
      { repo: bitbucket, hash: 'https://bitbucket.org/unjs/changelogen/commit/3828bda', pr: 'https://bitbucket.org/unjs/changelogen/pull-requests/123', issue: 'https://bitbucket.org/unjs/changelogen/issues/14' },
    ])('Then it links the references of $repo.provider', ({ repo, hash, pr, issue }) => {
      expect(formatReference({ type: 'hash', value: '3828bda' }, repo)).toBe(`[3828bda](${hash})`)
      expect(formatReference({ type: 'pull-request', value: '#123' }, repo)).toBe(`[#123](${pr})`)
      expect(formatReference({ type: 'issue', value: '#14' }, repo)).toBe(`[#14](${issue})`)
    })
  })
})

describe('Given formatCompareChanges', () => {
  describe('When the provider is GitHub or GitLab', () => {
    it('Then it compares `from...v`, `to` without `v`', () => {
      expect(formatCompareChanges('v1.1.0', { repo: github, from: 'v1.0.0', to: 'HEAD' })).toBe('[compare changes](https://github.com/unjs/changelogen/compare/v1.0.0...v1.1.0)')
      expect(formatCompareChanges('', { repo: gitlab, from: 'v1.0.0', to: 'v1.1.0' })).toBe('[compare changes](https://gitlab.com/unjs/changelogen/compare/v1.0.0...v1.1.0)')
    })
  })

  describe('When the provider is Bitbucket', () => {
    it('Then it compares the branches the other way round', () => {
      expect(formatCompareChanges('v1.1.0', { repo: bitbucket, from: 'v1.0.0', to: 'HEAD' })).toBe('[compare changes](https://bitbucket.org/unjs/changelogen/branches/compare/v1.1.0%0Dv1.0.0)')
    })
  })
})

describe('Given resolveRepoConfig', () => {
  let root: string

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'relizy-repo-config-')))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  describe('When the closest package.json has a repository', () => {
    it('Then it reads the repository string or object, from a parent directory too', async () => {
      writeFileSync(join(root, 'package.json'), JSON.stringify({ repository: { type: 'git', url: 'git+https://github.com/unjs/changelogen.git' } }))
      mkdirSync(join(root, 'packages', 'a'), { recursive: true })
      writeFileSync(join(root, 'packages', 'package.json'), JSON.stringify({ repository: 'gitlab:unjs/changelogen' }))

      expect(await resolveRepoConfig(root)).toStrictEqual({ provider: 'github', repo: 'unjs/changelogen', domain: 'github.com' })
      expect(await resolveRepoConfig(join(root, 'packages', 'a'))).toStrictEqual(gitlab)
    })
  })

  describe('When the package.json has comments', () => {
    it('Then it is read as JSONC', async () => {
      writeFileSync(join(root, 'package.json'), '{\n  // repository\n  "repository": "unjs/changelogen",\n}\n')

      expect(await resolveRepoConfig(root)).toStrictEqual(github)
    })
  })

  describe('When the package.json has no repository', () => {
    it('Then it falls back to the origin remote', async () => {
      writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'a' }))
      execSync('git init -q && git remote add origin git@gitlab.com:unjs/changelogen.git', { cwd: root })

      expect(await resolveRepoConfig(root)).toStrictEqual(gitlab)
    })
  })

  describe('When there is neither a repository nor a remote', () => {
    it('Then it is undefined', async () => {
      writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'a' }))
      execSync('git init -q', { cwd: root })

      expect(await resolveRepoConfig(root)).toBeUndefined()
    })

    it('Then git writes nothing to the stderr of the user', () => {
      writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'a' }))
      execSync('git init -q', { cwd: root })
      const modulePath = join(process.cwd(), 'src/core/repo-config.ts')

      const result = spawnSync(join(process.cwd(), 'node_modules/.bin/tsx'), ['--eval', `import(${JSON.stringify(modulePath)}).then(({ resolveRepoConfig }) => resolveRepoConfig(process.cwd()))`], { cwd: root, encoding: 'utf8' })

      expect(result.status).toBe(0)
      expect(result.stderr).not.toContain('No such remote')
    }, 30_000)
  })
})
