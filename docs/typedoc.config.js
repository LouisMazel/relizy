/** @type {Partial<import("typedoc").TypeDocOptions>} */
export default {
  entryPoints: ['./../src/index.ts'],
  exclude: ['./../src/**/*.spec.ts'],
  // Only the return type of `getDefaultConfig()` is public, through `ResolvedConfig`
  intentionallyNotExported: ['getDefaultConfig'],
  plugin: ['typedoc-plugin-markdown', 'typedoc-vitepress-theme'],
  out: './src/typedoc',
  docsRoot: './src',
}
