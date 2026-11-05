import { logger } from '@maz-ui/node'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isAIPreviewEnabled,
  recordAICost,
  recordAIRewrite,
  recordLink,
  reportProgress,
  reportStepNote,
  setDryRunOptions,
  setProgressHandlers,
  showPreview,
  takeAICost,
  takeReleaseFacts,
} from '../progress'

describe('Given the progress of a step', () => {
  const handlers = { progress: vi.fn(), note: vi.fn(), preview: vi.fn() }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    setProgressHandlers(undefined)
    setDryRunOptions({ preview: true, ai: false })
  })

  describe('When no output handles it', () => {
    it('Then the progress and the notes do nothing, the previews go to the logger', () => {
      const box = vi.spyOn(logger, 'box').mockImplementation(() => undefined)

      reportProgress('Publishing')
      reportStepNote('Done')
      showPreview({ title: 'Twitter post', meta: ['Length: 10/280 chars'], content: 'Hello' })

      expect(box).toHaveBeenCalledWith('[dry-run] Twitter post\n\nLength: 10/280 chars\n\nHello')
    })
  })

  describe('When the output handles it', () => {
    it('Then gives it the progress, the notes and the previews', () => {
      setProgressHandlers(handlers)
      const preview = { title: 'GitHub release v2.0.0', content: 'notes' }

      reportProgress('Rewriting', { ai: true })
      reportStepNote('Rewritten')
      showPreview(preview)

      expect(handlers.progress).toHaveBeenCalledWith('Rewriting', { ai: true })
      expect(handlers.note).toHaveBeenCalledWith('Rewritten', {})
      expect(handlers.preview).toHaveBeenCalledWith(preview)
    })
  })

  describe('When the previews are hidden (--no-preview)', () => {
    it('Then a preview is only a verbose log', () => {
      setProgressHandlers(handlers)
      setDryRunOptions({ preview: false })
      const verbose = vi.spyOn(logger, 'verbose').mockImplementation(() => undefined)

      showPreview({ title: 'PR comment', content: 'body' })

      expect(handlers.preview).not.toHaveBeenCalled()
      expect(verbose).toHaveBeenCalledWith('[dry-run] PR comment\n\nbody')
    })
  })

  describe('When calling the AI in dry-run (--ai-preview)', () => {
    it('Then tells it', () => {
      expect(isAIPreviewEnabled()).toBe(false)

      setDryRunOptions({ ai: true })

      expect(isAIPreviewEnabled()).toBe(true)
    })
  })
})

describe('Given the facts of a release', () => {
  beforeEach(() => {
    takeReleaseFacts()
    takeAICost()
  })

  it('Then gives the links and the AI rewrites recorded since the last call', () => {
    recordLink({ step: 'social', label: 'Tweet', url: 'https://x.com/i/web/status/1' })
    recordAIRewrite({ subject: 'the notes of v2.0.0', provider: 'claude-code', simulated: true })

    expect(takeReleaseFacts()).toEqual({
      links: [{ step: 'social', label: 'Tweet', url: 'https://x.com/i/web/status/1' }],
      aiRewrites: [{ subject: 'the notes of v2.0.0', provider: 'claude-code', simulated: true }],
    })
    expect(takeReleaseFacts()).toEqual({ links: [], aiRewrites: [] })
  })

  it('Then gives the cost of the last AI call once', () => {
    recordAICost(0.02)

    expect(takeAICost()).toBeCloseTo(0.02)
    expect(takeAICost()).toBeUndefined()
  })
})
