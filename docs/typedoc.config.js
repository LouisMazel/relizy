/** @type {Partial<import("typedoc").TypeDocOptions>} */
export default {
  entryPoints: ['./../src/index.ts'],
  exclude: ['./../src/**/*.spec.ts'],
  plugin: ['typedoc-plugin-markdown', 'typedoc-vitepress-theme'],
  out: './src/typedoc',
  docsRoot: './src',
}
