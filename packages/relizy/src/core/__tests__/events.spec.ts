import type { RelizyEvent } from '../events'
import process from 'node:process'
import { describe, expect, it, vi } from 'vitest'
import { addGlobalEventListener, emitEvent, getAppHandlers, getEventContext, getRunState, hasEventListeners, runWithEvents } from '../events'

describe('Given the events of a command', () => {
  describe('When a command runs with a listener', () => {
    it('Then the listener gets the events with their time', async () => {
      const events: RelizyEvent[] = []

      await runWithEvents(event => events.push(event), async () => {
        await Promise.resolve()
        emitEvent({ type: 'progress', message: 'Computing', ai: false })
      })

      expect(events).toEqual([
        {
          type: 'progress',
          message: 'Computing',
          ai: false,
          time: expect.any(Number),
        },
      ])
    })

    it('Then a command run by it shares the listener and is nested', () => {
      const listener = vi.fn()
      const nested: boolean[] = []

      runWithEvents(listener, () => {
        nested.push(getEventContext()!.nested)
        runWithEvents(undefined, () => {
          nested.push(getEventContext()!.nested)
          emitEvent({ type: 'note', message: 'inner', ai: false })
        })
      })

      expect(nested).toEqual([false, true])
      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('Then a listener that throws does not stop the run nor the other listeners', () => {
      const other = vi.fn()

      runWithEvents(() => {
        throw new Error('listener failure')
      }, () => runWithEvents(other, () => {
        emitEvent({ type: 'note', message: 'x', ai: true })
      }))

      expect(other).toHaveBeenCalledWith(expect.objectContaining({ type: 'note', ai: true }))
    })

    it('Then an async listener that rejects never gives an unhandled rejection', async () => {
      const unhandled = vi.fn()
      process.on('unhandledRejection', unhandled)
      const other = vi.fn()

      try {
        runWithEvents(async () => {
          await Promise.resolve()
          throw new Error('async listener failure')
        }, () => runWithEvents(other, () => {
          emitEvent({ type: 'note', message: 'x', ai: false })
        }))
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      finally {
        process.off('unhandledRejection', unhandled)
      }

      expect(unhandled).not.toHaveBeenCalled()
      expect(other).toHaveBeenCalledTimes(1)
    })

    it('Then each run has its own state, shared with the commands it runs', async () => {
      const key = Symbol('test')
      const run = (name: string, delay: number) => runWithEvents(undefined, async () => {
        getRunState(key, () => [] as string[]).push(name)
        await new Promise(resolve => setTimeout(resolve, delay))
        runWithEvents(undefined, () => getRunState(key, () => [] as string[]).push(`${name} nested`))

        return getRunState(key, () => [] as string[])
      })

      expect(await Promise.all([
        run('a', 10),
        run('b', 1),
      ])).toEqual([
        ['a', 'a nested'],
        ['b', 'b nested'],
      ])
    })

    it('Then the events of another run are not received', async () => {
      const first = vi.fn()
      const second = vi.fn()

      await Promise.all([
        runWithEvents(first, async () => {
          await new Promise(resolve => setTimeout(resolve, 5))
          emitEvent({ type: 'note', message: 'first', ai: false })
        }),
        runWithEvents(second, () => {
          emitEvent({ type: 'note', message: 'second', ai: false })
          return Promise.resolve()
        }),
      ])

      expect(first).toHaveBeenCalledTimes(1)
      expect(first).toHaveBeenCalledWith(expect.objectContaining({ message: 'first' }))
      expect(second).toHaveBeenCalledTimes(1)
    })
  })

  describe('When a global listener is added', () => {
    it('Then it gets the events of every run until it is removed', () => {
      const listener = vi.fn()
      const stop = addGlobalEventListener(listener)

      expect(hasEventListeners()).toBe(true)
      emitEvent({ type: 'note', message: 'global', ai: false })
      stop()
      emitEvent({ type: 'note', message: 'later', ai: false })

      expect(listener).toHaveBeenCalledTimes(1)
      expect(hasEventListeners()).toBe(false)
    })
  })

  describe('When an application gives its handlers', () => {
    it('Then the commands run by the command get them, over the ones of the parent, and keep the first command', () => {
      const onConfirm = vi.fn()
      const onOtp = vi.fn()
      const otherOtp = vi.fn()
      const seen: ReturnType<typeof getAppHandlers>[] = []

      runWithEvents(undefined, () => {
        seen.push(getAppHandlers())
        runWithEvents(undefined, () => {
          seen.push(getAppHandlers())
        }, { onOtp: otherOtp, command: 'bump' })
      }, { onConfirm, onOtp, command: 'release' })

      expect(seen).toEqual([
        { onConfirm, onOtp, command: 'release' },
        { onConfirm, onOtp: otherOtp, command: 'release' },
      ])
    })

    it('Then there is none out of a command', () => {
      expect(getAppHandlers()).toEqual({})
    })
  })

  describe('When nobody listens', () => {
    it('Then emitting does nothing', () => {
      expect(() => emitEvent({ type: 'note', message: 'x', ai: false })).not.toThrow()
    })
  })
})
