import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findPackageManager } from '../package-manager'

describe('Given a project without packageManager field', () => {
  let cwd: string

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'relizy-pm-'))
    writeFileSync(join(cwd, 'package.json'), '{}')
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  describe('When it has a lockfile', () => {
    it.each([
      ['pnpm', 'pnpm-lock.yaml'],
      ['yarn', 'yarn.lock'],
      ['npm', 'package-lock.json'],
      ['bun', 'bun.lockb'],
      ['bun', 'bun.lock'],
    ])('Then detects %s from %s', (expected, lockfile) => {
      writeFileSync(join(cwd, lockfile), '')

      expect(findPackageManager(cwd)).toBe(expected)
    })
  })

  describe('When it has the text lockfile of bun and another lockfile', () => {
    it('Then the other lockfile wins, as for bun.lockb', () => {
      writeFileSync(join(cwd, 'bun.lock'), '')
      writeFileSync(join(cwd, 'package-lock.json'), '')

      expect(findPackageManager(cwd)).toBe('npm')
    })
  })

  describe('When it has no lockfile', () => {
    it('Then nothing is detected', () => {
      expect(findPackageManager(cwd)).toBeUndefined()
    })
  })
})
