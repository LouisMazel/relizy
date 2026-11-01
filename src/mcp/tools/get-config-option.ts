import type { ServerContext } from '../context'
import type { ConfigOption } from '../knowledge/schema'

import { z } from 'zod'
import { getDefaultConfig, redactSecrets } from '../../core'
import { code, firstParagraph, tableCell, truncateText } from '../markdown'
import { defineTool, ToolInputError } from './types'

const MAX_DEFAULT_CHARS = 300

/** Serializes a config value for the agent: functions and regular expressions as text */
export function stringifyConfigValue(value: unknown, indent?: number): string | undefined {
  if (value === undefined) {
    return undefined
  }

  return JSON.stringify(value, (_, nested: unknown) => {
    if (typeof nested === 'function') {
      return '[function]'
    }

    return nested instanceof RegExp ? nested.toString() : nested
  }, indent)
}

/** Default of an option in the resolved defaults of relizy, `undefined` for the items of the arrays */
function runtimeDefault(path: string): string | undefined {
  if (path.includes('[]')) {
    return undefined
  }

  const value = path.split('.').reduce<unknown>((current, key) => (current as Record<string, unknown> | undefined)?.[key], redactSecrets(getDefaultConfig()))
  const serialized = stringifyConfigValue(value)

  return serialized && serialized.length <= MAX_DEFAULT_CHARS ? serialized : undefined
}

function defaultOf(option: ConfigOption): string | undefined {
  return option.default ?? runtimeDefault(option.path)
}

/** Options one level below a path: `bump.type` under `bump`, `monorepo.groups[].name` under `monorepo.groups` */
function childrenOf(options: ConfigOption[], path: string): ConfigOption[] {
  const prefix = new RegExp(`^${path.replaceAll(/[.[\]]/g, '\\$&')}(?:\\[\\])?\\.[^.]+$`)

  return options.filter(option => prefix.test(option.path))
}

function optionsTable(options: ConfigOption[]): string {
  return [
    '| Option | Type | Default | Description |',
    '| --- | --- | --- | --- |',
    ...options.map((option) => {
      const defaultValue = defaultOf(option)

      return `| ${code(option.path)} | ${code(tableCell(truncateText(option.type, 80)))} | ${defaultValue ? code(tableCell(defaultValue)) : ''} | ${tableCell(truncateText(firstParagraph(option.description), 160))} |`
    }),
  ].join('\n')
}

function suggestOptions(options: ConfigOption[], path: string): ConfigOption[] {
  const wanted = path.toLowerCase().replaceAll('[]', '')
  const last = wanted.split('.').at(-1)!

  return options
    .filter(option => option.path.toLowerCase().replaceAll('[]', '').endsWith(`.${last}`) || option.path.toLowerCase() === last || option.path.toLowerCase().includes(wanted))
    .slice(0, 8)
}

export function getConfigOption(context: ServerContext, { path }: { path?: string }): string {
  const { config } = context.knowledge

  if (!path) {
    return [
      `# relizy ${context.version} config options`,
      '',
      'Top-level options of `relizy.config.ts` (`defineConfig` from `relizy`). Call `get_config_option({ path: "<option>" })` for the details and the nested options of an option.',
      '',
      optionsTable(config.filter(option => !option.path.includes('.'))),
    ].join('\n')
  }

  const normalized = path.trim().replace(/^config\./, '')
  const option = context.knowledge.configByPath.get(normalized)
    ?? config.find(candidate => candidate.path.replaceAll('[]', '') === normalized.replaceAll('[]', ''))

  if (!option) {
    const suggestions = suggestOptions(config, normalized)

    throw new ToolInputError([
      `relizy ${context.version} has no config option "${path}".`,
      ...(suggestions.length > 0 ? ['', 'Closest options:', ...suggestions.map(candidate => `- \`${candidate.path}\` (\`${truncateText(candidate.type, 80)}\`)`)] : []),
      '',
      'List the options with `get_config_option()`, or search them with `search_docs`.',
    ].join('\n'))
  }

  const children = childrenOf(config, option.path)
  const defaultValue = defaultOf(option)
  const section = option.path.split('.').at(-1)!.replace('[]', '')

  return [
    `# \`${option.path}\``,
    '',
    `- **Type:** \`${option.type}\``,
    ...(defaultValue ? [`- **Default:** \`${defaultValue}\``] : []),
    ...(option.deprecated ? [`- **Deprecated:** ${option.deprecated}`] : []),
    ...(option.see ? [`- **See:** ${option.see}`] : []),
    '',
    option.description || 'No description.',
    ...(children.length > 0 ? ['', '## Options', '', optionsTable(children)] : []),
    '',
    `Docs: \`get_doc({ id: "${option.docId}", sections: ["${section}"] })\`.`,
  ].join('\n')
}

export const getConfigOptionTool = defineTool({
  name: 'get_config_option',
  title: 'Read a relizy config option',
  description: 'Reference of the options of `relizy.config.ts` for the installed relizy: type, default, description, deprecation and nested options, extracted from the relizy types. Pass a dotted path ("bump.outOfRangePeers", "monorepo.groups", "publish.registry", "release.providerRelease"), or nothing for the top-level options. Use it before writing or changing a config: never invent an option.',
  inputSchema: {
    path: z.string().optional().describe('Dotted path of the option, `[]` for the items of an array: "monorepo.groups[].versionMode"'),
  },
  run: getConfigOption,
})
