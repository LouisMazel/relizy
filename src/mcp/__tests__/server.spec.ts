import type { ToolDefinition } from '../tools/types'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { buildInstructions, MAX_INSTRUCTIONS_LENGTH } from '../instructions'
import { createRelizyMcpServer, runTool, TOOLS } from '../server'
import { ToolInputError } from '../tools/types'
import { readOwnVersion } from '../version'
import { cleanTempDirs, createTempDir, createTestContext, getKnowledge } from './helpers'

vi.mock('@maz-ui/node', importActual => importActual())

async function connect(): Promise<Client> {
  const { server } = createRelizyMcpServer({ knowledge: getKnowledge(), cwd: createTempDir() })
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test', version: '1.0.0' })

  await server.connect(serverTransport)
  await client.connect(clientTransport)

  return client
}

function textOf(result: unknown): string {
  return (result as { content: { text: string }[] }).content[0]!.text
}

function promptText(prompt: { messages: { content: unknown }[] }): string {
  return (prompt.messages[0]!.content as { text: string }).text
}

afterAll(() => {
  cleanTempDirs()
})

describe('Given the start of the relizy MCP server', () => {
  describe('When a client connects and lists the tools', () => {
    it('Then the docs bundle is not read', async () => {
      const { server, context } = createRelizyMcpServer({ cwd: createTempDir(), docsDir: createTempDir() })
      const knowledge = vi.spyOn(context, 'knowledge', 'get')
      const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair()
      const client = new Client({ name: 'test', version: '1.0.0' })

      await server.connect(serverTransport)
      await client.connect(clientTransport)
      await client.listTools()
      await client.listPrompts()

      expect(knowledge).not.toHaveBeenCalled()
      await client.close()
    })
  })
})

describe('Given the relizy MCP server', () => {
  let client: Client

  beforeAll(async () => {
    client = await connect()
  })

  afterAll(async () => {
    await client.close()
  })

  describe('When a client connects', () => {
    it('Then it receives the server info and the instructions', () => {
      expect(client.getServerVersion()).toEqual(expect.objectContaining({ name: 'relizy', version: readOwnVersion() }))
      expect(client.getInstructions()).toContain('preview_release')
      expect(client.getInstructions()).toContain('lint_commit')
    })
  })

  describe('When the tools are listed', () => {
    it('Then they keep the TOOLS order with read-only annotations', async () => {
      const { tools } = await client.listTools()

      expect(tools.map(tool => tool.name)).toEqual(['preview_release', 'preview_changelog', 'lint_commit', 'get_project', 'get_config_option', 'search_docs', 'get_doc'])
      expect(tools.map(tool => tool.name)).toEqual(TOOLS.map(tool => tool.name))

      for (const tool of tools) {
        expect(tool.annotations).toEqual(expect.objectContaining({ readOnlyHint: true, destructiveHint: false, idempotentHint: true }))
        expect(tool.description!.length).toBeGreaterThan(100)
      }

      expect(tools.filter(tool => tool.annotations?.openWorldHint).map(tool => tool.name)).toEqual(['preview_release', 'preview_changelog'])
    })
  })

  describe('When the prompts are listed and read', () => {
    it('Then each prompt drives the tools of the server', async () => {
      const { prompts } = await client.listPrompts()

      expect(prompts.map(prompt => prompt.name)).toEqual(['write-commit', 'prepare-release', 'setup-relizy', 'setup-ci'])

      const commit = await client.getPrompt({ name: 'write-commit', arguments: { intent: 'fix the tags' } })
      const release = await client.getPrompt({ name: 'prepare-release', arguments: { type: 'minor' } })
      const plainRelease = await client.getPrompt({ name: 'prepare-release', arguments: {} })
      const setup = await client.getPrompt({ name: 'setup-relizy' })
      const github = await client.getPrompt({ name: 'setup-ci', arguments: { provider: 'github' } })
      const gitlab = await client.getPrompt({ name: 'setup-ci', arguments: { provider: 'gitlab' } })

      expect(promptText(commit)).toContain('(fix the tags)')
      expect(promptText(commit)).toContain('lint_commit({ message })')
      expect(promptText(release)).toContain('preview_release({ type: "minor" })')
      expect(promptText(plainRelease)).toContain('preview_release({})')
      expect(promptText(setup)).toContain('relizy mcp init')
      expect(promptText(github)).toContain('guide/github-actions')
      expect(promptText(gitlab)).toContain('guide/gitlab-ci')
    })
  })

  describe('When a tool is called with valid arguments', () => {
    it('Then it returns markdown', async () => {
      const result = await client.callTool({ name: 'get_config_option', arguments: { path: 'bump.yes' } })

      expect(result.isError).toBeFalsy()
      expect((result.content as { text: string }[])[0]!.text).toContain('# `bump.yes`')
    })
  })

  describe('When a tool is called with invalid arguments', () => {
    it('Then the client gets an error', async () => {
      const result = await client.callTool({ name: 'search_docs', arguments: { query: '' } })

      expect(result.isError).toBe(true)
    })
  })
})

describe('Given runTool', () => {
  const tool = (run: ToolDefinition['run']): ToolDefinition => ({ name: 'test_tool', title: 'Test', description: 'Test', inputSchema: {}, run })

  describe('When the tool throws a ToolInputError', () => {
    it('Then the message is returned as is', async () => {
      const result = await runTool(createTestContext(), tool(() => {
        throw new ToolInputError('Pass another id')
      }), {})

      expect(result).toEqual({ content: [{ type: 'text', text: 'Pass another id' }], isError: true })
    })
  })

  describe('When the tool fails unexpectedly', () => {
    it('Then the error suggests the dry run of the CLI', async () => {
      const result = await runTool(createTestContext(), tool(() => Promise.reject(new Error('boom'))), {})

      expect(textOf(result)).toBe('Unexpected error in test_tool: boom. Retry with other arguments, or run the relizy CLI with `--dry-run` (e.g. `relizy release --dry-run`).')
      expect(result.isError).toBe(true)
    })
  })
})

describe('Given buildInstructions', () => {
  describe('When they are built', () => {
    it('Then they fit in the limit of Claude Code and forbid the releases without approval', () => {
      const instructions = buildInstructions(createTestContext())

      expect(instructions.length).toBeLessThan(MAX_INSTRUCTIONS_LENGTH)
      expect(instructions).toContain('Never run relizy release')

      for (const { name } of TOOLS) {
        expect(instructions).toContain(name)
      }
    })
  })
})
