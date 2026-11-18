import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSync } from 'oxc-parser'

/** A node of the AST of oxc */
export type AstNode = Record<string, any>

export interface SourceModule {
  source: string
  comments: { type: string, value: string, start: number, end: number }[]
}

/** The module (source and comments) a node of the AST was parsed from, to read its text and its JSDoc */
export const moduleOfNode = new WeakMap<object, SourceModule>()

export function parseModule(file: string, source: string): { program: { body: AstNode[] }, module: SourceModule } {
  const { program, comments } = parseSync(file, source)
  const module: SourceModule = { source, comments }
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object' || moduleOfNode.has(node)) {
      return
    }

    moduleOfNode.set(node, module)

    for (const child of Object.values(node)) {
      visit(child)
    }
  }
  visit(program)

  return { program: program as unknown as { body: AstNode[] }, module }
}

export function declarationsOf(body: AstNode[]): Map<string, AstNode> {
  const declarations = new Map<string, AstNode>()

  for (const statement of body) {
    const declaration = statement.type === 'ExportNamedDeclaration'
      ? statement.declaration
      : statement

    if (declaration?.type === 'TSInterfaceDeclaration' || declaration?.type === 'TSTypeAliasDeclaration') {
      declarations.set(declaration.id.name, declaration)
    }
  }

  return declarations
}

/**
 * Resolves the types of `@relizy/core` that `src/types.ts` imports: the
 * declarations of the modules `src/index.ts` of core exports them from, by name.
 */
export function createCoreResolver(coreSrcDir: string): (name: string) => AstNode | undefined {
  const index = parseModule('index.ts', readFileSync(join(coreSrcDir, 'index.ts'), 'utf8'))
  const files = new Map<string, string>()
  const modules = new Map<string, Map<string, AstNode>>()

  for (const statement of index.program.body) {
    if (statement.type === 'ExportNamedDeclaration' && statement.source && statement.exportKind === 'type') {
      for (const specifier of statement.specifiers) {
        files.set(specifier.exported.name, join(coreSrcDir, `${statement.source.value}.ts`))
      }
    }
  }

  return (name) => {
    const file = files.get(name)

    if (!file) {
      return undefined
    }

    if (!modules.has(file)) {
      modules.set(file, declarationsOf(parseModule(file, readFileSync(file, 'utf8')).program.body))
    }

    return modules.get(file)?.get(name)
  }
}
