import { defineConfig } from '@maz-ui/eslint-config'

export default defineConfig({
  formatters: true,
  typescript: true,
  sonarjs: true,
  vue: true,
  ignores: [
    'src/typedoc/**',
    '.vitepress/cache',
    '.vitepress/dist',
    'node_modules',
  ],
}, {
  rules: {
    'sonarjs/no-os-command-from-path': 'off',
    'sonarjs/os-command': 'off',
  },
}, {
  files: ['**/*.yml'],
  rules: {
    'sonarjs/no-commented-code': 'off',
  },
}, {
  files: ['**/*.md/**'],
  rules: {
    'sonarjs/no-commented-code': 'off',
    // The examples of the docs stay on one line, as written
    'antfu/reasonable-newline': 'off',
  },
})
