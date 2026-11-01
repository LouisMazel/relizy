import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getReleaseFiles, recordReleaseFile, resetReleaseFiles, restoreReleaseFiles } from '../release-files'

describe('Given the journal of the release files', () => {
  let cwd: string

  beforeEach(() => {
    resetReleaseFiles()
    cwd = mkdtempSync(join(tmpdir(), 'relizy-release-files-'))
  })

  afterEach(() => {
    resetReleaseFiles()
    rmSync(cwd, { recursive: true, force: true })
  })

  describe('When files are recorded before being written', () => {
    it('Then lists them relative to the working directory', () => {
      recordReleaseFile(join(cwd, 'package.json'))
      recordReleaseFile(join(cwd, 'packages/a/CHANGELOG.md'))

      expect(getReleaseFiles(cwd)).toEqual(['package.json', 'packages/a/CHANGELOG.md'])
    })

    it('Then restores their content byte for byte, uncommitted changes included', () => {
      const packageJson = join(cwd, 'package.json')
      const original = '{\n    "name": "a",\n    "version": "1.0.0",\n    "dependencies": { "b": "workspace:^" }\n}\n'
      writeFileSync(packageJson, original)

      recordReleaseFile(packageJson)
      writeFileSync(packageJson, '{ "name": "a", "version": "1.0.1" }\n')

      expect(restoreReleaseFiles(cwd)).toEqual(['package.json'])
      expect(readFileSync(packageJson, 'utf8')).toBe(original)
    })

    it('Then keeps the content before the first write of the run', () => {
      const changelog = join(cwd, 'CHANGELOG.md')
      writeFileSync(changelog, '# Changelog\n')

      recordReleaseFile(changelog)
      writeFileSync(changelog, '# Changelog\n\n## 1.0.1\n')
      recordReleaseFile(changelog)
      writeFileSync(changelog, '# Changelog\n\n## 1.0.1\n\nformatted\n')
      restoreReleaseFiles(cwd)

      expect(readFileSync(changelog, 'utf8')).toBe('# Changelog\n')
    })

    it('Then removes the files the run created, and only them', () => {
      const created = join(cwd, 'CHANGELOG.md')
      const other = join(cwd, 'notes.md')
      writeFileSync(other, 'mine\n')

      recordReleaseFile(created)
      writeFileSync(created, '# Changelog\n')
      restoreReleaseFiles(cwd)

      expect(existsSync(created)).toBe(false)
      expect(readFileSync(other, 'utf8')).toBe('mine\n')
    })

    it('Then forgets them once restored', () => {
      recordReleaseFile(join(cwd, 'package.json'))
      restoreReleaseFiles(cwd)

      expect(getReleaseFiles(cwd)).toEqual([])
    })
  })

  describe('When the journal is reset', () => {
    it('Then forgets the files without restoring them', () => {
      const packageJson = join(cwd, 'package.json')
      writeFileSync(packageJson, '{ "version": "1.0.0" }\n')
      recordReleaseFile(packageJson)
      writeFileSync(packageJson, '{ "version": "1.0.1" }\n')

      resetReleaseFiles()

      expect(getReleaseFiles(cwd)).toEqual([])
      expect(restoreReleaseFiles(cwd)).toEqual([])
      expect(readFileSync(packageJson, 'utf8')).toBe('{ "version": "1.0.1" }\n')
    })
  })
})
