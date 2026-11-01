import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    'src/index',
    'src/cli',
  ],
  clean: true,
  declaration: true,
  rollup: {
    emitCJS: false,
    esbuild: {
      target: 'node22',
    },
    // Only in the chunk of `relizy mcp`, loaded on demand: the users of relizy do not install the MCP SDK.
    // A new dependency of the SDK fails the build ("Implicitly bundling"): add it here.
    inlineDependencies: [
      '@modelcontextprotocol/sdk',
      'zod',
      'zod-to-json-schema',
      'minisearch',
      'ajv',
      'ajv-formats',
      'fast-deep-equal',
      'json-schema-traverse',
      'fast-uri',
    ],
  },
})
