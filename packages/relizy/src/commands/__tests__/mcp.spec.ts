import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { cancel, intro, log, multiselect, note, outro } from '@clack/prompts'
import { logger } from '@maz-ui/node'
import { isInCI } from '@relizy/core'
import { setInteractiveTerminal } from '../../../tests/mocks'
import { findOutdatedRules, setupRelizyAgents } from '../../core/agents'
import { cleanTempDirs, createTempDir, getBundleDir, writeOutdatedRules } from '../../core/mcp/__tests__/helpers'
import { formatAgentsChanges, mcpInit, mcpUpdate } from '../mcp'

vi.mock('@clack/prompts', () => ({
  cancel: vi.fn(),
  intro: vi.fn(),
  log: {
    info: vi.fn(),
  },
  multiselect: vi.fn(),
  note: vi.fn(),
  outro: vi.fn(),
}))

// The CI running these tests must not turn mcpUpdate into a no-op
vi.mock('../../../../core/src/ci-env', async importActual => ({
  ...await importActual<typeof import('../../../../core/src/ci-env')>(),
  isInCI: vi.fn(() => false),
}))

let cwd: string

beforeEach(() => {
  cwd = createTempDir()
})

afterAll(() => {
  cleanTempDirs()
})

function read(file: string): string {
  return readFileSync(join(cwd, file), 'utf8')
}

describe('Given mcpUpdate', () => {
  describe('When a rule of the project is outdated', () => {
    it('Then it is rewritten, nothing else is created, and one line is printed', () => {
      const log = vi.spyOn(logger, 'log').mockImplementation(() => {})

      writeOutdatedRules(cwd)

      const changes = mcpUpdate({ cwd })

      expect(changes.map(change => change.file)).toEqual(['.claude/rules/relizy.md'])
      expect(read('.claude/rules/relizy.md')).not.toContain('A rule of an older relizy.')
      expect(existsSync(join(cwd, 'AGENTS.md'))).toBe(false)
      expect(existsSync(join(cwd, '.mcp.json'))).toBe(false)
      expect(log).toHaveBeenCalledTimes(1)
      expect(log.mock.calls[0]?.[0]).toContain('updated')
      expect(findOutdatedRules(cwd)).toEqual([])

      log.mockRestore()
    })
  })

  describe('When it runs in CI', () => {
    it('Then an outdated rule is not rewritten, as nobody commits it there', () => {
      vi.mocked(isInCI).mockReturnValueOnce(true)
      writeOutdatedRules(cwd)

      expect(mcpUpdate({ cwd })).toEqual([])
      expect(read('.claude/rules/relizy.md')).toContain('A rule of an older relizy.')
    })
  })

  describe('When the rules are up to date', () => {
    it('Then it prints nothing and writes nothing', () => {
      const log = vi.spyOn(logger, 'log').mockImplementation(() => {})
      const info = vi.spyOn(logger, 'info').mockImplementation(() => {})

      setupRelizyAgents({
        cwd,
        mcp: false,
        targets: ['claude'],
        docsDir: getBundleDir(),
      })
      const before = read('.claude/rules/relizy.md')

      expect(mcpUpdate({ cwd })).toEqual([])
      expect(read('.claude/rules/relizy.md')).toBe(before)
      expect(log).not.toHaveBeenCalled()
      expect(info).not.toHaveBeenCalled()

      log.mockRestore()
      info.mockRestore()
    })
  })

  describe('When the rules are missing', () => {
    it('Then nothing is created, and an AGENTS.md without section is untouched', () => {
      expect(mcpUpdate({ cwd })).toEqual([])
      expect(existsSync(join(cwd, '.claude'))).toBe(false)
      expect(existsSync(join(cwd, 'AGENTS.md'))).toBe(false)

      writeFileSync(join(cwd, 'AGENTS.md'), '# Agents\n\nRules of the project.\n')

      expect(mcpUpdate({ cwd })).toEqual([])
      expect(read('AGENTS.md')).toBe('# Agents\n\nRules of the project.\n')
      expect(mcpUpdate({
        cwd: join(cwd, 'missing', 'folder'),
      })).toEqual([])
    })
  })

  describe('When it is a dry run', () => {
    it('Then the file is not written', () => {
      const log = vi.spyOn(logger, 'log').mockImplementation(() => {})

      writeOutdatedRules(cwd)
      const before = read('.claude/rules/relizy.md')

      expect(mcpUpdate({ cwd, dryRun: true }).map(change => change.file)).toEqual(['.claude/rules/relizy.md'])
      expect(read('.claude/rules/relizy.md')).toBe(before)
      expect(log.mock.calls[0]?.[0]).toContain('would update')

      log.mockRestore()
    })
  })
})

describe('Given mcpInit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('When it runs in dry run', () => {
    it('Then it prints the changes and the hints without writing', async () => {
      const result = await mcpInit({
        cwd,
        dryRun: true,
        docsDir: getBundleDir(),
      })

      // Without CLAUDE.md, Claude Code reads AGENTS.md: no Claude rule
      expect(result?.changes.map(change => [change.file, change.action])).toEqual([
        ['AGENTS.md', 'create'],
        ['.mcp.json', 'create'],
      ])
      expect(existsSync(join(cwd, '.mcp.json'))).toBe(false)
      expect(intro).toHaveBeenCalledWith(expect.stringContaining('relizy mcp init'))
      expect(note).toHaveBeenCalledWith(expect.stringContaining('would create  AGENTS.md'), expect.stringContaining('for claude, agents-md'))
      expect(log.info).toHaveBeenCalledWith(expect.stringContaining('add relizy to the devDependencies'))
      expect(log.info).toHaveBeenCalledWith(expect.stringContaining('Codex, Cline and Zed read AGENTS.md'))
      expect(outro).toHaveBeenCalledWith('Dry run, nothing written')
    })
  })

  describe('When it runs in a terminal', () => {
    it('Then it asks the agents, and writes nothing when the question is cancelled', async () => {
      const restoreTerminal = setInteractiveTerminal(true)
      vi.mocked(multiselect).mockResolvedValueOnce(['cursor']).mockResolvedValueOnce(Symbol('cancel') as never)

      const result = await mcpInit({
        cwd,
        dryRun: true,
        docsDir: getBundleDir(),
      })
      const cancelled = await mcpInit({
        cwd,
        docsDir: getBundleDir(),
      }).finally(restoreTerminal)

      expect(result?.targets).toEqual(['agents-md', 'cursor'])
      expect(cancelled).toBeUndefined()
      expect(cancel).toHaveBeenCalledWith('Cancelled, nothing written')
      expect(existsSync(join(cwd, 'AGENTS.md'))).toBe(false)
    })
  })

  describe('When the targets are invalid', () => {
    it('Then it cancels with the error and sets the exit code', async () => {
      const result = await mcpInit({
        cwd,
        targets: ['zed' as never],
      })

      expect(result).toBeUndefined()
      expect(cancel).toHaveBeenCalledWith(expect.stringContaining('AI agents not set up - Unknown agent target(s): zed'))
      expect(process.exitCode).toBe(1)
      process.exitCode = undefined
    })
  })

  describe('When the project has a package.json', () => {
    it('Then it adds the prepare script with the rules, removes it with them, and keeps it with --no-rules or --no-prepare', async () => {
      writeFileSync(join(cwd, 'package.json'), '{ "name": "lib" }')

      const result = await mcpInit({
        cwd,
        docsDir: getBundleDir(),
      })

      expect(result?.changes).toContainEqual({ file: 'package.json', action: 'update', reason: 'prepare script: relizy mcp update' })
      expect(JSON.parse(read('package.json')).scripts).toEqual({ prepare: 'relizy mcp update' })
      expect(outro).toHaveBeenCalledWith(expect.stringContaining('AI agents set up for relizy'))

      await mcpInit({ cwd, remove: true, rules: false })
      await mcpInit({ cwd, remove: true, prepare: false })
      expect(JSON.parse(read('package.json')).scripts).toEqual({ prepare: 'relizy mcp update' })

      await mcpInit({ cwd, remove: true })
      expect(JSON.parse(read('package.json'))).toEqual({ name: 'lib' })
      expect(outro).toHaveBeenCalledWith(expect.stringContaining('relizy removed from the AI agents'))
    })
  })

  describe('When it removes the setup or only registers the server', () => {
    it('Then the hints are not printed', async () => {
      await mcpInit({ cwd, remove: true })
      await mcpInit({
        cwd,
        rules: false,
        mcp: false,
        targets: ['claude'],
      })

      expect(log.info).not.toHaveBeenCalled()
    })
  })
})

describe('Given formatAgentsChanges', () => {
  describe('When changes are printed', () => {
    it('Then each action has its label', () => {
      expect(formatAgentsChanges([
        { file: 'a', action: 'create' },
        { file: 'b', action: 'update' },
        { file: 'c', action: 'remove' },
        { file: 'd', action: 'unchanged' },
        { file: 'e', action: 'skip', reason: 'edited' },
      ], false)).toEqual([
        'created       a',
        'updated       b',
        'removed       c',
        'up to date    d',
        'skipped       e (edited)',
      ])
      expect(formatAgentsChanges([
        { file: 'a', action: 'update' },
      ], true)).toEqual(['would update  a'])
    })
  })
})
