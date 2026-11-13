import { describe, expect, it } from 'vitest'
import * as relizy from '../index'

describe('Given the public API of relizy', () => {
  describe('When the package entry is imported', () => {
    it('Then only exports the commands, the config, the errors and the commit linter', () => {
      expect(Object.keys(relizy).sort()).toEqual([
        'MergePreviewError',
        'RelizyCancelError',
        'UnknownProfileError',
        'bump',
        'changelog',
        'commitlint',
        'defineConfig',
        'getConfigOptions',
        'isRelizyCancelError',
        'lintCommitMessage',
        'listProfiles',
        'loadRelizyConfig',
        'mergePreview',
        'prComment',
        'previewChangelog',
        'previewRelease',
        'providerRelease',
        'publish',
        'release',
        'social',
      ])
    })
  })
})
