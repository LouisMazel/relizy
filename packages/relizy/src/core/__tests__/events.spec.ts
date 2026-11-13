import type { RelizyEvent } from '../events'
import { describe, expect, it, vi } from 'vitest'
import { addGlobalEventListener, emitEvent, getEventContext, hasEventListeners, runWithEvents } from '../events'

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

  describe('When nobody listens', () => {
    it('Then emitting does nothing', () => {
      expect(() => emitEvent({ type: 'note', message: 'x', ai: false })).not.toThrow()
    })
  })
})
