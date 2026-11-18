import type { SyncConfig } from '../../types'
import type { ResolvedRelizyConfig } from '../config'
import { getSyncTargets } from '../branch-sync'

const MESSAGE = 'chore(release): sync {{target}} with {{source}}'

function getConfig(sync: SyncConfig): ResolvedRelizyConfig {
  return {
    sync: { mode: 'push', message: MESSAGE, ...sync },
  } as ResolvedRelizyConfig
}

const source = (branch: string) => ({ remote: 'origin', branch })

describe('Given getSyncTargets', () => {
  const config = getConfig({
    rules: [
      {
        from: 'main',
        to: ['develop'],
      },
      {
        from: 'release/*',
        to: ['main', 'develop'],
        mode: 'pull-request',
        message: 'chore(release): back-merge {{source}}',
      },
      {
        from: 'hotfix/**',
        to: ['main'],
      },
    ],
  })

  it('Then returns the branches of the rules that match the released branch', () => {
    expect(getSyncTargets(config, source('main'))).toEqual([
      { branch: 'develop', mode: 'push', message: MESSAGE },
    ])
  })

  it('Then returns nothing when no rule matches', () => {
    expect(getSyncTargets(config, source('feat/thing'))).toEqual([])
    expect(getSyncTargets(config, source('develop'))).toEqual([])
  })

  it('Then takes the mode and the message of the rule', () => {
    expect(getSyncTargets(config, source('release/1.x'))).toEqual([
      { branch: 'main', mode: 'pull-request', message: 'chore(release): back-merge {{source}}' },
      { branch: 'develop', mode: 'pull-request', message: 'chore(release): back-merge {{source}}' },
    ])
  })

  it('Then matches one level with *, several with **', () => {
    expect(getSyncTargets(config, source('release/1.x/rc'))).toEqual([])
    expect(getSyncTargets(config, source('hotfix/1.x/login'))).toEqual([
      { branch: 'main', mode: 'push', message: MESSAGE },
    ])
  })

  it('Then keeps the first rule of a branch, and never the released branch itself', () => {
    const overlapping = getConfig({
      rules: [
        {
          from: 'main',
          to: ['main', 'develop'],
        },
        {
          from: 'ma*',
          to: ['develop', 'next'],
          mode: 'pull-request',
        },
      ],
    })

    expect(getSyncTargets(overlapping, source('main'))).toEqual([
      { branch: 'develop', mode: 'push', message: MESSAGE },
      { branch: 'next', mode: 'pull-request', message: MESSAGE },
    ])
  })

  it('Then the branches and the mode of the run win over the rules', () => {
    expect(getSyncTargets(config, source('feat/thing'), {
      branches: ['develop'],
    })).toEqual([
      { branch: 'develop', mode: 'push', message: MESSAGE },
    ])
    expect(getSyncTargets(config, source('release/1.x'), { mode: 'push' }).map(target => target.mode)).toEqual(['push', 'push'])
  })
})
