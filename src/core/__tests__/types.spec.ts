import type { LogLevel } from '@maz-ui/node'
import type { ReleaseType } from 'semver'
import type { BumpReleaseType, RelizyLogLevel } from '../../types'

describe('Given the types relizy declares for the types of its dependencies', () => {
  it('Then they stay the same as the types of the dependencies', () => {
    expectTypeOf<BumpReleaseType>().toEqualTypeOf<ReleaseType>()
    expectTypeOf<RelizyLogLevel>().toEqualTypeOf<LogLevel>()
  })
})
