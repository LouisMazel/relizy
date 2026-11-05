import { confirm, isCancel, select, text } from '@clack/prompts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RelizyCancelError } from '../errors'
import { askConfirm, askSelect, askText } from '../prompts'

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

      await expect(askConfirm({ message: 'Release?', initialValue: true, active: 'Release', inactive: 'Cancel' })).resolves.toBe(false)
      expect(confirm).toHaveBeenCalledWith({ message: 'Release?', initialValue: true, active: 'Release', inactive: 'Cancel' })
    })

    it('Then askSelect returns the chosen value', async () => {
      vi.mocked(select).mockResolvedValueOnce('keep')
      const options = [{ value: 'keep', label: 'Keep' }, { value: 'abort', label: 'Abort', hint: 'stop the run' }]

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
      await expect(askSelect({ message: 'What now?', options: [{ value: 'keep', label: 'Keep' }], cancelMessage: 'Tag cancelled' })).rejects.toThrow(new RelizyCancelError('Tag cancelled'))
      await expect(askText({ message: 'OTP' })).rejects.toThrow(new RelizyCancelError('Cancelled'))
    })
  })
})
