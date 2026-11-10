import type { ConfigOption, CoreExport, DocEntry, Manifest } from './schema'

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { defaultBundleDir } from './paths'
import { manifestSchema } from './schema'

/** Docs bundle shipped with relizy (`agent-docs/`), read on demand */
export class Knowledge {
  readonly docsById: Map<string, DocEntry>
  readonly configByPath: Map<string, ConfigOption>
  readonly coreExportsByName: Map<string, CoreExport>
  private readonly cache = new Map<string, string>()

  constructor(readonly manifest: Manifest, readonly directory: string) {
    this.docsById = new Map(manifest.docs.map(doc => [doc.id, doc]))
    this.configByPath = new Map(manifest.config.map(option => [option.path, option]))
    this.coreExportsByName = new Map(manifest.core.exports.map(entry => [entry.name, entry]))
  }

  get docs(): DocEntry[] {
    return this.manifest.docs
  }

  get config(): ConfigOption[] {
    return this.manifest.config
  }

  get coreExports(): CoreExport[] {
    return this.manifest.core.exports
  }

  readDoc(id: string): string {
    const cached = this.cache.get(id)

    if (cached !== undefined) {
      return cached
    }

    const doc = this.docsById.get(id)

    if (!doc) {
      throw new Error(`Unknown doc "${id}"`)
    }

    const content = readFileSync(join(this.directory, doc.file), 'utf8')
    this.cache.set(id, content)

    return content
  }
}

export function loadKnowledge(directory: string = process.env.RELIZY_AGENT_DOCS_DIR || defaultBundleDir()): Knowledge {
  const file = join(directory, 'manifest.json')

  if (!existsSync(file)) {
    throw new Error(`The docs bundle of relizy is missing (${file}). Reinstall relizy, or run \`pnpm build\` in the relizy repository.`)
  }

  const parsed = manifestSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')))

  if (!parsed.success) {
    throw new Error(`The docs bundle of relizy is invalid (${file}): ${parsed.error.message}`)
  }

  return new Knowledge(parsed.data, directory)
}
