import { getDefaultConfig } from './config'
import { PROFILE_SECTIONS } from './profiles'

/**
 * One option of `relizy.config.ts`, with the options nested in it
 */
export interface ConfigOptionNode {
  /** Dotted path, `[]` for the items of an array and `*` for the entries of a record: `bump.type`, `monorepo.groups[].name`, `profiles.*.bump.type` */
  path: string
  /** Last segment of the path: `type` */
  key: string
  /** The type as written in the types of relizy: `boolean`, `string[]`, `VersionMode`, `BumpConfig` */
  type: string
  /** The values the type accepts when it hides them behind an alias: `['unified', 'selective', 'independent']` */
  values?: string[]
  /** The default of the option, none when it depends on the project or has no default */
  default?: unknown
  /** What the option does, in markdown */
  description: string
  /** The first paragraph of the description, on one line */
  summary: string
  deprecated?: string
  see?: string
  /** Doc page of the option, for `get_doc` of the MCP server: `config/bump` */
  docId: string
  /** URL of the doc page */
  docUrl: string
  children: ConfigOptionNode[]
}

export interface GetConfigOptionsOptions {
  /** Folder of the docs bundle of relizy (`agent-docs/`), the one of the installed relizy by default */
  bundleDir?: string
}

const HOMEPAGE = 'https://relizy.dev'

/** Options whose default depends on the project or the environment: they have no default to show */
const DYNAMIC_DEFAULTS = /^(?:cwd|repo|tokens|publish\.packageManager)(?:\.|$)/

function unquote(value: string): string {
  return /^(["']).*\1$/.test(value)
    ? value.slice(1, -1)
    : value
}

function parseDefault(text: string | undefined): unknown {
  if (text === undefined) {
    return undefined
  }

  try {
    return JSON.parse(text)
  }
  catch {
    return unquote(text.trim())
  }
}

function runtimeDefault(defaults: object, path: string): unknown {
  if (path.includes('[]') || DYNAMIC_DEFAULTS.test(path)) {
    return undefined
  }

  return path.split('.').reduce<unknown>((current, key) => (current as Record<string, unknown> | undefined)?.[key], defaults)
}

function firstParagraph(value: string): string {
  const lines = value.trim().split('\n')
  const end = lines.findIndex(line => line.trim() === '')

  return (end === -1
    ? lines
    : lines.slice(0, end)).map(line => line.trim()).filter(Boolean).join(' ')
}

/** The parent of a path: `bump.type` is in `bump`, `monorepo.groups[].name` in `monorepo.groups` */
function parentPath(path: string): string | undefined {
  const index = path.lastIndexOf('.')

  return index === -1
    ? undefined
    : path.slice(0, index).replace(/\[\]$/, '')
}

/** The nodes below `from`, under `to`: the options of `bump` are the ones of `profiles.*.bump` */
function rebase(node: ConfigOptionNode, from: string, to: string): ConfigOptionNode {
  return {
    ...node,
    path: to + node.path.slice(from.length),
    children: node.children.map(child => rebase(child, from, to)),
  }
}

/**
 * The options of a profile are the ones of the sections it sets: `profiles.*`
 * holds a `description` and each section, whose options are the ones of the section
 */
function addProfileOptions(byPath: Map<string, ConfigOptionNode>): void {
  const profiles = byPath.get('profiles')

  if (!profiles) {
    return
  }

  const sections = PROFILE_SECTIONS.flatMap((section) => {
    const node = byPath.get(section)
    return node
      ? [
          rebase(node, section, `profiles.*.${section}`),
        ]
      : []
  })

  profiles.children = [
    {
      path: 'profiles.*',
      key: '*',
      type: 'RelizyProfile',
      description: 'A profile, by its name: a named way of releasing (`beta`, `canary`...), selected with `--profile <name>`. It sets `description` and the config sections listed here, over the config file and under the options of the run.',
      summary: 'A profile, by its name: a named way of releasing, selected with `--profile <name>`.',
      docId: profiles.docId,
      docUrl: profiles.docUrl,
      children: [
        {
          path: 'profiles.*.description',
          key: 'description',
          type: 'string',
          description: 'What the profile is for, for the tools listing the profiles.',
          summary: 'What the profile is for, for the tools listing the profiles.',
          docId: profiles.docId,
          docUrl: profiles.docUrl,
          children: [],
        },
        ...sections,
      ],
    },
  ]
}

/**
 * The options of `relizy.config.ts` of the installed relizy as a tree, for a tool
 * showing or editing a config: path, type, accepted values, default, description
 * and the options nested in each one. It reads the same reference as the
 * `get_config_option` tool of the MCP server, extracted from the types of relizy.
 * The options of the `profiles` are under `profiles.*`.
 *
 * @example
 * const options = await getConfigOptions()
 * const bump = options.find(option => option.path === 'bump')
 * bump.children.map(option => [option.path, option.type, option.default])
 */
export async function getConfigOptions(options: GetConfigOptionsOptions = {}): Promise<ConfigOptionNode[]> {
  const { loadKnowledge } = await import('./mcp/knowledge/load')
  const knowledge = loadKnowledge(options.bundleDir)

  const defaults = getDefaultConfig()
  const byPath = new Map<string, ConfigOptionNode>()
  const roots: ConfigOptionNode[] = []

  for (const option of knowledge.config) {
    const defaultValue = DYNAMIC_DEFAULTS.test(option.path)
      ? undefined
      : runtimeDefault(defaults, option.path) ?? parseDefault(option.default)

    const node: ConfigOptionNode = {
      path: option.path,
      key: option.path.slice(option.path.lastIndexOf('.') + 1).replace(/\[\]$/, ''),
      type: option.type,
      ...(option.values
        ? {
            values: option.values.map(unquote),
          }
        : {}),
      ...(defaultValue === undefined
        ? {}
        : { default: defaultValue }),
      description: option.description,
      summary: firstParagraph(option.description),
      ...(option.deprecated
        ? { deprecated: option.deprecated }
        : {}),
      ...(option.see
        ? { see: option.see }
        : {}),
      docId: option.docId,
      docUrl: `${HOMEPAGE}/${option.docId}`,
      children: [],
    }

    byPath.set(option.path, node)

    const parent = parentPath(option.path)
    const parentNode = parent
      ? byPath.get(parent)
      : undefined

    if (parentNode) {
      parentNode.children.push(node)
    }
    else {
      roots.push(node)
    }
  }

  addProfileOptions(byPath)

  return roots
}
