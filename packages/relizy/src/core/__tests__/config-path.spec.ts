import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isConfigFilePath, loadRelizyConfig } from '../config'

describe('Given a config given by path', () => {
  let project: string
  let elsewhere: string

  beforeEach(() => {
    project = mkdtempSync(join(tmpdir(), 'relizy-project-'))
    elsewhere = mkdtempSync(join(tmpdir(), 'relizy-elsewhere-'))
    writeFileSync(join(project, 'relizy.config.json'), JSON.stringify({
      bump: { preid: 'project' },
    }))
    writeFileSync(join(elsewhere, 'relizy.config.json'), JSON.stringify({
      bump: { preid: 'elsewhere' },
      projectName: 'outside',
    }))
    mkdirSync(join(project, 'release'))
    writeFileSync(join(project, 'release', 'custom.config.json'), JSON.stringify({
      bump: { preid: 'relative' },
    }))
  })

  afterEach(() => {
    rmSync(project, { recursive: true, force: true })
    rmSync(elsewhere, { recursive: true, force: true })
  })

  describe('When telling a name from a path', () => {
    it('Then a name has no separator nor known extension', () => {
      expect(isConfigFilePath('relizy')).toBe(false)
      expect(isConfigFilePath('relizy.standalone')).toBe(false)
      expect(isConfigFilePath('/abs/relizy.config.ts')).toBe(true)
      expect(isConfigFilePath('./relizy.config.ts')).toBe(true)
      expect(isConfigFilePath('release/relizy')).toBe(true)
      expect(isConfigFilePath('relizy.config.mjs')).toBe(true)
    })
  })

  describe('When loading an absolute path', () => {
    it('Then loads that file and keeps the project as cwd', async () => {
      const config = await loadRelizyConfig({
        configFile: join(elsewhere, 'relizy.config.json'),
        overrides: { cwd: project },
      })

      expect(config.cwd).toBe(project)
      expect(config.projectName).toBe('outside')
      expect(config.bump.preid).toBe('elsewhere')
    })
  })

  describe('When loading a path relative to the project', () => {
    it('Then loads that file', async () => {
      const config = await loadRelizyConfig({
        configFile: './release/custom.config.json',
        overrides: { cwd: project },
      })

      expect(config.bump.preid).toBe('relative')
    })
  })

  describe('When the file of the path does not exist', () => {
    it('Then fails naming the path', async () => {
      await expect(loadRelizyConfig({
        configFile: join(elsewhere, 'missing.config.ts'),
        overrides: { cwd: project },
      }))
        .rejects
        .toThrow(`No config file found at "${join(elsewhere, 'missing.config.ts')}"`)
    })
  })

  describe('When loading a name', () => {
    it('Then keeps reading <name>.config.* of the project', async () => {
      const config = await loadRelizyConfig({
        configFile: 'relizy',
        overrides: { cwd: project },
      })

      expect(config.bump.preid).toBe('project')
    })
  })
})
