import process from 'node:process'
import { confirm, isCancel, select, text } from '@clack/prompts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setInteractiveTerminal } from '../../../tests/mocks'
import { RelizyCancelError } from '../errors'
import { askConfirm, askSelect, askText, assertInteractivePrompt } from '../prompts'

const CANCEL = Symbol('clack:cancel')

vi.mock('@clack/prompts', () => ({
  confirm: vi.fn(),
  select: vi.fn(),
  text: vi.fn(),
  isCancel: vi.fn(),
}))

describe('Given the prompts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(isCancel).mockImplementation(value => value === CANCEL)
  })

  describe('When the user answers', () => {
    it('Then askConfirm returns the answer, with the options of the prompt', async () => {
      vi.mocked(confirm).mockResolvedValueOnce(false)

      await expect(askConfirm({
        message: 'Release?',
        initialValue: true,
        active: 'Release',
        inactive: 'Cancel',
      })).resolves.toBe(false)
      expect(confirm).toHaveBeenCalledWith({
        message: 'Release?',
        initialValue: true,
        active: 'Release',
        inactive: 'Cancel',
      })
    })

    it('Then askSelect returns the chosen value', async () => {
      vi.mocked(select).mockResolvedValueOnce('keep')
      const options = [
        { value: 'keep', label: 'Keep' },
        { value: 'abort', label: 'Abort', hint: 'stop the run' },
      ]

      await expect(askSelect({ message: 'What now?', options, initialValue: 'keep' })).resolves.toBe('keep')
      expect(select).toHaveBeenCalledWith({ message: 'What now?', options, initialValue: 'keep' })
    })

    it('Then askText returns the typed text', async () => {
      vi.mocked(text).mockResolvedValueOnce('123456')

      await expect(askText({ message: 'OTP', placeholder: '000000' })).resolves.toBe('123456')
      expect(text).toHaveBeenCalledWith({ message: 'OTP', placeholder: '000000' })
    })
  })

  describe('When the prompt is cancelled (Ctrl+C, Escape)', () => {
    it('Then throws a RelizyCancelError with the cancel message', async () => {
      vi.mocked(confirm).mockResolvedValueOnce(CANCEL as never)
      vi.mocked(select).mockResolvedValueOnce(CANCEL as never)
      vi.mocked(text).mockResolvedValueOnce(CANCEL as never)

      await expect(askConfirm({ message: 'Release?', cancelMessage: 'Bump cancelled' })).rejects.toThrow(new RelizyCancelError('Bump cancelled'))
      await expect(askSelect({
        message: 'What now?',
        options: [
          { value: 'keep', label: 'Keep' },
        ],
        cancelMessage: 'Tag cancelled',
      })).rejects.toThrow(new RelizyCancelError('Tag cancelled'))
      await expect(askText({ message: 'OTP' })).rejects.toThrow(new RelizyCancelError('Cancelled'))
    })
  })

  describe('When the terminal is not interactive (CI, piped input)', () => {
    it('Then asks nothing and fails with what to do, as nobody can answer', () => {
      const restore = setInteractiveTerminal(false)

      expect(() => assertInteractivePrompt({ message: 'Release?', whenNotInteractive: 'run with --yes to confirm it in advance' }))
        .toThrow('"Release?" needs an answer, but the terminal is not interactive: run with --yes to confirm it in advance')

      restore()
    })

    it('Then fails with RELIZY_REPORTER=json even in a terminal: stdout carries the events', () => {
      const restore = setInteractiveTerminal(true)
      process.env.RELIZY_REPORTER = 'json'

      try {
        expect(() => assertInteractivePrompt({ message: 'OTP?', whenNotInteractive: 'pass the one-time password with --otp' }))
          .toThrow('"OTP?" needs an answer, but RELIZY_REPORTER=json keeps stdout for the events: pass the one-time password with --otp')
      }
      finally {
        delete process.env.RELIZY_REPORTER
        restore()
      }
    })

    it('Then lets the prompt run in an interactive terminal', () => {
      const restore = setInteractiveTerminal(true)

      expect(() => assertInteractivePrompt({ message: 'Release?', whenNotInteractive: 'run with --yes' })).not.toThrow()

      restore()
    })
  })
})
