import { logger } from '@maz-ui/node'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  describeAIUsage,
  isAIPreviewEnabled,
  recordAIRewrite,
  recordLink,
  reportProgress,
  reportStepNote,
  setDryRunOptions,
  setProgressHandlers,
  showPreview,
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

  it('Then describes the tokens and the cost of the AI calls, when known', () => {
    expect(describeAIUsage({ inputTokens: 10_200, outputTokens: 2_200, costUsd: 0.0421 })).toEqual(['12.4k tokens', '$0.042'])
    expect(describeAIUsage({ inputTokens: 800, outputTokens: 50 })).toEqual(['850 tokens'])
    expect(describeAIUsage({ inputTokens: 1_000_000, outputTokens: 0 })).toEqual(['1M tokens'])
    expect(describeAIUsage({ costUsd: 0.003 })).toEqual(['$0.003'])
    expect(describeAIUsage({})).toEqual([])
  })
})
