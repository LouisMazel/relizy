import type { LogObject } from '../log-capture'
import { logger } from '@maz-ui/node'
import { keepLogLevel, setLogReporters, withLogCapture } from '../log-capture'

vi.mock('@maz-ui/node', importActual => importActual())

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

describe('Given the logs of relizy', () => {
  let printed: LogObject[]
  let restore: () => void

  beforeEach(() => {
    logger.setLevel('default')
    printed = []
    restore = setLogReporters([
      {
        log: logObj => printed.push(logObj),
      },
    ])
  })

  afterEach(() => {
    restore()
  })

  describe('When two calls capture their logs at the same time', () => {
    it('Then each one gets only its own logs, and none is printed', async () => {
      const capture = (name: string, delay: number) => {
        const logs: string[] = []

        return withLogCapture(({ type, message }) => logs.push(`${type} ${message}`), async () => {
          logger.warn(`${name} starts`)
          await sleep(delay)
          logger.info(`${name}`, 'ends')

          return logs
        })
      }

      const [first, second] = await Promise.all([
        capture('first', 15),
        capture('second', 1),
      ])

      expect(first).toEqual(['warn first starts', 'info first ends'])
      expect(second).toEqual(['warn second starts', 'info second ends'])
      expect(printed).toEqual([])
    })
  })

  describe('When a capture runs inside another one', () => {
    it('Then both get the logs of the inner one', async () => {
      const outer: string[] = []
      const inner: string[] = []

      await withLogCapture(({ message }) => outer.push(message), () => withLogCapture(({ message }) => inner.push(message), () => {
        logger.warn('inside')
      }))

      expect(inner).toEqual(['inside'])
      expect(outer).toEqual(['inside'])
    })
  })

  describe('When nothing captures', () => {
    it('Then the logs go to the reporters of the process, the previous ones once restored', () => {
      const other: LogObject[] = []
      const restoreOther = setLogReporters([
        {
          log: logObj => other.push(logObj),
        },
      ])

      logger.warn('to the other')
      restoreOther()
      logger.warn('to the first')

      expect(other.map(({ args }) => args[0])).toEqual(['to the other'])
      expect(printed.map(({ args }) => args[0])).toEqual(['to the first'])
    })
  })

  describe('When a call changes the level of the logger', () => {
    it('Then the level of before is back once the last call running at the same time ends', async () => {
      logger.setLevel('error')

      const long = keepLogLevel(async () => {
        logger.setLevel('default')
        await sleep(15)

        return logger.getLevel()
      })
      await keepLogLevel(() => {
        logger.setLevel('default')
        return Promise.resolve()
      })

      // The long call still runs with its level
      expect(logger.getLevel()).toBe(3)
      expect(await long).toBe(3)
      expect(logger.getLevel()).toBe(0)
    })

    it('Then the level is back when the call fails', async () => {
      logger.setLevel('warning')

      await expect(keepLogLevel(() => {
        logger.setLevel('silent')
        return Promise.reject(new Error('boom'))
      })).rejects.toThrow('boom')

      expect(logger.getLevel()).toBe(1)
    })
  })
})
