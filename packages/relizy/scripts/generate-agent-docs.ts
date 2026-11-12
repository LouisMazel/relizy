import process from 'node:process'
import { logger } from '@maz-ui/node'
import { generateAgentDocs } from '../src/core/mcp/knowledge/generate'

const manifest = generateAgentDocs({
  rootDir: process.cwd(),
})

logger.success(`[agent-docs] relizy ${manifest.version}: ${manifest.docs.length} docs, ${manifest.config.length} config options written to agent-docs/`)
