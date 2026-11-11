/** @type {Partial<import("typedoc").TypeDocOptions>} */
export default {
  entryPoints: ['./../packages/relizy/src/index.ts'],
  tsconfig: './../packages/relizy/tsconfig.json',
  exclude: ['./../packages/relizy/src/**/*.spec.ts'],
  // Only the return type of `getDefaultConfig()` is public, through `ResolvedConfig`
  intentionallyNotExported: ['getDefaultConfig'],
  // The README is the guide of the docs, not the API reference
  readme: 'none',
  plugin: ['typedoc-plugin-markdown', 'typedoc-vitepress-theme'],
  out: './src/typedoc',
  docsRoot: './src',
}
