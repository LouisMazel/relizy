import type { GitRepository } from '../../../tests/git-repository'
import type { ServerContext } from '../context'
import type { Knowledge } from '../knowledge/load'

import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGitRepository } from '../../../tests/git-repository'
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
