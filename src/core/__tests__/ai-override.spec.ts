import { describe, expect, it } from 'vitest'
import { createMockConfig } from '../../../tests/mocks'
import { applyAIOverride, isAIRewritingVersion, isAIRunInRelease } from '../ai'

describe('Given applyAIOverride function', () => {
  describe('When ai is undefined', () => {
    it('Then config remains unchanged', () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
      })
      const originalAI = config.ai

      applyAIOverride(config, undefined)

      expect(config.ai).toBe(originalAI)
    })

    it('Then existing AI config is preserved', () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        ai: {
          providerRelease: { enabled: true },
          social: {
            twitter: { enabled: true },
          },
        },
      })

      applyAIOverride(config, undefined)

      expect(config.ai?.providerRelease).toEqual({ enabled: true })
      expect(config.ai?.social).toEqual({
        twitter: { enabled: true },
      })
    })
  })

  describe('When ai is true', () => {
    it('Then force-enables AI on all targets', () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
      })

      applyAIOverride(config, true)

      expect(config.ai?.providerRelease).toEqual({ enabled: true })
      expect(config.ai?.social).toEqual({
        twitter: { enabled: true },
        slack: { enabled: true },
        teams: { enabled: true },
      })
    })

    it('Then overrides existing disabled config', () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        ai: {
          providerRelease: { enabled: false },
          social: {
            twitter: { enabled: false },
            slack: { enabled: false },
          },
        },
      })

      applyAIOverride(config, true)

      expect(config.ai?.providerRelease).toEqual({ enabled: true })
      expect(config.ai?.social).toEqual({
        twitter: { enabled: true },
        slack: { enabled: true },
        teams: { enabled: true },
      })
    })

    it('Then creates ai config when absent', () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
      })
      ;(config as any).ai = undefined

      applyAIOverride(config, true)

      expect(config.ai).toBeDefined()
      expect(config.ai?.providerRelease).toEqual({ enabled: true })
      expect(config.ai?.social).toEqual({
        twitter: { enabled: true },
        slack: { enabled: true },
        teams: { enabled: true },
      })
    })

    it('Then preserves other AI config fields', () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        ai: { provider: 'claude-code', language: 'fr', fallback: 'fail' },
      })

      applyAIOverride(config, true)

      expect(config.ai?.provider).toBe('claude-code')
      expect(config.ai?.language).toBe('fr')
      expect(config.ai?.fallback).toBe('fail')
      expect(config.ai?.providerRelease).toEqual({ enabled: true })
    })
  })

  describe('When ai is false', () => {
    it('Then force-disables AI on all targets', () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        ai: {
          providerRelease: { enabled: true },
          social: {
            twitter: { enabled: true },
            slack: { enabled: true },
          },
        },
      })

      applyAIOverride(config, false)

      expect(config.ai?.providerRelease).toEqual({ enabled: false })
      expect(config.ai?.social).toEqual({
        twitter: { enabled: false },
        slack: { enabled: false },
        teams: { enabled: false },
      })
    })

    it('Then creates ai config when absent', () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
      })
      ;(config as any).ai = undefined

      applyAIOverride(config, false)

      expect(config.ai).toBeDefined()
      expect(config.ai?.providerRelease).toEqual({ enabled: false })
      expect(config.ai?.social).toEqual({
        twitter: { enabled: false },
        slack: { enabled: false },
        teams: { enabled: false },
      })
    })
  })
})

describe('Given isAIRewritingVersion function', () => {
  it('Then leaves the prereleases raw by default, the stable versions rewritten', () => {
    const config = createMockConfig({
      bump: { type: 'patch' },
    })

    expect(isAIRewritingVersion(config, 'providerRelease', '2.0.0')).toBe(true)
    expect(isAIRewritingVersion(config, 'slack', '2.0.0-beta.0')).toBe(false)
  })

  it('Then lets the onlyStable of a target override ai.onlyStable', () => {
    const config = createMockConfig({
      bump: { type: 'patch' },
      ai: {
        onlyStable: false,
        providerRelease: { enabled: true },
        social: {
          twitter: { enabled: true, onlyStable: true },
        },
      },
    })

    expect(isAIRewritingVersion(config, 'providerRelease', '2.0.0-beta.0')).toBe(true)
    expect(isAIRewritingVersion(config, 'twitter', '2.0.0-beta.0')).toBe(false)
  })

  it('Then keeps the onlyStable of the targets with --ai', () => {
    const config = createMockConfig({
      bump: { type: 'patch' },
      ai: {
        providerRelease: { enabled: false, onlyStable: false },
      },
    })

    applyAIOverride(config, true)

    expect(config.ai?.providerRelease).toEqual({ enabled: true, onlyStable: false })
  })
})

describe('Given isAIRunInRelease function', () => {
  it('Then never runs the AI of a prerelease bump with onlyStable', () => {
    expect(isAIRunInRelease(createMockConfig({
      bump: { type: 'prerelease' },
    }), 'providerRelease')).toBe(false)
    expect(isAIRunInRelease(createMockConfig({
      bump: { type: 'premajor' },
    }), 'slack')).toBe(false)
  })

  it('Then may run it for any other bump, or without onlyStable', () => {
    // A stable bump, or an automatic one, can release a stable version
    expect(isAIRunInRelease(createMockConfig({
      bump: { type: 'release' },
    }), 'providerRelease')).toBe(true)
    expect(isAIRunInRelease(createMockConfig({
      bump: { type: 'prerelease' },
      ai: {
        social: {
          twitter: { onlyStable: false },
        },
      },
    }), 'twitter')).toBe(true)
  })
})
