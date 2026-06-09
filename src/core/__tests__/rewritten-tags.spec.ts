import { createMockConfig } from '../../../tests/mocks'
import { reconcileFromTag, resetRewrittenTagCache } from '../rewritten-tags'

const TO = 'develop'
const ORPHAN_TAG = 'v5.0.0-beta.24'
const TWIN_SHA = 'd7bc57dab80aec5cb6b94b8d7884dd233c2f9248'

vi.mock('../git-refs', async (importActual) => {
  const actual = await importActual<typeof import('../git-refs')>()
  return {
    ...actual,
    tagExists: vi.fn(),
    isAncestor: vi.fn(),
    getCommitSubject: vi.fn(),
    findReachableCommitBySubject: vi.fn(),
    retagAnnotatedLocal: vi.fn(),
    pushTagForce: vi.fn(),
  }
})

vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
  confirm: vi.fn(),
}))

const git = await import('../git-refs')
const prompts = await import('@inquirer/prompts')

function mockGit({
  tagExists = true,
  isAncestor = false,
  subject = 'chore(release): bump version to 5.0.0-beta.24',
  twin = TWIN_SHA,
}: {
  tagExists?: boolean
  isAncestor?: boolean
  subject?: string | null
  twin?: string | null
} = {}) {
  vi.mocked(git.tagExists).mockResolvedValue(tagExists)
  vi.mocked(git.isAncestor).mockResolvedValue(isAncestor)
  vi.mocked(git.getCommitSubject).mockResolvedValue(subject)
  vi.mocked(git.findReachableCommitBySubject).mockResolvedValue(twin)
  vi.mocked(git.retagAnnotatedLocal).mockResolvedValue(undefined)
  vi.mocked(git.pushTagForce).mockResolvedValue(undefined)
}

describe('Given reconcileFromTag', () => {
  beforeEach(() => {
    resetRewrittenTagCache()
    vi.clearAllMocks()
  })

  describe('When the tag is healthy (reachable from `to`)', () => {
    it('Then returns the original tag with no correction', async () => {
      mockGit({ isAncestor: true })
      const config = createMockConfig({ onRewrittenTag: 'ephemeral' })

      const result = await reconcileFromTag({ from: ORPHAN_TAG, to: TO, config })

      expect(result).toBe(ORPHAN_TAG)
      expect(git.findReachableCommitBySubject).not.toHaveBeenCalled()
      expect(git.retagAnnotatedLocal).not.toHaveBeenCalled()
    })
  })

  describe('When detection is disabled', () => {
    it('Then short-circuits and returns the original tag without touching git', async () => {
      mockGit()
      const config = createMockConfig({ detectRewrittenTags: false })

      const result = await reconcileFromTag({ from: ORPHAN_TAG, to: TO, config })

      expect(result).toBe(ORPHAN_TAG)
      expect(git.tagExists).not.toHaveBeenCalled()
      expect(git.isAncestor).not.toHaveBeenCalled()
    })
  })

  describe('When `from` is not a tag (SHA / new-package marker / branch)', () => {
    it('Then returns it unchanged', async () => {
      mockGit({ tagExists: false })
      const config = createMockConfig({ onRewrittenTag: 'ephemeral' })

      const result = await reconcileFromTag({ from: '__NEW_PACKAGE__', to: TO, config })

      expect(result).toBe('__NEW_PACKAGE__')
      expect(git.isAncestor).not.toHaveBeenCalled()
    })
  })

  describe('When the tag is orphaned (non-interactive ephemeral strategy)', () => {
    it('Then returns the reachable equivalent commit and leaves the tag untouched', async () => {
      mockGit({ isAncestor: false, twin: TWIN_SHA })
      const config = createMockConfig({ onRewrittenTag: 'ephemeral' })

      const result = await reconcileFromTag({ from: ORPHAN_TAG, to: TO, config })

      expect(result).toBe(TWIN_SHA)
      expect(git.retagAnnotatedLocal).not.toHaveBeenCalled()
      expect(git.pushTagForce).not.toHaveBeenCalled()
    })

    it('Then falls back to the original tag when no equivalent commit is found', async () => {
      mockGit({ isAncestor: false, twin: null })
      const config = createMockConfig({ onRewrittenTag: 'ephemeral' })

      const result = await reconcileFromTag({ from: ORPHAN_TAG, to: TO, config })

      expect(result).toBe(ORPHAN_TAG)
    })
  })

  describe('When strategy is `rebind`', () => {
    it('Then moves the local tag onto the twin (no push) and returns the tag', async () => {
      mockGit({ isAncestor: false, twin: TWIN_SHA })
      const config = createMockConfig({ onRewrittenTag: 'rebind' })

      const result = await reconcileFromTag({ from: ORPHAN_TAG, to: TO, config })

      expect(result).toBe(ORPHAN_TAG)
      expect(git.retagAnnotatedLocal).toHaveBeenCalledWith(
        expect.objectContaining({ tag: ORPHAN_TAG, commit: TWIN_SHA }),
      )
      expect(git.pushTagForce).not.toHaveBeenCalled()
    })

    it('Then does not mutate the tag in dry-run mode', async () => {
      mockGit({ isAncestor: false, twin: TWIN_SHA })
      const config = createMockConfig({ onRewrittenTag: 'rebind' })

      const result = await reconcileFromTag({ from: ORPHAN_TAG, to: TO, config, dryRun: true })

      expect(result).toBe(ORPHAN_TAG)
      expect(git.retagAnnotatedLocal).not.toHaveBeenCalled()
    })
  })

  describe('When strategy is `error`', () => {
    it('Then throws a descriptive error', async () => {
      mockGit({ isAncestor: false, twin: TWIN_SHA })
      const config = createMockConfig({ onRewrittenTag: 'error' })

      await expect(reconcileFromTag({ from: ORPHAN_TAG, to: TO, config }))
        .rejects
        .toThrow(/rewritten/)
    })
  })

  describe('When called twice for the same `from` tag', () => {
    it('Then resolves once and serves the cached decision', async () => {
      mockGit({ isAncestor: false, twin: TWIN_SHA })
      const config = createMockConfig({ onRewrittenTag: 'ephemeral' })

      const first = await reconcileFromTag({ from: ORPHAN_TAG, to: TO, config })
      const second = await reconcileFromTag({ from: ORPHAN_TAG, to: TO, config })

      expect(first).toBe(TWIN_SHA)
      expect(second).toBe(TWIN_SHA)
      expect(git.isAncestor).toHaveBeenCalledTimes(1)
      expect(git.findReachableCommitBySubject).toHaveBeenCalledTimes(1)
    })
  })

  describe('When strategy resolves to interactive prompt', () => {
    let ttyDescriptor: PropertyDescriptor | undefined
    let exitSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      // Force a TTY so the default strategy resolves to `prompt`.
      ttyDescriptor = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
      exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    })

    afterEach(() => {
      if (ttyDescriptor) {
        Object.defineProperty(process.stdout, 'isTTY', ttyDescriptor)
      }
      exitSpy.mockRestore()
    })

    it('Then "ephemeral" choice returns the equivalent commit without mutating the tag', async () => {
      mockGit({ isAncestor: false, twin: TWIN_SHA })
      vi.mocked(prompts.select).mockResolvedValue('ephemeral')
      const config = createMockConfig({})

      const result = await reconcileFromTag({ from: ORPHAN_TAG, to: TO, config })

      expect(result).toBe(TWIN_SHA)
      expect(git.retagAnnotatedLocal).not.toHaveBeenCalled()
      expect(git.pushTagForce).not.toHaveBeenCalled()
    })

    it('Then "rebind-local" choice moves the tag locally without pushing', async () => {
      mockGit({ isAncestor: false, twin: TWIN_SHA })
      vi.mocked(prompts.select).mockResolvedValue('rebind-local')
      const config = createMockConfig({})

      const result = await reconcileFromTag({ from: ORPHAN_TAG, to: TO, config })

      expect(result).toBe(ORPHAN_TAG)
      expect(git.retagAnnotatedLocal).toHaveBeenCalledTimes(1)
      expect(git.pushTagForce).not.toHaveBeenCalled()
    })

    it('Then "rebind-push" force-pushes only after a second confirmation', async () => {
      mockGit({ isAncestor: false, twin: TWIN_SHA })
      vi.mocked(prompts.select).mockResolvedValue('rebind-push')
      vi.mocked(prompts.confirm).mockResolvedValue(true)
      const config = createMockConfig({})

      const result = await reconcileFromTag({ from: ORPHAN_TAG, to: TO, config })

      expect(result).toBe(ORPHAN_TAG)
      expect(git.retagAnnotatedLocal).toHaveBeenCalledTimes(1)
      expect(git.pushTagForce).toHaveBeenCalledTimes(1)
    })

    it('Then "rebind-push" with a declined confirmation does NOT push', async () => {
      mockGit({ isAncestor: false, twin: TWIN_SHA })
      vi.mocked(prompts.select).mockResolvedValue('rebind-push')
      vi.mocked(prompts.confirm).mockResolvedValue(false)
      const config = createMockConfig({})

      const result = await reconcileFromTag({ from: ORPHAN_TAG, to: TO, config })

      expect(result).toBe(ORPHAN_TAG)
      expect(git.retagAnnotatedLocal).toHaveBeenCalledTimes(1)
      expect(git.pushTagForce).not.toHaveBeenCalled()
    })

    it('Then a cancelled push confirmation falls back to a local re-bind', async () => {
      mockGit({ isAncestor: false, twin: TWIN_SHA })
      vi.mocked(prompts.select).mockResolvedValue('rebind-push')
      vi.mocked(prompts.confirm).mockRejectedValue(new Error('cancelled'))
      const config = createMockConfig({})

      const result = await reconcileFromTag({ from: ORPHAN_TAG, to: TO, config })

      expect(result).toBe(ORPHAN_TAG)
      expect(git.retagAnnotatedLocal).toHaveBeenCalledTimes(1)
      expect(git.pushTagForce).not.toHaveBeenCalled()
    })

    it('Then a prompt choice never mutates in dry-run mode', async () => {
      mockGit({ isAncestor: false, twin: TWIN_SHA })
      vi.mocked(prompts.select).mockResolvedValue('rebind-push')
      vi.mocked(prompts.confirm).mockResolvedValue(true)
      const config = createMockConfig({})

      const result = await reconcileFromTag({ from: ORPHAN_TAG, to: TO, config, dryRun: true })

      expect(result).toBe(ORPHAN_TAG)
      expect(git.retagAnnotatedLocal).not.toHaveBeenCalled()
      expect(git.pushTagForce).not.toHaveBeenCalled()
    })

    it('Then "abort" exits the process', async () => {
      mockGit({ isAncestor: false, twin: TWIN_SHA })
      vi.mocked(prompts.select).mockResolvedValue('abort')
      const config = createMockConfig({})

      await reconcileFromTag({ from: ORPHAN_TAG, to: TO, config })

      expect(exitSpy).toHaveBeenCalledWith(0)
    })

    it('Then "keep" returns the orphaned tag unchanged', async () => {
      mockGit({ isAncestor: false, twin: TWIN_SHA })
      vi.mocked(prompts.select).mockResolvedValue('keep')
      const config = createMockConfig({})

      const result = await reconcileFromTag({ from: ORPHAN_TAG, to: TO, config })

      expect(result).toBe(ORPHAN_TAG)
      expect(git.retagAnnotatedLocal).not.toHaveBeenCalled()
    })

    it('Then a cancelled prompt (Ctrl-C) exits cleanly with code 0', async () => {
      mockGit({ isAncestor: false, twin: TWIN_SHA })
      const exitError = new Error('cancelled')
      exitError.name = 'ExitPromptError'
      vi.mocked(prompts.select).mockRejectedValue(exitError)
      const config = createMockConfig({})

      await reconcileFromTag({ from: ORPHAN_TAG, to: TO, config })

      expect(exitSpy).toHaveBeenCalledWith(0)
    })

    it('Then an unexpected prompt error exits with code 1', async () => {
      mockGit({ isAncestor: false, twin: TWIN_SHA })
      vi.mocked(prompts.select).mockRejectedValue(new Error('boom'))
      const config = createMockConfig({})

      await reconcileFromTag({ from: ORPHAN_TAG, to: TO, config })

      expect(exitSpy).toHaveBeenCalledWith(1)
    })

    it('Then prompts only when twin exists; otherwise offers keep/abort', async () => {
      mockGit({ isAncestor: false, twin: null })
      vi.mocked(prompts.select).mockResolvedValue('keep')
      const config = createMockConfig({})

      const result = await reconcileFromTag({ from: ORPHAN_TAG, to: TO, config })

      expect(result).toBe(ORPHAN_TAG)
    })
  })

  describe('When no TTY is available', () => {
    let ttyDescriptor: PropertyDescriptor | undefined

    beforeEach(() => {
      ttyDescriptor = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')
      Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true })
    })

    afterEach(() => {
      if (ttyDescriptor) {
        Object.defineProperty(process.stdout, 'isTTY', ttyDescriptor)
      }
    })

    it('Then an explicit `prompt` strategy is downgraded to ephemeral', async () => {
      mockGit({ isAncestor: false, twin: TWIN_SHA })
      const config = createMockConfig({ onRewrittenTag: 'prompt' })

      const result = await reconcileFromTag({ from: ORPHAN_TAG, to: TO, config })

      expect(result).toBe(TWIN_SHA)
    })
  })
})
