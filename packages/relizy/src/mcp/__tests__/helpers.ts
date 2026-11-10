import type { GitRepository } from '../../../../../tests/git-repository'
import type { ServerContext } from '../context'
import type { Knowledge } from '../knowledge/load'

import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGitRepository } from '../../../../../tests/git-repository'
import { setupRelizyAgents } from '../agents'
import { createContext } from '../context'
import { generateAgentDocs } from '../knowledge/generate'
import { loadKnowledge } from '../knowledge/load'

export const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

const tempDirs: string[] = []

export function createTempDir(prefix = 'relizy-mcp-'): string {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), prefix)))
  tempDirs.push(directory)

  return directory
}

export function cleanTempDirs(): void {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
}

let bundleDir: string | undefined
let knowledge: Knowledge | undefined

/** The docs bundle generated from the sources of this repository, once per test file */
export function getBundleDir(): string {
  if (!bundleDir) {
    bundleDir = realpathSync(mkdtempSync(join(tmpdir(), 'relizy-agent-docs-')))
    generateAgentDocs({ rootDir: ROOT_DIR, outDir: bundleDir })
  }

  return bundleDir
}

export function getKnowledge(): Knowledge {
  knowledge ??= loadKnowledge(getBundleDir())

  return knowledge
}

export function createTestContext(cwd: string = createTempDir()): ServerContext {
  return createContext({
    cwd,
    knowledge: getKnowledge(),
  })
}

/** A temporary git repository, without remote, removed by `cleanTempDirs()` */
export function createRepository(): GitRepository {
  const repository = createGitRepository('relizy-mcp-repo-')
  tempDirs.push(repository.cwd)

  return repository
}

/** Write the rules of `cwd` from an older docs bundle (other rules): the current ones then replace them */
export function writeOutdatedRules(cwd: string): void {
  const olderDir = createTempDir('relizy-older-docs-')

  cpSync(getBundleDir(), olderDir, { recursive: true })
  for (const file of ['claude-rule.md', 'agents-md.md']) {
    const path = join(olderDir, 'agents', file)

    writeFileSync(path, `${readFileSync(path, 'utf8')}\n- A rule of an older relizy.\n`)
  }

  setupRelizyAgents({
    cwd,
    mcp: false,
    targets: ['claude'],
    docsDir: olderDir,
  })
}
