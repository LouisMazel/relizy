import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { ROOT_DIR } from './helpers'

/** Dependencies inlined in the chunk of `relizy mcp` only (see `build.config.ts`) */
const MCP_ONLY_DEPENDENCIES = ['@modelcontextprotocol/sdk', 'zod', 'minisearch']

function resolveSource(from: string, specifier: string): string | undefined {
  const base = join(dirname(from), specifier)

  return [
    `${base}.ts`,
    join(base, 'index.ts'),
  ].find(existsSync)
}

/** The packages imported statically (not through `await import()`) from a source file, transitively */
function staticImports(entry: string): Map<string, string> {
  const packages = new Map<string, string>()
  const visited = new Set<string>()
  const queue = [entry]

  while (queue.length > 0) {
    const file = queue.shift()!

    if (visited.has(file)) {
      continue
    }

    visited.add(file)

    for (const match of readFileSync(file, 'utf8').matchAll(/^(?:import|export)(?!\s+type\b)[^'"\n]*?from\s+'([^']+)'/gm)) {
      const specifier = match[1]!

      if (specifier.startsWith('.')) {
        const source = resolveSource(file, specifier)

        if (source) {
          queue.push(source)
        }
      }
      else if (!packages.has(specifier)) {
        packages.set(specifier, file.slice(ROOT_DIR.length + 1))
      }
    }
  }

  return packages
}

describe('Given the commands of the CLI other than relizy mcp', () => {
  describe('When their static imports are followed from src/cli.ts and src/index.ts', () => {
    it('Then they never load the dependencies of the MCP server', () => {
      for (const entry of ['src/cli.ts', 'src/index.ts']) {
        const loaded = [
          ...staticImports(join(ROOT_DIR, entry)),
        ]
          .filter(([specifier]) => MCP_ONLY_DEPENDENCIES.some(dependency => specifier === dependency || specifier.startsWith(`${dependency}/`)))
          .map(([specifier, file]) => `${specifier} (imported by ${file})`)

        expect(loaded, entry).toEqual([])
      }
    })
  })
})
