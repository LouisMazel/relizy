import { defineConfig } from '@maz-ui/eslint-config'

export default defineConfig({
  formatters: true,
  typescript: true,
  sonarjs: true,
  vue: false,
  ignores: ['./docs/**'],
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
  },
})
