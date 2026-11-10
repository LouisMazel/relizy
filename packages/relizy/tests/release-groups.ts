import type { GitRepository } from '../../../tests/git-repository'
import type { PackageBase } from '../src/types'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { createGitRepository } from '../../../tests/git-repository'
import { publishPackage } from '../src/core/npm'
import { isVersionPublished } from '../src/core/npm-versions'

/**
 * The repository of the integration tests of a release with version groups
 * (`release-groups*.git.spec.ts`): a selective group (`main`) and an
 * independent group (`header`) whose packages have peer dependencies on the
 * packages of the first one. The spec files mock `publishPackage` and
 * `isVersionPublished`, and call `useReleaseGroupsRepository()`.
 */

let repository: GitRepository
let initialCwd: string

export const releaseRepo = {
  cwd: '',
  /**
   * Versions of the dependencies of `@scope/nav` on disk, read when each package is published
   */
  publishedPackages: [] as { name: string, version: string, componentsVersionOnDisk: string, dryRun: boolean }[],
}

export function git(...args: string[]) {
  return repository.git(...args)
}

export function writeJson(path: string, content: Record<string, unknown>) {
  repository.writeJson(path, content)
}

export function readVersion(path: string): string {
  return JSON.parse(readFileSync(join(releaseRepo.cwd, path, 'package.json'), 'utf8')).version
}

export function commitFile(path: string, message: string) {
  repository.commit(message, { [path]: `${message}\n` })
}

export function writeConfig({ headerOptions = '', options = '' }: { headerOptions?: string, options?: string } = {}) {
  writeFileSync(join(releaseRepo.cwd, 'relizy.config.mjs'), `export default {
${options}
logLevel: 'silent',
safetyCheck: false,
noAuthors: true,
publish: { packageManager: 'pnpm', registry: 'https://registry.npmjs.org/' },
release: { push: false, providerRelease: false, social: false, prComment: false },
monorepo: {
  groups: [
    { name: 'main', versionMode: 'selective', packages: ['packages/*', 'shared/*'] },
    { name: 'header', versionMode: 'independent', packages: ['shared/nav', 'shared/login'], changelog: { rootChangelog: false }${headerOptions} },
  ],
},
}
`)
}

/**
 * A new repository for each test, the current directory of the test
 */
export function useReleaseGroupsRepository() {
  beforeEach(() => {
    vi.clearAllMocks()
    initialCwd = process.cwd()
    repository = createGitRepository('relizy-release-groups-')
    releaseRepo.cwd = repository.cwd

    writeJson('.', { name: 'monorepo', version: '6.19.1', private: true })
    writeJson('packages/components', { name: '@scope/components', version: '6.19.1' })
    writeJson('packages/theme', { name: '@scope/theme', version: '6.18.0' })
    writeJson('shared/nav', {
      name: '@scope/nav',
      version: '1.2.0',
      peerDependencies: { '@scope/components': 'workspace:*', '@scope/theme': 'workspace:^' },
    })
    writeJson('shared/login', { name: '@scope/login', version: '2.0.0' })
    writeConfig()

    git('add', '-A')
    git('commit', '--no-verify', '-m', 'chore: init')
    git('tag', '-a', 'v6.19.1', '-m', 'v6.19.1')
    git('tag', '-a', '@scope/nav@1.2.0', '-m', '@scope/nav@1.2.0')
    git('tag', '-a', '@scope/login@2.0.0', '-m', '@scope/login@2.0.0')

    commitFile('packages/components/button.js', 'feat(components): add a button')
    // A breaking change in the independent group must not bump the major of the selective group
    commitFile('shared/nav/menu.js', 'feat(nav)!: new menu API')

    process.chdir(releaseRepo.cwd)

    releaseRepo.publishedPackages = []
    vi.mocked(publishPackage).mockImplementation(({ pkg, dryRun }: { pkg: PackageBase, dryRun: boolean }) => {
      releaseRepo.publishedPackages.push({
        name: pkg.name,
        version: pkg.newVersion || pkg.version,
        componentsVersionOnDisk: readVersion('packages/components'),
        dryRun,
      })
      return Promise.resolve()
    })
    // The versions not published by the release (e.g. @scope/theme@6.18.0) are on the registry
    vi.mocked(isVersionPublished).mockResolvedValue(true)
  })

  afterEach(() => {
    process.chdir(initialCwd)
    repository.remove()
  })
}
