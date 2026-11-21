import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runGitSync, tryGitSync } from '@relizy/core'

/**
 * Licenses of the source repositories of the dataset. Only the permissive
 * ones are kept (MIT, Apache 2.0, BSD, ISC): a repository under a copyleft
 * license (GPL, AGPL, LGPL, MPL, SSPL...), with another license, or without
 * one is left out. The license is read from the license files at the root of
 * the repository, not from a declaration of a third-party dataset.
 */

/** Licenses the dataset accepts */
export const PERMISSIVE_LICENSES = [
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
] as const

export type LicenseId = typeof PERMISSIVE_LICENSES[number] | 'copyleft' | 'other' | 'none'

/** The license of a repository, as kept in the cache and the manifest */
export interface RepositoryLicense {
  /** SPDX id of a permissive license, or why the repository is left out */
  license: LicenseId
  /** Each license file at the root and what it holds, `[]` when there is none */
  files: { path: string, license: LicenseId }[]
}

const LICENSE_FILE_REGEX = /^(?:licen[cs]e|copying|unlicense)(?:[-._].*)?$/i
/** Lists of the licenses of the dependencies (`LICENSE-3rdparty.csv`, `LICENSE-THIRD-PARTY`), not the license of the repository */
const THIRD_PARTY_LISTING_REGEX = /(?:3rd|third)[-_.]?party|dependencies/i
const DATA_FILE_REGEX = /\.(?:csv|json|ya?ml)$/i

/**
 * Recognizes a license from the text of its file. Copyleft wins over the
 * other matches: a file quoting the GPL is not read as MIT.
 */
export function detectLicense(text: string): LicenseId {
  const normalized = text.replace(/\s+/g, ' ')

  if (/\b(?:GNU (?:AFFERO |LESSER |LIBRARY )?GENERAL PUBLIC LICENSE|Mozilla Public License|Server Side Public License|Business Source License|Eclipse Public License|European Union Public Licen[cs]e)\b/i.test(normalized)) {
    return 'copyleft'
  }
  if (/\bApache License\b/i.test(normalized) && /\bVersion 2\.0\b/i.test(normalized)) {
    return 'Apache-2.0'
  }
  if (/Permission is hereby granted, free of charge/i.test(normalized)) {
    return 'MIT'
  }
  if (/Permission to use, copy, modify, and(?:\/or)? distribute this software for any purpose with or without fee/i.test(normalized)) {
    return 'ISC'
  }
  if (/Redistribution and use in source and binary forms/i.test(normalized)) {
    return /Neither the name|names of (?:its|the) contributors/i.test(normalized)
      ? 'BSD-3-Clause'
      : 'BSD-2-Clause'
  }
  return 'other'
}

/**
 * The license of a repository from its license files: permissive when every
 * file is (dual licensing, `LICENSE-MIT` and `LICENSE-APACHE`), copyleft as
 * soon as one is, `none` without license file.
 */
export function resolveRepositoryLicense(allFiles: RepositoryLicense['files']): LicenseId {
  const files = allFiles.filter(file => !THIRD_PARTY_LISTING_REGEX.test(file.path) && !DATA_FILE_REGEX.test(file.path))
  if (files.length === 0) {
    return 'none'
  }
  if (files.some(file => file.license === 'copyleft')) {
    return 'copyleft'
  }
  const permissive = files.filter(file => isPermissive(file.license))
  if (permissive.length !== files.length) {
    return 'other'
  }
  return permissive[0]!.license
}

export function isPermissive(license: LicenseId): boolean {
  return (PERMISSIVE_LICENSES as readonly string[]).includes(license)
}

/** Reads the license files at the root of HEAD of a local repository (bare or not) */
export function readLocalRepositoryLicense(cwd: string): RepositoryLicense {
  const names = (tryGitSync(['ls-tree', '--name-only', 'HEAD'], { cwd }) ?? '')
    .split('\n')
    .filter(name => LICENSE_FILE_REGEX.test(name))

  const files = names.map((path) => {
    const text = tryGitSync(['show', `HEAD:${path}`], { cwd }) ?? ''
    return {
      path,
      license: detectLicense(text),
    }
  })

  return {
    license: resolveRepositoryLicense(files),
    files,
  }
}

/**
 * Reads the license of a GitHub repository from a shallow clone without
 * blobs: only the trees of HEAD and the license files are downloaded.
 *
 * @param repo - `owner/name`
 */
export function readRemoteRepositoryLicense(repo: string): RepositoryLicense | undefined {
  const dir = mkdtempSync(join(tmpdir(), 'relizy-license-'))
  try {
    const cloned = tryGitSync([
      'clone',
      '--quiet',
      '--bare',
      '--depth=1',
      '--filter=blob:none',
      `https://github.com/${repo}.git`,
      dir,
    ])
    if (cloned === undefined) {
      return undefined
    }
    runGitSync(['rev-parse', 'HEAD'], { cwd: dir })
    return readLocalRepositoryLicense(dir)
  }
  catch {
    return undefined
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
