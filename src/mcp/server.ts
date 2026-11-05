import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { CreateContextOptions, ServerContext } from './context'
import type { ToolDefinition } from './tools/types'

import { getErrorMessage } from '@maz-ui/utils/helpers/getErrorMessage'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createContext } from './context'
import { buildInstructions } from './instructions'
import { registerPrompts } from './prompts'
import { captureLogs, redirectConsoleToStderr } from './runtime'
import { checkMigrationTool } from './tools/check-migration'
import { getConfigOptionTool } from './tools/get-config-option'
import { getDocTool } from './tools/get-doc'
import { getProjectTool } from './tools/get-project'
import { lintCommitTool } from './tools/lint-commit'
import { previewChangelogTool } from './tools/preview-changelog'
import { previewReleaseTool } from './tools/preview-release'
import { searchDocsTool } from './tools/search-docs'
import { ToolInputError } from './tools/types'

/** Tools in a stable order (prompt caching on the client side) */
export const TOOLS: ToolDefinition[] = [
  previewReleaseTool,
  previewChangelogTool,
  lintCommitTool,
  getProjectTool,
  getConfigOptionTool,
  searchDocsTool,
  getDocTool,
  checkMigrationTool,
]

export async function runTool(context: ServerContext, tool: ToolDefinition, args: unknown): Promise<CallToolResult> {
  try {
    return { content: [{ type: 'text', text: await tool.run(context, args) }] }
  }
  catch (error) {
    const message = error instanceof ToolInputError
      ? error.message
      : `Unexpected error in ${tool.name}: ${getErrorMessage(error)}. Retry with other arguments, or run the relizy CLI with \`--dry-run\` (e.g. \`relizy release --dry-run\`).`

    return { content: [{ type: 'text', text: message }], isError: true }
  }
}

/**
 * The relizy MCP server. Its tools only read the project: the logs of relizy
 * are captured (the reporters of the relizy logger are replaced), no hook nor
 * prompt runs.
 */
export function createRelizyMcpServer(options: CreateContextOptions = {}): { server: McpServer, context: ServerContext } {
  const context = createContext(options)
  const server = new McpServer(
    { name: 'relizy', title: 'relizy', version: context.version },
    { instructions: buildInstructions(context) },
  )

  captureLogs()

  for (const tool of TOOLS) {
    server.registerTool(tool.name, {
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: {
        title: tool.title,
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: tool.openWorld ?? false,
      },
      _meta: { 'anthropic/maxResultSizeChars': 80_000 },
    }, (args: unknown) => runTool(context, tool, args))
  }

  registerPrompts(server)

  return { server, context }
}

/** `relizy mcp`: the server on stdio, stdout only carries the protocol */
export async function startStdioServer(options: CreateContextOptions = {}): Promise<McpServer> {
  redirectConsoleToStderr()

  const { server } = createRelizyMcpServer(options)

  await server.connect(new StdioServerTransport())

  return server
}
