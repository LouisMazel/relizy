import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { logger } from '@maz-ui/node'
import { captureLogs, formatNotes, listConfigNames, loadProjectConfig, redirectConsoleToStderr, withCapturedLogs } from '../runtime'
import { readOwnVersion } from '../version'
import { cleanTempDirs, createRepository, createTempDir, ROOT_DIR } from './helpers'

vi.mock('@maz-ui/node', importActual => importActual())

afterAll(() => {
  cleanTempDirs()
})

describe('Given captureLogs', () => {
  beforeAll(() => {
    captureLogs()
    captureLogs()
  })

  describe('When relizy logs during a tool call', () => {
    it('Then the logs are kept for the call and nothing is written to stdout', async () => {
      const stdout = vi.spyOn(process.stdout, 'write')
      logger.setLevel('debug')

      const { value, logs } = await withCapturedLogs(() => {
        logger.info('Bump from v1.0.0')
        logger.warn('\u001B[33mTag rewritten\u001B[39m')
        logger.debug('A debug line')
        return Promise.resolve(42)
      })

      expect(value).toBe(42)
      expect(logs).toEqual([
        { type: 'info', message: 'Bump from v1.0.0' },
        { type: 'warn', message: 'Tag rewritten' },
        { type: 'debug', message: 'A debug line' },
      ])
      expect(stdout).not.toHaveBeenCalled()
      stdout.mockRestore()
      logger.setLevel('default')
    })
  })

  describe('When relizy logs out of a tool call', () => {
    it('Then only the warnings and errors are written, to stderr', () => {
      const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
      const stdout = vi.spyOn(process.stdout, 'write')

      logger.info('ignored')
      logger.warn('careful')

      expect(stderr).toHaveBeenCalledWith('[relizy] careful\n')
      expect(stderr).toHaveBeenCalledTimes(1)
      expect(stdout).not.toHaveBeenCalled()
      stderr.mockRestore()
      stdout.mockRestore()
    })
  })
})

describe('Given redirectConsoleToStderr', () => {
  describe('When a dependency logs with console.log', () => {
    it('Then it goes to console.error', () => {
      // eslint-disable-next-line no-console -- restored after the test
      const original = { log: console.log, info: console.info, debug: console.debug }
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})

      redirectConsoleToStderr()
      // eslint-disable-next-line no-console -- a dependency logging to stdout
      console.info('from a dependency')

      expect(error).toHaveBeenCalledWith('from a dependency')
      Object.assign(console, original)
      error.mockRestore()
    })
  })
})

describe('Given formatNotes', () => {
  describe('When logs were captured', () => {
    it('Then it keeps the useful ones, once, on their first line', () => {
      expect(formatNotes([
        { type: 'info', message: 'No tag found for pkg\nsecond line' },
        { type: 'info', message: 'No tag found for pkg\nsecond line' },
        { type: 'warn', message: 'Rewritten tag v1.0.0' },
        { type: 'debug', message: 'ignored' },
        { type: 'info', message: '[dry-run] ignored' },
        { type: 'error', message: '' },
      ])).toBe('## Notes\n\n- No tag found for pkg\n- warn: Rewritten tag v1.0.0')
    })

    it('Then nothing when there is no useful log, and a summary above the limit', () => {
      expect(formatNotes([{ type: 'debug', message: 'x' }])).toBe('')
      expect(formatNotes(Array.from({ length: 4 }, (_, index) => ({ type: 'info', message: `log ${index}` })), 2)).toBe('## Notes\n\n- log 0\n- log 1\n- ... and 2 more')
    })
  })
})

describe('Given listConfigNames', () => {
  describe('When a project has several relizy configs', () => {
    it('Then it returns their names for --config', () => {
      const directory = createTempDir()

      for (const file of ['relizy.config.ts', 'relizy.standalone.config.mjs', 'relizy.config.json', 'vite.config.ts', 'relizy.md']) {
        writeFileSync(join(directory, file), '')
      }

      expect(listConfigNames(directory)).toEqual(['relizy', 'relizy.standalone'])
    })
  })
})

describe('Given loadProjectConfig', () => {
  describe('When the project has hooks and no config name is given', () => {
    it('Then the hooks are removed and the run never prompts', async () => {
      const repository = createRepository()
      repository.writeJson('.', { name: 'app', version: '1.0.0' })
      repository.writeFile('relizy.config.mjs', `export default { logLevel: 'silent', hooks: { 'before:bump': 'touch hooked' } }\n`)

      const config = await loadProjectConfig({ cwd: repository.cwd })

      expect(config.hooks).toEqual({})
      expect(config.bump.yes).toBe(true)
      expect(config.onRewrittenTag).toBe('ephemeral')
      expect(config.cwd).toBe(repository.cwd)
    })
  })

  describe('When the project has no config file', () => {
    it('Then an explicit config name is reported, and the defaults apply otherwise', async () => {
      const repository = createRepository()
      repository.writeJson('.', { name: 'app', version: '1.0.0' })

      await expect(loadProjectConfig({ cwd: repository.cwd, config: 'relizy' })).rejects.toThrow('This project has no relizy config file')
      await expect(loadProjectConfig({ cwd: repository.cwd })).resolves.toEqual(expect.objectContaining({ cwd: repository.cwd }))
    })
  })
})

describe('Given readOwnVersion', () => {
  describe('When it runs from the sources or out of any relizy package', () => {
    it('Then it reads the version of relizy, or 0.0.0', () => {
      expect(readOwnVersion()).toBe(JSON.parse(readFileSync(join(ROOT_DIR, 'package.json'), 'utf8')).version)
      expect(readOwnVersion(createTempDir())).toBe('0.0.0')
    })
  })
})
