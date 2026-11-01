import type { ServerContext } from '../context'
import type { Knowledge } from '../knowledge/load'

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
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
  return createContext({ cwd, knowledge: getKnowledge() })
}

export interface TestRepository {
  cwd: string
  git: (...args: string[]) => string
  writeJson: (path: string, content: Record<string, unknown>) => void
  writeFile: (path: string, content: string) => void
  commit: (message: string, files?: Record<string, string>) => void
}

/** A temporary git repository, without remote */
export function createRepository(): TestRepository {
  const cwd = createTempDir('relizy-mcp-repo-')
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  const writeFile = (path: string, content: string) => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true })
    writeFileSync(join(cwd, path), content)
  }

  git('init', '--initial-branch=main')
  git('config', 'user.email', 'relizy@example.com')
  git('config', 'user.name', 'Relizy')
  git('config', 'commit.gpgsign', 'false')
  git('config', 'tag.gpgsign', 'false')

  return {
    cwd,
    git,
    writeFile,
    writeJson: (path, content) => writeFile(join(path, 'package.json'), `${JSON.stringify(content, null, 2)}\n`),
    commit: (message, files = {}) => {
      for (const [path, content] of Object.entries(files)) {
        writeFile(path, content)
      }

      git('add', '-A')
      git('commit', '--no-verify', '--allow-empty', '-m', message)
    },
  }
}
