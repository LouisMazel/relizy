import type { Knowledge } from './knowledge/load'

import process from 'node:process'
import { loadKnowledge } from './knowledge/load'
import { DocSearch } from './search'
import { readOwnVersion } from './version'

export interface ServerContext {
  /** Version of the running relizy */
  version: string
  /** Root of the project: the configs are loaded and the git commands run from there */
  cwd: string
  /** Docs bundle, read on the first call that needs it: the server answers `initialize` without reading it */
  readonly knowledge: Knowledge
  /** Search index, built on the first search */
  readonly search: DocSearch
}

export interface CreateContextOptions {
  cwd?: string
  knowledge?: Knowledge
  /** Folder of the docs bundle, default: the `agent-docs/` of relizy */
  docsDir?: string
}

export function createContext(options: CreateContextOptions = {}): ServerContext {
  let knowledge = options.knowledge
  let search: DocSearch | undefined

  return {
    version: readOwnVersion(),
    cwd: options.cwd ?? process.cwd(),
    get knowledge() {
      knowledge ??= loadKnowledge(options.docsDir)
      return knowledge
    },
    get search() {
      search ??= new DocSearch(this.knowledge)
      return search
    },
  }
}
