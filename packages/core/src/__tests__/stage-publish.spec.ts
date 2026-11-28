import { isOtpError } from '../publish'
import {
  InteractiveAuthRequiredError,
  isStageRequiredError,
  isVersionAlreadyStagedError,
  parseStageOutput,
  resolveStaged,
  StageRequiredError,
  StagingUnavailableError,
  TrustedPublisherError,
  VersionAlreadyStagedError,
} from '../stage-publish'

const ID = '2f1c7b8e-1d2a-4c5b-9e8f-0a1b2c3d4e5f'

describe('Given resolveStaged function', () => {
  it('Then never stages without the setting', () => {
    expect(resolveStaged({ staged: false, tag: 'latest', packageName: 'pkg' })).toBe(false)
    expect(resolveStaged({ staged: undefined, tag: 'latest', packageName: 'pkg' })).toBe(false)
  })

  it('Then stages every version with true, except canaries unless asked for this run', () => {
    expect(resolveStaged({ staged: true, tag: 'next', packageName: 'pkg' })).toBe(true)
    expect(resolveStaged({
      staged: true,
      tag: 'canary',
      packageName: 'pkg',
      canary: true,
    })).toBe(false)
    expect(resolveStaged({
      staged: true,
      tag: 'canary',
      packageName: 'pkg',
      canary: true,
      explicit: true,
    })).toBe(true)
  })

  it('Then stages the versions whose tag is listed', () => {
    const staged = {
      tags: ['latest'],
    }
    expect(resolveStaged({ staged, tag: 'latest', packageName: 'pkg' })).toBe(true)
    expect(resolveStaged({ staged, tag: 'next', packageName: 'pkg' })).toBe(false)
  })

  it('Then stages the packages matching the names or globs', () => {
    const staged = {
      packages: ['@scope/core', '@scope/plugin-*'],
    }
    expect(resolveStaged({ staged, tag: 'latest', packageName: '@scope/core' })).toBe(true)
    expect(resolveStaged({ staged, tag: 'next', packageName: '@scope/plugin-vue' })).toBe(true)
    expect(resolveStaged({ staged, tag: 'latest', packageName: '@scope/cli' })).toBe(false)
  })

  it('Then needs every filter given to match', () => {
    const staged = {
      tags: ['latest'],
      packages: ['@scope/*'],
    }
    expect(resolveStaged({ staged, tag: 'latest', packageName: '@scope/core' })).toBe(true)
    expect(resolveStaged({ staged, tag: 'next', packageName: '@scope/core' })).toBe(false)
    expect(resolveStaged({ staged, tag: 'latest', packageName: 'other' })).toBe(false)
  })

  it('Then stages a canary only when its tag is listed or when asked for this run', () => {
    expect(resolveStaged({
      staged: {
        tags: ['canary'],
      },
      tag: 'canary',
      packageName: 'pkg',
      canary: true,
    })).toBe(true)
    expect(resolveStaged({
      staged: {
        packages: ['pkg'],
      },
      tag: 'canary',
      packageName: 'pkg',
      canary: true,
    })).toBe(false)
    expect(resolveStaged({
      staged: {
        packages: ['pkg'],
      },
      tag: 'canary',
      packageName: 'pkg',
      canary: true,
      explicit: true,
    })).toBe(true)
  })
})

describe('Given parseStageOutput function', () => {
  it('Then reads the stageId of the npm JSON, under the package name', () => {
    expect(parseStageOutput(JSON.stringify({
      '@scope/pkg': { name: '@scope/pkg', version: '1.0.0', stageId: ID },
    }))).toEqual({ stageId: ID })
  })

  it('Then reads a stageId at the top level, after other output lines', () => {
    expect(parseStageOutput(`npm notice Publishing to https://registry.npmjs.org/\n${JSON.stringify({ stageId: ID })}\n`)).toEqual({ stageId: ID })
  })

  it('Then reads the id of the npm and pnpm text line', () => {
    expect(parseStageOutput(`+ pkg@1.0.0 (staged with id ${ID})`)).toEqual({ stageId: ID })
  })

  it('Then gives no id when there is none or it is not a UUID', () => {
    expect(parseStageOutput('+ pkg@1.0.0 (staged)')).toEqual({})
    expect(parseStageOutput(JSON.stringify({
      pkg: { stageId: 'not-a-uuid' },
    }))).toEqual({})
    expect(parseStageOutput('{ broken')).toEqual({})
    expect(parseStageOutput('')).toEqual({})
  })
})

describe('Given the errors of a staged publish', () => {
  it('Then recognizes a direct publish refused because the version must be staged, which is also an OTP-looking error', () => {
    const error = Object.assign(new Error('npm error 403 Forbidden - PUT https://registry.npmjs.org/pkg - E_STAGE_REQUIRED: this token can only stage, 2fa'), { code: 'E403' })
    expect(isStageRequiredError(error)).toBe(true)
    expect(isOtpError(error)).toBe(true)
    expect(isStageRequiredError({ code: 'E_STAGE_REQUIRED' })).toBe(true)
    expect(isStageRequiredError(new Error('E403'))).toBe(false)
    expect(isStageRequiredError('E_STAGE_REQUIRED')).toBe(false)
  })

  it('Then recognizes a version already staged', () => {
    expect(isVersionAlreadyStagedError(new Error('npm error code E409\nnpm error 409 Conflict - Cannot publish over previously staged version'))).toBe(true)
    expect(isVersionAlreadyStagedError({ stderr: 'Cannot publish over previously staged version 1.0.0' })).toBe(true)
    // The answer of npm to a second stage of a version, observed on npmjs
    expect(isVersionAlreadyStagedError(new Error('npm error code E409\nnpm error 409 Conflict - POST https://registry.npmjs.org/-/stage/package/test-ripple-deno - Cannot stage previously published version "0.2.2-probe.0".'))).toBe(true)
    expect(isVersionAlreadyStagedError(new Error('E409 Conflict'))).toBe(false)
    expect(isVersionAlreadyStagedError(null)).toBe(false)
  })

  it('Then gives each typed error its stable code and its details', () => {
    const cause = new Error('E_STAGE_REQUIRED')
    const stageRequired = new StageRequiredError({
      packageName: 'pkg',
      tag: 'latest',
      message: 'stage it',
      cause,
    })
    expect(stageRequired).toBeInstanceOf(Error)
    expect(stageRequired).toMatchObject({
      code: 'E_STAGE_REQUIRED',
      name: 'StageRequiredError',
      packageName: 'pkg',
      tag: 'latest',
      message: 'stage it',
      cause,
    })
    expect(new VersionAlreadyStagedError({ packageName: 'pkg', version: '1.0.0', message: 'm' })).toMatchObject({ code: 'E_ALREADY_STAGED', version: '1.0.0' })
    expect(new StagingUnavailableError('npm too old')).toMatchObject({ code: 'E_STAGING_UNAVAILABLE', message: 'npm too old' })
    expect(new InteractiveAuthRequiredError('not in CI')).toMatchObject({ code: 'E_INTERACTIVE_AUTH' })
    expect(new TrustedPublisherError('refused', { status: 409 })).toMatchObject({ code: 'E_TRUST', status: 409 })
    expect(new TrustedPublisherError('refused').status).toBeUndefined()
  })
})
