import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'

const ROOT = resolve(__dirname, '../../../..')

/** The lines of the YAML block scalar (`run: |`, `- |`) opened at the line `start`, dedented */
function blockAt(lines: string[], start: number): string {
  const indent = /^ */.exec(lines[start + 1]!)![0].length
  const block: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (line.trim() && /^ */.exec(line)![0].length < indent) {
      break
    }
    block.push(line.slice(indent))
  }
  return block.join('\n')
}

const readLines = (file: string) => readFileSync(join(ROOT, file), 'utf8').split('\n')

/** The script of the step `release` of the GitHub action */
function actionScript(): string {
  const lines = readLines('integrations/github-action/action.yml')
  const step = lines.indexOf('    - id: release')
  return blockAt(lines, lines.indexOf('      run: |', step))
}

/** The script of the GitLab component that runs relizy release */
function componentScript(): string {
  const lines = readLines('integrations/gitlab-component/templates/release.yml')
  return blockAt(lines, lines.findIndex((line, index) => line.trim() === '- |' && lines[index + 1]!.includes('release_type=')))
}

describe('Given the commit status input of the CI integrations', () => {
  let cwd: string

  /** A project whose relizy prints its arguments, knowing --report-status or not */
  function project({ knowsReportStatus }: { knowsReportStatus: boolean }) {
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({
      name: 'app',
      devDependencies: { relizy: '*' },
    }))
    mkdirSync(join(cwd, 'node_modules/.bin'), { recursive: true })
    const bin = join(cwd, 'node_modules/.bin/relizy')
    writeFileSync(bin, `#!/bin/sh
if [ "$2" = "--help" ]; then echo "Usage: relizy release${knowsReportStatus ? ' --report-status' : ''}"; exit 0; fi
echo "$@" >> "${join(cwd, 'args')}"
`)
    chmodSync(bin, 0o755)
    // pnpm exec of the scripts runs this relizy, never a real install nor a real relizy
    mkdirSync(join(cwd, 'shims'), { recursive: true })
    writeFileSync(join(cwd, 'shims/pnpm'), `#!/bin/sh
[ "$1" = exec ] || exit 1
shift
exec "${join(cwd, 'node_modules/.bin')}/$@"
`)
    chmodSync(join(cwd, 'shims/pnpm'), 0o755)
  }

  function run(script: string, env: Record<string, string>) {
    const output = execFileSync('bash', ['-c', script], {
      cwd,
      env: { PATH: `${join(cwd, 'shims')}:${process.env.PATH}`, HOME: process.env.HOME, ...env },
      encoding: 'utf8',
    })
    return {
      output,
      args: readFileSync(join(cwd, 'args'), 'utf8').trim(),
    }
  }

  beforeEach(() => {
    cwd = realpathSync(mkdtempSync(join(tmpdir(), 'relizy-integration-')))
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  const actionEnv = (reportStatus: string, command = 'release') => ({
    RELIZY_COMMAND: command,
    RELEASE_TYPE: 'auto',
    RELIZY_PROFILE: '',
    RELIZY_ARGS: '',
    RELIZY_REPORT_STATUS: reportStatus,
    MERGE_PREVIEW: 'false',
    PACKAGE_MANAGER: 'pnpm',
    RELIZY_VERSION: '',
    RELIZY_ACTION_VERSION: '__RELIZY_VERSION__',
  })

  describe('When the GitHub action releases with its default report-status', () => {
    it('Then a relizy that knows the flag gets --report-status', () => {
      project({ knowsReportStatus: true })

      expect(run(actionScript(), actionEnv('true')).args).toBe('release --yes --report-status')
    })

    it('Then an older relizy runs as before, with a notice', () => {
      project({ knowsReportStatus: false })

      const { output, args } = run(actionScript(), actionEnv('true'))
      expect(args).toBe('release --yes')
      expect(output).toContain('::notice::report-status skipped: this relizy does not know --report-status')
    })

    it('Then report-status: false and another command get nothing', () => {
      project({ knowsReportStatus: true })

      expect(run(actionScript(), actionEnv('false')).args).toBe('release --yes')
      rmSync(join(cwd, 'args'))
      expect(run(actionScript(), actionEnv('true', 'changelog')).args).toBe('changelog')
    })
  })

  describe('When the GitLab component releases', () => {
    const componentEnv = (reportStatus: string) => ({
      RELEASE_TYPE: '',
      RELIZY_INPUT_RELEASE_TYPE: 'auto',
      RELIZY_INPUT_PROFILE: '',
      RELIZY_INPUT_ARGS: '',
      RELIZY_INPUT_REPORT_STATUS: reportStatus,
      RELIZY_INPUT_VERSION: '',
      RELIZY_COMPONENT_VERSION: '__RELIZY_VERSION__',
      CI_PROJECT_DIR: cwd,
      pm: 'pnpm',
    })

    it('Then report-status: false, the default, runs as before', () => {
      project({ knowsReportStatus: true })

      expect(run(componentScript(), componentEnv('false')).args).toBe(`release --yes --report-dotenv ${cwd}/relizy.env`)
    })

    it('Then report-status: true adds --report-status when relizy knows it', () => {
      project({ knowsReportStatus: true })

      expect(run(componentScript(), componentEnv('true')).args).toBe(`release --yes --report-status --report-dotenv ${cwd}/relizy.env`)
      rmSync(join(cwd, 'args'))
      project({ knowsReportStatus: false })
      expect(run(componentScript(), componentEnv('true')).args).toBe(`release --yes --report-dotenv ${cwd}/relizy.env`)
    })
  })
})
