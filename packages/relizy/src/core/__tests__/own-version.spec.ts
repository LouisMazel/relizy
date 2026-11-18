import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findOwnRoot, getOwnEntry, readOwnVersion } from '../own-version'

describe('Given the running relizy', () => {
  let root: string

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'relizy-own-')))
    mkdirSync(join(root, 'relizy', 'src', 'core'), { recursive: true })
    mkdirSync(join(root, 'relizy', 'dist', 'shared'), { recursive: true })
    writeFileSync(join(root, 'relizy', 'package.json'), JSON.stringify({ name: 'relizy', version: '2.3.0' }))
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'app' }))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  describe('When it runs from its build', () => {
    it('Then its entry is the build, in its own directory', () => {
      expect(findOwnRoot(join(root, 'relizy', 'dist', 'shared'))).toBe(join(root, 'relizy'))
      expect(getOwnEntry(join(root, 'relizy', 'dist', 'shared'))).toBe(join(root, 'relizy', 'dist', 'index.mjs'))
    })
  })

  describe('When it runs from its sources', () => {
    it('Then its entry is the sources', () => {
      expect(getOwnEntry(join(root, 'relizy', 'src', 'core'))).toBe(join(root, 'relizy', 'src', 'index.ts'))
    })
  })

  describe('When its directory is not found', () => {
    it('Then it has no entry and no version', () => {
      expect(getOwnEntry(root)).toBeUndefined()
      expect(readOwnVersion(root)).toBe('0.0.0')
    })
  })

  describe('When its package.json has no version', () => {
    it('Then its version is 0.0.0', () => {
      writeFileSync(join(root, 'relizy', 'package.json'), JSON.stringify({ name: 'relizy' }))

      expect(readOwnVersion(join(root, 'relizy', 'src'))).toBe('0.0.0')
    })
  })

  describe('When it runs from this repository', () => {
    it('Then its entry is the sources of relizy', () => {
      expect(getOwnEntry()).toMatch(/packages[/\\]relizy[/\\]src[/\\]index\.ts$/)
    })
  })
})
