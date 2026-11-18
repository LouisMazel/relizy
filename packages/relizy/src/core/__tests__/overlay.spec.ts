import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execPromise } from '@maz-ui/node'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadRelizyConfig } from '../config'
import { chainHooks } from '../hook-chain'
import { executeHook } from '../utils'

describe('Given the hooks of an overlay', () => {
  describe('When chaining the hooks of the config and the ones of the overlay', () => {
    it('Then keeps both when they do not share a step', () => {
      const base = vi.fn()
      const overlay = vi.fn()

      const hooks = chainHooks({ 'before:bump': base }, { 'before:publish': overlay })

      expect(hooks).toEqual({ 'before:bump': base, 'before:publish': overlay })
    })

    it('Then runs the hook of the config, then the one of the overlay, for the same step', async () => {
      const calls: string[] = []
      const hooks = chainHooks(
        {
          'before:bump': () => { calls.push('config') },
        },
        {
          'before:bump': () => { calls.push('overlay') },
        },
      )

      await (hooks!['before:bump'] as (...args: unknown[]) => Promise<unknown>)({ cwd: '.' }, false, undefined)

      expect(calls).toEqual(['config', 'overlay'])
    })

    it('Then gives them the arguments of the hook and returns the result of the last one', async () => {
      const base = vi.fn(() => 'first')
      const overlay = vi.fn(() => 'second')
      const hooks = chainHooks({ 'success:bump': base }, { 'success:bump': overlay })
      const config = { cwd: '.' }

      const result = await (hooks!['success:bump'] as (...args: unknown[]) => Promise<unknown>)(config, true, { release: 1 })

      expect(base).toHaveBeenCalledWith(config, true, { release: 1 })
      expect(overlay).toHaveBeenCalledWith(config, true, { release: 1 })
      expect(result).toBe('second')
    })

    it('Then runs a command of the config before a function of the overlay', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'relizy-hooks-'))
      const calls: string[] = []

      try {
        const hooks = chainHooks(
          { 'before:bump': 'touch marker.txt' },
          {
            'before:bump': () => {
              calls.push('overlay')
            },
          },
        )

        await executeHook('before:bump', { cwd: dir, hooks, logLevel: 'silent' } as any, false)

        expect(calls).toEqual(['overlay'])
        expect(execPromise).toHaveBeenCalledWith('touch marker.txt', expect.objectContaining({ cwd: dir }))
      }
      finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })

    it('Then lets the overlay replace generate:changelog, which returns the changelog', () => {
      const base = vi.fn()
      const overlay = vi.fn()

      expect(chainHooks({ 'generate:changelog': base }, { 'generate:changelog': overlay })).toEqual({ 'generate:changelog': overlay })
    })

    it('Then gives the other one when one side has no hooks', () => {
      const base = {
        'before:bump': vi.fn(),
      }

      expect(chainHooks(base, undefined)).toBe(base)
      expect(chainHooks(undefined, base)).toBe(base)
      expect(chainHooks(undefined, undefined)).toBeUndefined()
    })
  })
})

describe('Given a config file and an overlay of overrides', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'relizy-overlay-'))
    writeFileSync(join(dir, 'relizy.config.json'), JSON.stringify({
      bump: { preid: 'file', yes: true },
      hooks: { 'before:bump': 'echo file' },
      profiles: {
        beta: {
          bump: { preid: 'beta' },
        },
      },
    }))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  describe('When loading the config with hooks in the overrides', () => {
    it('Then adds them to the hooks of the file instead of replacing them', async () => {
      const overlay = vi.fn()

      const config = await loadRelizyConfig({
        overrides: {
          cwd: dir,
          bump: { preid: 'overlay' },
          hooks: { 'before:bump': overlay, 'success:bump': overlay },
        },
      })

      expect(config.bump).toMatchObject({ preid: 'overlay', yes: true })
      expect(config.hooks?.['success:bump']).toBe(overlay)
      expect(typeof config.hooks?.['before:bump']).toBe('function')
      expect(config.hooks?.['before:bump']).not.toBe(overlay)
    })

    it('Then keeps the precedence of the profile under the overrides', async () => {
      const config = await loadRelizyConfig({
        profile: 'beta',
        overrides: {
          cwd: dir,
          hooks: {
            'success:bump': vi.fn(),
          },
        },
      })

      expect(config.bump.preid).toBe('beta')
      expect(config.hooks?.['before:bump']).toBe('echo file')
    })
  })

  describe('When a resolved config gets hooks in the overrides', () => {
    it('Then adds them to its hooks', async () => {
      const base = await loadRelizyConfig({
        overrides: { cwd: dir },
      })
      const overlay = vi.fn()

      const config = await loadRelizyConfig({
        baseConfig: base,
        overrides: {
          hooks: { 'before:bump': overlay },
        },
      })

      expect(typeof config.hooks?.['before:bump']).toBe('function')
      expect(base.hooks?.['before:bump']).toBe('echo file')
    })
  })
})
