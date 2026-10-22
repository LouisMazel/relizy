import type { GitCommit } from 'changelogen'
import type { Code } from 'mdast'
import type { ResolvedRelizyConfig } from '../config'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { logger } from '@maz-ui/node'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { gfm } from 'micromark-extension-gfm'
import { buildChangelogBody } from '../markdown'

/**
 * Title of the changelog section of a commit type, `undefined` when the commits
 * of this type never appear in the changelog.
 */
export function getChangelogTitle(type: string, config: ResolvedRelizyConfig): string | undefined {
  const typeConfig = config.types?.[type]
  return typeConfig && typeof typeConfig === 'object' && typeConfig.title ? typeConfig.title : undefined
}

/**
 * The commit as written in the CHANGELOG.md files by relizy: a section with the
 * commit and its body. `undefined` when the commit does not appear in the changelog.
 */
export function renderChangelogEntry(commit: GitCommit, config: ResolvedRelizyConfig): string | undefined {
  const title = getChangelogTitle(commit.type, config)
  if (!title) {
    return undefined
  }
  return buildChangelogBody({
    commits: [commit],
    config: { ...config, types: { [commit.type]: { title } } } as ResolvedRelizyConfig,
  })
}

/**
 * Checks a changelog entry the way the release would: returns the problems that
 * would make the formatting of the CHANGELOG.md files fail.
 */
export interface ChangelogLinter {
  name: 'eslint' | 'oxc'
  lint: (markdown: string) => Promise<string[]>
}

/** Path the entry is linted as, so the project config for the changelogs applies */
const CHANGELOG_FILE = 'CHANGELOG.md'

function getLine(text: string, line: number): string {
  return (text.split('\n')[line - 1] ?? '').trim()
}

/**
 * The ESLint of the project, when it is installed and lints the CHANGELOG.md
 * files (markdown support, file not ignored).
 */
async function loadProjectEslint(cwd: string): Promise<ChangelogLinter | undefined> {
  let eslintPath: string
  try {
    eslintPath = createRequire(join(cwd, 'package.json')).resolve('eslint')
  }
  catch {
    return undefined
  }

  try {
    const { ESLint } = await import(pathToFileURL(eslintPath).href)
    const eslint = new ESLint({ cwd, fix: true })
    const filePath = join(cwd, CHANGELOG_FILE)
    if (await eslint.isPathIgnored(filePath) || !await eslint.calculateConfigForFile(filePath)) {
      logger.debug('commitlint: ESLint does not lint the changelogs, using the built-in parser')
      return undefined
    }

    return {
      name: 'eslint',
      async lint(markdown) {
        const [result] = await eslint.lintText(markdown, { filePath })
        const output: string = result?.output ?? markdown
        return (result?.messages ?? [])
          .filter((message: { severity: number }) => message.severity === 2)
          .map((message: { message: string, ruleId: string | null, line: number }) => {
            const rule = message.ruleId ? ` (${message.ruleId})` : ''
            return `${message.message.replace(/\.$/, '')}${rule}, on "${getLine(output, message.line)}"`
          })
      },
    }
  }
  catch (error) {
    logger.debug('commitlint: ESLint could not be loaded, using the built-in parser', error)
    return undefined
  }
}

/** Extension of the file a code block is parsed as, by language */
const CODE_BLOCK_EXTENSIONS: Record<string, string> = {
  js: 'js',
  javascript: 'js',
  mjs: 'mjs',
  cjs: 'cjs',
  jsx: 'jsx',
  ts: 'ts',
  typescript: 'ts',
  mts: 'mts',
  cts: 'cts',
  tsx: 'tsx',
}

function getCodeBlocks(markdown: string): Code[] {
  const root = fromMarkdown(markdown, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] })
  const blocks: Code[] = []
  const visit = (node: { type: string, children?: unknown[] }) => {
    if (node.type === 'code') {
      blocks.push(node as Code)
    }
    node.children?.forEach(child => visit(child as { type: string, children?: unknown[] }))
  }
  visit(root)
  return blocks
}

/**
 * Syntax check of the JavaScript, TypeScript and JSON code blocks, for projects
 * whose changelogs are not linted by ESLint.
 */
function createBuiltInLinter(): ChangelogLinter {
  return {
    name: 'oxc',
    async lint(markdown) {
      const problems: string[] = []
      for (const block of getCodeBlocks(markdown)) {
        const lang = block.lang?.toLowerCase() ?? ''
        const firstLine = block.value.split('\n')[0]?.trim() ?? ''

        if (lang === 'json') {
          try {
            JSON.parse(block.value)
          }
          catch (error) {
            problems.push(`Invalid JSON code block: ${(error as Error).message}, in the block starting with "${firstLine}"`)
          }
          continue
        }

        const extension = CODE_BLOCK_EXTENSIONS[lang]
        if (!extension) {
          continue
        }

        let parseSync: typeof import('oxc-parser').parseSync
        try {
          ({ parseSync } = await import('oxc-parser'))
        }
        catch {
          logger.warn('commitlint: oxc-parser could not be loaded, the code blocks of the commit bodies are not checked')
          return problems
        }

        const [error] = parseSync(`block.${extension}`, block.value).errors
        if (error) {
          const line = getLine(block.value, block.value.slice(0, error.labels?.[0]?.start ?? 0).split('\n').length)
          problems.push(`Invalid ${lang} code block: ${error.message}, on "${line}"`)
        }
      }
      return problems
    },
  }
}

const linters = new Map<string, Promise<ChangelogLinter>>()

/**
 * The linter of the changelog entries of a project: its ESLint when it lints the
 * CHANGELOG.md files, otherwise a syntax check of the code blocks. Loaded once per cwd.
 */
export function getChangelogLinter(cwd: string): Promise<ChangelogLinter> {
  let linter = linters.get(cwd)
  if (!linter) {
    linter = loadProjectEslint(cwd).then(eslint => eslint ?? createBuiltInLinter())
    linters.set(cwd, linter)
  }
  return linter
}
