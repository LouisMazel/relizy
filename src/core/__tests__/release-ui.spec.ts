import type { ReleaseReport } from '../release-report'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockCommit, createMockPackageInfo, setInteractiveTerminal } from '../../../tests/mocks'

const CANCEL = Symbol('clack:cancel')
const spin = { start: vi.fn(), stop: vi.fn(), error: vi.fn(), clear: vi.fn(), message: vi.fn() }

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  box: vi.fn(),
  confirm: vi.fn(),
  isCancel: vi.fn((value: unknown) => value === CANCEL),
  spinner: vi.fn(() => spin),
  log: { message: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

interface Reporter { log: (logObj: { type: string, args: unknown[] }) => void }

const ENV_KEYS = ['RELIZY_REPORTER', 'CI', 'GITHUB_ACTIONS', 'GITLAB_CI', 'BUILDKITE', 'CIRCLECI', 'NO_COLOR'] as const
const env = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]))

let cwd: string
let reporters: Reporter[]
let output: string[]

/**
 * A fresh module (the active output, the CLI flag), with its logger and prompts
 */
async function load(vars: Partial<Record<typeof ENV_KEYS[number], string>> = {}, { cli = false } = {}) {
  for (const key of ENV_KEYS) {
    delete process.env[key]
  }
  Object.assign(process.env, vars)

  vi.resetModules()
  const { logger } = await import('@maz-ui/node')
  reporters = [{ log: vi.fn() }]
  vi.mocked(logger.removeReporter).mockReturnValue({ options: { reporters } } as never)
  // A test may leave its output running: the level is intercepted until it ends
  logger.setLevel = vi.fn()

  const ui = await import('../release-ui')
  if (cli) {
    ui.enableCliUi()
  }

  return {
    ui,
    progress: await import('../progress'),
    errors: await import('../errors'),
    bumpPrompt: await import('../bump-prompt'),
    clack: await import('@clack/prompts'),
    logger,
  }
}

/** Log through the reporter of the running output */
function log(type: string, ...args: unknown[]) {
  reporters.at(-1)!.log({ type, args })
}

const releaseReport: ReleaseReport = {
  status: 'released',
  released: false,
  dryRun: true,
  canary: false,
  release: { projectName: 'relizy', groups: [{ name: '', title: 'relizy', versionMode: 'unified', version: '2.0.0', oldVersion: '1.14.3', tag: 'v2.0.0', packages: [{ name: 'relizy', oldVersion: '1.14.3', newVersion: '2.0.0', tag: 'v2.0.0', private: false }] }] },
  version: '2.0.0',
  tags: ['v2.0.0'],
  steps: [
    { name: 'publish', status: 'done', detail: 'relizy@2.0.0', links: [{ label: 'relizy@2.0.0', url: 'https://www.npmjs.com/package/relizy/v/2.0.0' }] },
    { name: 'social', status: 'failed', detail: 'slack: down' },
    { name: 'prComment', status: 'skipped' },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  cwd = mkdtempSync(join(tmpdir(), 'relizy-ui-'))
  output = []
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    output.push(String(chunk))
    return true
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  rmSync(cwd, { recursive: true, force: true })
  for (const key of ENV_KEYS) {
    if (env[key] === undefined) {
      delete process.env[key]
    }
    else {
      process.env[key] = env[key]
    }
  }
})

function lines(): string[] {
  return output.join('').split('\n').filter(Boolean)
}

describe('Given the renderer of the output', () => {
  it('Then keeps the logs of the logger out of the CLI (the programmatic API)', async () => {
    const { ui, logger } = await load()

    const commandUi = ui.createCommandUi({ title: 'relizy bump', dryRun: false, cwd })
    const result = await commandUi.step({ title: 'Bump versions', running: 'Computing', done: () => 'done', run: () => Promise.resolve(42) })

    expect(result).toBe(42)
    expect(ui.isFancyUi()).toBe(false)
    expect(logger.box).toHaveBeenCalledWith('Bump versions')
    expect(output).toEqual([])
  })

  it('Then lets RELIZY_REPORTER force an output, out of the CLI too', async () => {
    const { ui } = await load({ RELIZY_REPORTER: 'ci', NO_COLOR: '1' })

    ui.createCommandUi({ title: 'relizy bump', dryRun: false, cwd }).complete({ message: 'Bumped relizy 2.0.0' })

    expect(ui.isFancyUi()).toBe(true)
    expect(lines()[0]).toBe('relizy bump · ci')
  })

  it('Then shows the CI output in CI, the classic one when forced', async () => {
    const { ui } = await load({ GITHUB_ACTIONS: 'true', NO_COLOR: '1' })
    ui.enableCliUi()
    ui.createCommandUi({ title: 'relizy bump', dryRun: false, cwd }).complete({ message: 'Bumped' })

    expect(lines()[0]).toBe('relizy bump · github')

    const classic = await load({ GITHUB_ACTIONS: 'true', RELIZY_REPORTER: 'classic' })
    classic.ui.enableCliUi()

    expect(classic.ui.isFancyUi()).toBe(false)
  })
})

describe('Given the CI output', () => {
  it('Then shows each step in a collapsible group of GitHub Actions, its result after it', async () => {
    const { ui, progress } = await load({ GITHUB_ACTIONS: 'true', NO_COLOR: '1' }, { cli: true })
    const commandUi = ui.createCommandUi({ title: 'relizy release', dryRun: true, cwd })

    await commandUi.step({
      running: 'Creating the releases',
      done: (count: number) => `${count} GitHub release created`,
      details: () => ['v2.0.0'],
      run: () => {
        log('info', 'Using Git provider: github')
        progress.reportProgress('Creating the releases')
        progress.reportProgress('Writing the notes of v2.0.0')
        progress.reportProgress('Writing the notes of v2.0.0')
        progress.reportProgress('Rewriting the notes of v2.0.0 with AI (claude-code)', { ai: true })
        progress.reportStepNote('The notes of v2.0.0: AI rewrite simulated', { ai: true })
        progress.showPreview({ title: 'GitHub release v2.0.0', meta: ['Prerelease'], content: '### Features\n\n- A feature' })
        log('warn', 'No from tag found for pkg:\ndetails')
        log('debug', 'hidden')
        return Promise.resolve(1)
      },
    })

    expect(lines()).toEqual([
      'relizy release · github   DRY RUN  nothing will be written',
      '::group::Creating the releases',
      '  Using Git provider: github',
      // The step itself is not a progress, the same progress is shown once
      '  › Writing the notes of v2.0.0',
      '  ✨ Rewriting the notes of v2.0.0 with AI (claude-code)',
      '  No from tag found for pkg:',
      '  details',
      '::endgroup::',
      expect.stringMatching(/^✔ 1 GitHub release created {2}\d+ms {2}dry run$/),
      '  v2.0.0',
      '  ✨ The notes of v2.0.0: AI rewrite simulated',
      '::group::Preview: GitHub release v2.0.0',
      '  Prerelease',
      '  ### Features',
      '  - A feature',
      '::endgroup::',
      '::warning title=relizy::No from tag found for pkg',
    ])
  })

  it('Then shows the sections of GitLab CI, the warnings as lines', async () => {
    const { ui } = await load({ GITLAB_CI: 'true', NO_COLOR: '1' }, { cli: true })
    const commandUi = ui.createCommandUi({ title: 'relizy bump', dryRun: false, cwd })

    await commandUi.step({
      running: 'Computing the versions',
      done: () => 'relizy 1.0.0 → 2.0.0',
      run: () => {
        log('warn', 'Uncommitted changes')
        return Promise.resolve()
      },
    })

    const text = output.join('')
    const ESC = String.fromCharCode(27)
    expect(text).toMatch(new RegExp(`${ESC}\\[0Ksection_start:\\d+:relizy_computing_the_versions\\[collapsed=true\\]\r${ESC}\\[0KComputing the versions\n`))
    expect(text).toMatch(new RegExp(`${ESC}\\[0Ksection_end:\\d+:relizy_computing_the_versions\r${ESC}\\[0K\n`))
    expect(lines()).toContain('▲ Uncommitted changes')
  })

  it('Then tells a skipped step, a failed step and the error once, marked as reported', async () => {
    const { ui, errors } = await load({ GITHUB_ACTIONS: 'true', NO_COLOR: '1' }, { cli: true })
    const commandUi = ui.createCommandUi({ title: 'relizy release', dryRun: false, cwd })
    const error = new Error('npm publish failed\nE403 Forbidden')

    commandUi.skip({ title: 'Publish', label: 'Publish', reason: '--no-publish' })
    await expect(commandUi.step({ running: 'Publishing the packages', done: () => '', run: () => Promise.reject(error) })).rejects.toBe(error)
    commandUi.fail(error, 'Publish', releaseReport)

    expect(lines()).toEqual(expect.arrayContaining([
      '○ Publish skipped (--no-publish)',
      expect.stringMatching(/^✖ Publishing the packages failed {2}\d+ms$/),
      '  ▲ Social media  slack: down',
      '::error title=relizy: Publish failed::npm publish failed%0AE403 Forbidden%0AFull log: node_modules/.cache/relizy/release.log',
    ]))
    expect(errors.isErrorReported(error)).toBe(true)
  })

  it('Then ends a release with its summary, its links and a notice', async () => {
    const { ui } = await load({ GITHUB_ACTIONS: 'true', NO_COLOR: '1' }, { cli: true })

    ui.createCommandUi({ title: 'relizy release', dryRun: true, cwd }).finish(releaseReport)

    expect(lines().slice(1)).toEqual([
      '    Version       2.0.0',
      '    Tag           v2.0.0',
      '  ✔ Publish       relizy@2.0.0',
      '                  https://www.npmjs.com/package/relizy/v/2.0.0',
      '  ▲ Social media  slack: down',
      '  ○ PR comment    skipped',
      expect.stringMatching(/^ DRY RUN {2}Simulated release of relizy 2\.0\.0, nothing was written {2}\d+ms$/),
      '::notice title=relizy::Simulated release of relizy 2.0.0, nothing was written',
    ])
  })

  it('Then ends another command with what it did, nothing without a notice', async () => {
    const { ui } = await load({ GITHUB_ACTIONS: 'true', NO_COLOR: '1' }, { cli: true })

    ui.createCommandUi({ title: 'relizy publish', dryRun: false, cwd }).complete({ message: 'Published relizy@2.0.0', links: [{ label: 'relizy@2.0.0', url: 'https://www.npmjs.com/package/relizy/v/2.0.0' }] })
    ui.createCommandUi({ title: 'relizy bump', dryRun: false, cwd }).complete({ message: 'Nothing to bump', nothing: true })

    expect(lines()).toEqual([
      'relizy publish · github',
      '  https://www.npmjs.com/package/relizy/v/2.0.0',
      expect.stringMatching(/^✔ Published relizy@2\.0\.0 {2}\d+ms$/),
      '::notice title=relizy::Published relizy@2.0.0',
      'relizy bump · github',
      expect.stringMatching(/^○ Nothing to bump {2}\d+ms$/),
    ])
  })

  it('Then ends a command whose every action failed as failed', async () => {
    const { ui } = await load({ GITHUB_ACTIONS: 'true', NO_COLOR: '1' }, { cli: true })

    ui.createCommandUi({ title: 'relizy social', dryRun: false, cwd }).complete({ message: 'twitter failed', failed: true })

    expect(lines().at(-1)).toMatch(/^▲ twitter failed {2}\d+ms$/)
    expect(lines()).not.toContain('::notice title=relizy::twitter failed')
  })

  it('Then marks a step that failed without stopping the command', async () => {
    const { ui } = await load({ GITHUB_ACTIONS: 'true', NO_COLOR: '1' }, { cli: true })
    const commandUi = ui.createCommandUi({ title: 'relizy release', dryRun: false, cwd })

    await commandUi.step({ running: 'Posting the release', done: () => 'slack failed', failed: () => true, run: () => Promise.resolve() })

    expect(lines()).toContainEqual(expect.stringMatching(/^▲ slack failed {2}\d+ms$/))
  })

  it('Then closes the group of a cancelled step, and never prompts itself', async () => {
    const { ui, errors } = await load({ GITHUB_ACTIONS: 'true', NO_COLOR: '1' }, { cli: true })
    const commandUi = ui.createCommandUi({ title: 'relizy bump', dryRun: false, cwd })
    const cancel = new errors.RelizyCancelError('Bump cancelled')

    await expect(commandUi.step({ running: 'Computing the versions', done: () => '', run: () => Promise.reject(cancel) })).rejects.toBe(cancel)

    expect(lines()).toEqual(['relizy bump · github', '::group::Computing the versions', '::endgroup::'])
    expect(await (commandUi as unknown as { prompt: <T>(run: () => Promise<T>) => Promise<T> }).prompt(() => Promise.resolve('answer'))).toBe('answer')
  })

  it('Then colors the output, unless NO_COLOR', async () => {
    const { ui } = await load({ GITHUB_ACTIONS: 'true' }, { cli: true })

    ui.createCommandUi({ title: 'relizy bump', dryRun: true, cwd }).complete({ message: 'Bumped' })

    expect(output.join('')).toContain('\u001B[')
  })

  it('Then shows the dry-run badge in fixed colors, the base yellow being dark in the light theme of GitHub', async () => {
    const { ui } = await load({ GITHUB_ACTIONS: 'true' }, { cli: true })

    ui.createCommandUi({ title: 'relizy bump', dryRun: true, cwd }).complete({ message: 'Bumped' })

    expect(output.join('')).toContain('\u001B[48;5;220m\u001B[38;5;16m\u001B[1m DRY RUN ')
    expect(output.join('')).not.toContain('\u001B[43m')
  })
})

describe('Given a command run by another one', () => {
  it('Then shows its steps as the progress of the running step, and lets the parent end', async () => {
    const { ui } = await load({ GITHUB_ACTIONS: 'true', NO_COLOR: '1' }, { cli: true })
    const release = ui.createCommandUi({ title: 'relizy release', dryRun: false, cwd })

    await release.step({
      running: 'Publishing the packages',
      done: () => 'Published relizy@2.0.0',
      run: async () => {
        const publish = ui.createCommandUi({ title: 'relizy publish', dryRun: false, cwd })
        await publish.step({ running: 'Checking the packages to publish', done: () => 'checked', run: () => Promise.resolve() })
        publish.skip({ title: 'Build', label: 'Build', reason: 'no build command' })
        publish.complete({ message: 'Published' })
        publish.finish(releaseReport)
        publish.fail(new Error('ignored'))
      },
    })

    expect(lines()).toEqual([
      'relizy release · github',
      '::group::Publishing the packages',
      '  › Checking the packages to publish',
      '::endgroup::',
      expect.stringMatching(/^✔ Published relizy@2\.0\.0 {2}\d+ms$/),
    ])
  })
})

describe('Given the log file and the level of the logger', () => {
  it('Then writes every log and preview to the log file, and restores the reporters and the level asked meanwhile', async () => {
    const { ui, progress, logger } = await load({ RELIZY_REPORTER: 'ci', NO_COLOR: '1' })
    const original = reporters[0]
    const setLevel = logger.setLevel
    const commandUi = ui.createCommandUi({ title: 'relizy changelog', dryRun: true, cwd })

    expect(setLevel).toHaveBeenCalledWith('verbose')
    logger.setLevel('debug')

    await commandUi.step({
      running: 'Writing the changelogs',
      done: () => '1 changelog written',
      run: () => {
        log('debug', 'Generating the changelog of relizy')
        progress.showPreview({ title: 'Changelog of relizy', content: '## v2.0.0' })
        return Promise.resolve()
      },
    })
    commandUi.complete({ message: 'Previewed 1 changelog' })

    const file = readFileSync(join(cwd, 'node_modules/.cache/relizy/release.log'), 'utf8')
    expect(file).toContain('[debug] Generating the changelog of relizy')
    expect(file).toContain('[preview] Changelog of relizy\n## v2.0.0')
    expect(reporters).toEqual([original])
    expect(logger.setLevel).toBe(setLevel)
    expect(setLevel).toHaveBeenLastCalledWith('debug')
  })
})

describe('Given the terminal output', () => {
  it('Then shows a spinner per step, then its result, details, notes, previews and warnings', async () => {
    const { ui, progress, clack } = await load({ RELIZY_REPORTER: 'pretty' })
    const commandUi = ui.createCommandUi({ title: 'relizy release', dryRun: true, cwd })

    await commandUi.step({
      running: 'Creating the releases',
      done: () => '1 GitHub release created',
      details: () => ['v2.0.0'],
      run: () => {
        progress.reportStepNote('The notes of v2.0.0 rewritten by AI', { ai: true })
        progress.reportStepNote('2 contributors found')
        progress.showPreview({ title: 'GitHub release v2.0.0', content: Array.from({ length: 40 }, (_, index) => `line ${index + 1}`).join('\n') })
        log('warn', 'Rate limited:\nretrying')
        log('info', 'Using Git provider: github')
        return Promise.resolve()
      },
    })

    expect(clack.intro).toHaveBeenCalledWith(expect.stringContaining('DRY RUN'))
    expect(spin.start).toHaveBeenCalledWith('Creating the releases')
    expect(spin.stop).toHaveBeenCalledWith(expect.stringMatching(/^1 GitHub release created {2}\d+ms {2}dry run$/))
    expect(clack.log.message).toHaveBeenCalledWith('v2.0.0')
    expect(clack.log.message).toHaveBeenCalledWith('The notes of v2.0.0 rewritten by AI', { symbol: '✨' })
    expect(clack.log.message).toHaveBeenCalledWith('2 contributors found', { symbol: '·' })
    // Cut to 30 lines, the rest in the log file
    const [content, title] = vi.mocked(clack.box).mock.calls[0]!
    expect(title).toBe(' Preview GitHub release v2.0.0 ')
    expect(content).toContain('line 30')
    expect(content).not.toContain('line 31')
    expect(content).toContain('… 10 more lines (--log-level verbose, or node_modules/.cache/relizy/release.log)')
    expect(clack.log.warn).toHaveBeenCalledWith('Rate limited')
    // The logs of relizy only with --log-level verbose
    expect(clack.log.message).not.toHaveBeenCalledWith(expect.stringContaining('Using Git provider'))
  })

  it('Then styles the markdown of a preview, and tells a skipped step', async () => {
    const { ui, progress, clack } = await load({ RELIZY_REPORTER: 'pretty' })
    const commandUi = ui.createCommandUi({ title: 'relizy release', dryRun: true, cwd })

    commandUi.skip({ title: 'Publish', label: 'Publish', reason: '--no-publish' })
    await commandUi.step({
      running: 'Writing the changelogs',
      done: () => '1 changelog written',
      run: () => {
        progress.showPreview({ title: 'Changelog of relizy', content: '## v2.0.0\n\n- **core:** a fix ([a1b2c3d](https://github.com/user/relizy/commit/a1b2c3d))' })
        return Promise.resolve()
      },
    })

    expect(clack.log.message).toHaveBeenCalledWith('Publish skipped (--no-publish)', { symbol: '○' })
    expect(vi.mocked(clack.box).mock.calls[0]![0]).toBe('## v2.0.0\n\n- core: a fix ([a1b2c3d](https://github.com/user/relizy/commit/a1b2c3d))')
  })

  it('Then shows the logs and the whole previews with --log-level verbose', async () => {
    const { ui, progress, clack } = await load({ RELIZY_REPORTER: 'pretty' })
    const commandUi = ui.createCommandUi({ title: 'relizy changelog', dryRun: true, logLevel: 'verbose', cwd })

    await commandUi.step({
      running: 'Writing the changelogs',
      done: () => '1 changelog written',
      run: () => {
        log('info', 'Using Git provider: github')
        progress.showPreview({ title: 'Changelog of relizy', content: Array.from({ length: 40 }, (_, index) => `line ${index + 1}`).join('\n') })
        return Promise.resolve()
      },
    })

    expect(clack.log.message).toHaveBeenCalledWith('Using Git provider: github')
    expect(vi.mocked(clack.box).mock.calls[0]![0]).toContain('line 40')
  })

  it('Then shows the progress in the spinner, the AI one with its elapsed time', async () => {
    vi.useFakeTimers()
    const { ui, progress } = await load({ RELIZY_REPORTER: 'pretty' })
    const commandUi = ui.createCommandUi({ title: 'relizy release', dryRun: false, cwd })

    const running = commandUi.step({
      running: 'Creating the releases',
      done: () => 'done',
      run: () => new Promise<void>((resolve) => {
        progress.reportProgress('Rewriting the notes of v2.0.0 with AI (claude-code)', { ai: true })
        setTimeout(resolve, 3000)
      }),
    })
    await vi.advanceTimersByTimeAsync(3000)
    await running
    vi.useRealTimers()

    const messages = spin.message.mock.calls.map(([message]) => String(message))
    expect(messages.some(message => message.startsWith('✨ ') && message.includes('2s'))).toBe(true)
  })

  it('Then clears a cancelled step, and ends with the cancellation', async () => {
    const { ui, errors, clack } = await load({ RELIZY_REPORTER: 'pretty' })
    const commandUi = ui.createCommandUi({ title: 'relizy bump', dryRun: false, cwd })
    const cancel = new errors.RelizyCancelError('Bump cancelled')

    await expect(commandUi.step({ running: 'Computing the versions', done: () => '', run: () => Promise.reject(cancel) })).rejects.toBe(cancel)
    commandUi.fail(cancel)

    expect(spin.clear).toHaveBeenCalled()
    expect(clack.log.error).not.toHaveBeenCalled()
    expect(clack.outro).toHaveBeenCalledWith('Bump cancelled')
  })

  it('Then shows an error once, with the log file, then the summary and the end', async () => {
    const { ui, clack } = await load({ RELIZY_REPORTER: 'pretty' })
    const commandUi = ui.createCommandUi({ title: 'relizy release', dryRun: false, cwd })
    const error = new Error('push rejected')

    await expect(commandUi.step({ running: 'Pushing', done: () => '', run: () => Promise.reject(error) })).rejects.toBe(error)
    commandUi.fail(error, 'Push', { ...releaseReport, status: 'failed', dryRun: false })

    expect(spin.error).toHaveBeenCalledWith(expect.stringMatching(/^Pushing {2}\d+ms$/))
    expect(clack.log.error).toHaveBeenCalledWith('push rejected\nFull log: node_modules/.cache/relizy/release.log')
    expect(vi.mocked(clack.box).mock.calls[0]![1]).toBe(' Summary ')
    expect(clack.outro).toHaveBeenCalledWith('Release failed')
  })

  it('Then ends a dry run with the summary, the command to release for real and the end', async () => {
    const { ui, clack } = await load({ RELIZY_REPORTER: 'pretty' })
    vi.spyOn(process, 'argv', 'get').mockReturnValue(['node', 'relizy', 'release', '--dry-run', '--ai-preview', '--yes'])

    ui.createCommandUi({ title: 'relizy release', dryRun: true, cwd }).finish(releaseReport)

    const [content, title] = vi.mocked(clack.box).mock.calls[0]!
    expect(title).toContain('Summary')
    expect(title).toContain('DRY RUN')
    expect(content).toContain('relizy@2.0.0')
    expect(content).toContain('https://www.npmjs.com/package/relizy/v/2.0.0')
    expect(content).toContain('For real')
    expect(content).toContain('relizy release --yes')
    expect(content).not.toContain('--ai-preview')
    expect(clack.outro).toHaveBeenCalledWith(expect.stringMatching(/Simulated release of relizy 2\.0\.0, nothing was written/))
  })

  it('Then ends nothing to release without summary', async () => {
    const { ui, clack } = await load({ RELIZY_REPORTER: 'pretty' })

    ui.createCommandUi({ title: 'relizy release', dryRun: false, cwd }).finish({ status: 'nothing', released: false, dryRun: false, canary: false, tags: [], steps: [] })

    expect(clack.box).not.toHaveBeenCalled()
    expect(clack.outro).toHaveBeenCalledWith(expect.stringMatching(/^Nothing to release/))
  })

  it('Then shows a step that failed without stopping the command as a warning, and a failed end', async () => {
    const { ui, clack } = await load({ RELIZY_REPORTER: 'pretty' })
    const commandUi = ui.createCommandUi({ title: 'relizy social', dryRun: false, cwd })

    await commandUi.step({ running: 'Posting the release', done: () => 'twitter failed', failed: () => true, run: () => Promise.resolve() })
    commandUi.complete({ message: 'twitter failed', failed: true })

    expect(spin.stop).not.toHaveBeenCalled()
    expect(clack.log.warn).toHaveBeenCalledWith(expect.stringMatching(/^twitter failed {2}\d+ms$/))
    expect(clack.outro).toHaveBeenCalledWith(expect.stringMatching(/^▲ twitter failed/))
  })

  it('Then ends another command with its details and links', async () => {
    const { ui, clack } = await load({ RELIZY_REPORTER: 'pretty' })

    ui.createCommandUi({ title: 'relizy social', dryRun: false, cwd }).complete({ message: 'Posted on twitter', details: ['1 post'], links: [{ label: 'Tweet', url: 'https://x.com/i/web/status/1' }] })

    expect(clack.log.message).toHaveBeenCalledWith('1 post')
    expect(clack.log.message).toHaveBeenCalledWith('https://x.com/i/web/status/1')
    expect(clack.outro).toHaveBeenCalledWith(expect.stringMatching(/^✔ Posted on twitter/))
  })
})

describe('Given the confirmation of a bump', () => {
  const packages = [{ ...createMockPackageInfo({ name: 'relizy', version: '1.14.4-beta.0', newVersion: '2.0.0' }), oldVersion: '1.14.4-beta.0', reason: 'graduation' as const }]

  let restoreTerminal: () => void

  // An interactive terminal, unless a test says otherwise
  beforeEach(() => {
    restoreTerminal = setInteractiveTerminal(true)
  })

  afterEach(() => {
    restoreTerminal()
  })

  it('Then is asked by the terminal output, in its words, after the warnings', async () => {
    const { ui, bumpPrompt, clack } = await load({ RELIZY_REPORTER: 'pretty' })
    const commandUi = ui.createCommandUi({ title: 'relizy bump', dryRun: true, cwd })
    vi.mocked(clack.confirm).mockResolvedValueOnce(true)

    await commandUi.step({
      running: 'Computing the versions',
      done: () => 'done',
      run: async () => {
        log('warn', 'Uncommitted changes in files the release commits: package.json (modified)')
        expect(await bumpPrompt.confirmBumpWithOutput(packages)).toBe(true)
      },
    })

    expect(spin.clear).toHaveBeenCalled()
    expect(clack.log.warn).toHaveBeenCalledTimes(1)
    expect(vi.mocked(clack.log.warn).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(clack.box).mock.invocationCallOrder[0]!)
    expect(vi.mocked(clack.box).mock.calls[0]![1]).toBe(' Bump plan · DRY RUN ')
    expect(vi.mocked(clack.box).mock.calls[0]![0]).toContain('stable release of the beta')
    expect(clack.confirm).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/^Bump this version\? {3}DRY RUN /), active: 'Bump', inactive: 'Cancel' }))
    // The spinner of the step goes on
    expect(spin.start).toHaveBeenCalledTimes(2)
  })

  it('Then cancels the run when refused or cancelled', async () => {
    const { ui, errors, clack } = await load({ RELIZY_REPORTER: 'pretty' })
    ui.createCommandUi({ title: 'relizy release', dryRun: false, cwd })

    vi.mocked(clack.confirm).mockResolvedValueOnce(false)
    await expect(ui.confirmBumpInReleaseUi({ packages })).rejects.toThrow(new errors.RelizyCancelError('Release cancelled'))
    vi.mocked(clack.confirm).mockResolvedValueOnce(CANCEL as never)
    await expect(ui.confirmBumpInReleaseUi({ packages })).rejects.toThrow(new errors.RelizyCancelError('Release cancelled'))
    expect(vi.mocked(clack.box).mock.calls[0]![1]).toBe(' Release plan ')
  })

  it('Then fails with what to do when nobody can answer, instead of cancelling the run', async () => {
    setInteractiveTerminal(false)
    const { ui, clack } = await load({ RELIZY_REPORTER: 'pretty' })
    ui.createCommandUi({ title: 'relizy release', dryRun: false, cwd })

    await expect(ui.confirmBumpInReleaseUi({ packages })).rejects.toThrow('"Release this version?" needs an answer, but the terminal is not interactive: run with --yes to confirm it in advance')
    expect(clack.confirm).not.toHaveBeenCalled()
  })

  it('Then is left to the default prompt by the other outputs', async () => {
    const { ui } = await load({ RELIZY_REPORTER: 'ci' })
    ui.createCommandUi({ title: 'relizy bump', dryRun: false, cwd })

    expect(await ui.confirmBumpInReleaseUi({ packages })).toBeUndefined()
  })
})

describe('Given the packages of a bump', () => {
  it('Then tells why each package is released, in plain words', async () => {
    const { ui } = await load()
    const pkg = (overrides: Record<string, unknown>) => ({ ...createMockPackageInfo({ name: 'pkg', version: '1.0.0', newVersion: '1.1.0', commits: [] }), oldVersion: '1.0.0', ...overrides })
    const breaking = { ...createMockCommit('feat', 'feat!: drop node 20'), isBreaking: true }

    expect(ui.describeBumpedPackages([
      pkg({ name: 'graduated', oldVersion: '1.1.0-rc.2', newVersion: '1.1.0' }),
      pkg({ name: 'peer', breakingPeerDependency: 'maz-ui' }),
      pkg({ name: 'dependent', reason: 'dependency', dependencyChain: ['core'] }),
      pkg({ name: 'ranged', reason: 'dependency', outOfRangePeer: 'core' }),
      pkg({ name: 'changed', commits: [createMockCommit('feat', 'feat: a'), createMockCommit('feat', 'feat: b'), createMockCommit('fix', 'fix: c'), breaking, createMockCommit('ci', 'ci: d')] }),
      pkg({ name: 'forced' }),
    ])).toEqual([
      'graduated  1.1.0-rc.2  →  1.1.0  stable release of the rc',
      // Aligned: the names, then the old versions on the right
      'peer            1.0.0  →  1.1.0  maz-ui has a breaking change',
      'dependent       1.0.0  →  1.1.0  follows core',
      'ranged          1.0.0  →  1.1.0  follows core (peer range)',
      'changed         1.0.0  →  1.1.0  2 features, 1 fix, 1 breaking change, 1 ci commit',
      'forced          1.0.0  →  1.1.0  forced',
    ])
  })

  it('Then tells what a bump did', async () => {
    const { ui } = await load()
    const bumped = (count: number) => ({ bumped: true as const, bumpedPackages: Array.from({ length: count }, (_, index) => ({ ...createMockPackageInfo({ name: `pkg-${index}`, newVersion: '2.0.0' }), oldVersion: '1.0.0' })) })

    expect(ui.describeBumpResult({ bumped: false })).toBe('No commit to release')
    expect(ui.describeBumpResult(bumped(1))).toMatch(/^pkg-0 +1\.0\.0 {2}→ {2}2\.0\.0/)
    expect(ui.describeBumpResult(bumped(3))).toBe('3 packages to release')
    // Listed by the confirmation unless --yes
    expect(ui.getBumpResultDetails(bumped(3), false)).toEqual([])
    expect(ui.getBumpResultDetails(bumped(3), true)).toHaveLength(3)
    expect(ui.getBumpResultDetails(bumped(1), true)).toEqual([])
  })
})
