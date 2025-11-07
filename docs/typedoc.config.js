/** @type {Partial<import("typedoc").TypeDocOptions>} */
export default {
  entryPoints: ['./../src/index.ts'],
  plugin: ['typedoc-plugin-markdown', 'typedoc-vitepress-theme'],
  out: './src/typedoc',
  docsRoot: './src',
}
