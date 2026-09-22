import { describe, expect, it } from 'vitest'
import { collectPackageBumps } from '../packages'

describe('Given collectPackageBumps function', () => {
  describe('When bumpedPackages has transitions', () => {
    it('Then returns entries with hasTransition=true and both versions set', () => {
      const entries = collectPackageBumps({
        bumpedPackages: [
          { name: '@acme/a', version: '1.0.0', oldVersion: '1.0.0', newVersion: '1.1.0' } as any,
          { name: '@acme/b', version: '2.0.0', oldVersion: '2.0.0', newVersion: '2.1.0' } as any,
        ],
      })

      expect(entries).toEqual([
        { name: '@acme/a', oldVersion: '1.0.0', newVersion: '1.1.0', version: '1.1.0', hasTransition: true },
        { name: '@acme/b', oldVersion: '2.0.0', newVersion: '2.1.0', version: '2.1.0', hasTransition: true },
      ])
    })
  })

  describe('When a bumped package has no newVersion or same newVersion', () => {
    it('Then hasTransition is false and falls back to version', () => {
      const entries = collectPackageBumps({
        bumpedPackages: [
          { name: '@acme/a', version: '1.0.0', oldVersion: '1.0.0' } as any,
          { name: '@acme/b', version: '2.0.0', oldVersion: '2.0.0', newVersion: '2.0.0' } as any,
        ],
      })

      expect(entries[0]).toEqual({
        name: '@acme/a',
        oldVersion: '1.0.0',
        newVersion: undefined,
        version: '1.0.0',
        hasTransition: false,
      })
      expect(entries[1].hasTransition).toBe(false)
      expect(entries[1].version).toBe('2.0.0')
    })
  })

  describe('When a bumped package graduates from prerelease to stable', () => {
    it('Then oldVersion is derived from the last stable fromTag, not the package.json beta', () => {
      const entries = collectPackageBumps({
        bumpedPackages: [
          {
            name: '@acme/a',
            version: '6.16.0-beta.5',
            oldVersion: '6.16.0-beta.5',
            newVersion: '6.16.0',
            fromTag: 'v6.15.0',
          } as any,
        ],
      })

      expect(entries[0]).toEqual({
        name: '@acme/a',
        oldVersion: '6.15.0',
        newVersion: '6.16.0',
        version: '6.16.0',
        hasTransition: true,
      })
    })

    it('Then it supports independent-mode fromTags (name@version)', () => {
      const entries = collectPackageBumps({
        bumpedPackages: [
          {
            name: '@acme/a',
            version: '6.16.0-beta.5',
            oldVersion: '6.16.0-beta.5',
            newVersion: '6.16.0',
            fromTag: '@acme/a@6.15.0',
          } as any,
        ],
      })

      expect(entries[0].oldVersion).toBe('6.15.0')
    })
  })

  describe('When a bumped package goes from prerelease to prerelease', () => {
    it('Then oldVersion reflects the previous prerelease tag', () => {
      const entries = collectPackageBumps({
        bumpedPackages: [
          {
            name: '@acme/a',
            version: '6.16.0-beta.3',
            oldVersion: '6.16.0-beta.3',
            newVersion: '6.16.0-beta.4',
            fromTag: 'v6.16.0-beta.3',
          } as any,
        ],
      })

      expect(entries[0].oldVersion).toBe('6.16.0-beta.3')
      expect(entries[0].hasTransition).toBe(true)
    })
  })

  describe('When fromTag is not a version tag', () => {
    it('Then falls back to oldVersion for a new-package marker', () => {
      const entries = collectPackageBumps({
        bumpedPackages: [
          {
            name: '@acme/a',
            version: '1.0.0',
            oldVersion: '1.0.0',
            newVersion: '1.0.0',
            fromTag: '__NEW_PACKAGE__',
          } as any,
        ],
      })

      expect(entries[0].oldVersion).toBe('1.0.0')
    })

    it('Then falls back to oldVersion for a commit SHA', () => {
      const entries = collectPackageBumps({
        bumpedPackages: [
          {
            name: '@acme/a',
            version: '1.0.0',
            oldVersion: '1.0.0',
            newVersion: '1.1.0',
            fromTag: 'a1b2c3d',
          } as any,
        ],
      })

      expect(entries[0].oldVersion).toBe('1.0.0')
      expect(entries[0].hasTransition).toBe(true)
    })
  })

  describe('When only standalone packages are provided', () => {
    it('Then returns entries with hasTransition=false', () => {
      const entries = collectPackageBumps({
        packages: [
          { name: '@acme/solo', version: '3.0.0' },
        ],
      })

      expect(entries).toEqual([
        { name: '@acme/solo', version: '3.0.0', hasTransition: false },
      ])
    })
  })

  describe('When bumpedPackages is non-empty', () => {
    it('Then ignores standalone packages fallback', () => {
      const entries = collectPackageBumps({
        bumpedPackages: [
          { name: '@acme/a', version: '1.0.0', oldVersion: '1.0.0', newVersion: '1.1.0' } as any,
        ],
        packages: [
          { name: '@acme/ignored', version: '9.9.9' },
        ],
      })

      expect(entries).toHaveLength(1)
      expect(entries[0].name).toBe('@acme/a')
    })
  })

  describe('When neither source has entries', () => {
    it('Then returns empty array', () => {
      expect(collectPackageBumps({})).toEqual([])
      expect(collectPackageBumps({ bumpedPackages: [] })).toEqual([])
      expect(collectPackageBumps({ packages: [] })).toEqual([])
    })
  })
})
