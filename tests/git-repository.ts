import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

export interface GitRepository {
  cwd: string
  /** Runs git in the repository, returns its trimmed output */
  git: (...args: string[]) => string
  /** Writes a file, creating its directories */
  write: (path: string, content: string) => void
  /** Writes the `package.json` of a directory */
  writeJson: (dir: string, content: Record<string, unknown>) => void
  /** Writes the files, then commits everything (without the hooks, empty commits allowed) */
  commit: (message: string, files?: Record<string, string>) => void
  /** Removes the repository */
  remove: () => void
}

/**
 * A temporary git repository on `main`, without remote, with an identity and
 * without signing (whatever the git config of the machine)
 */
export function createGitRepository(prefix = 'relizy-repo-'): GitRepository {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), prefix)))
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const write = (path: string, content: string) => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true })
    writeFileSync(join(cwd, path), content)
  }

  git('init', '--quiet', '--initial-branch=main')
  git('config', 'user.email', 'relizy@example.com')
  git('config', 'user.name', 'Relizy')
  git('config', 'commit.gpgsign', 'false')
  git('config', 'tag.gpgsign', 'false')

  return {
    cwd,
    git,
    write,
    writeJson: (dir, content) => write(join(dir, 'package.json'), `${JSON.stringify(content, null, 2)}\n`),
    commit: (message, files = {}) => {
      for (const [path, content] of Object.entries(files)) {
        write(path, content)
      }

      git('add', '-A')
      git('commit', '--quiet', '--no-verify', '--allow-empty', '-m', message)
    },
    remove: () => rmSync(cwd, { recursive: true, force: true }),
  }
}
