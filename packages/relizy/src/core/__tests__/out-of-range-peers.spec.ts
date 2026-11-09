import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMockConfig } from '../../../tests/mocks'
import { readWorkspacePackages } from '../workspace'

describe('Given readWorkspacePackages function without monorepo', () => {
  let cwd: string

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'relizy-standalone-'))
    mkdirSync(join(cwd, 'src'))
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'standalone', version: '1.0.0' }))
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  it('Then only reads the root package', () => {
    const config = createMockConfig({
      bump: { type: 'release' },
    })
    config.cwd = cwd
    delete (config as Partial<typeof config>).monorepo

    expect([
      ...readWorkspacePackages(config).keys(),
    ]).toEqual(['standalone'])
  })
})
