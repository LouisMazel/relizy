import type { UserConfig } from '@commitlint/types'

export default <UserConfig> {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        'docs',
        'release',
        'deps',
        'relizy',
      ],
    ],
    'subject-case': [2, 'never', ['upper-case', 'pascal-case', 'start-case']],
    'header-max-length': [2, 'always', 500],
  },
}
