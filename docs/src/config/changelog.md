# Changelog Configuration

Customize changelog generation.

## Commit Types

Customize how commit types appear in changelogs:

```ts
export default {
  types: {
    feat: { title: '🎉 New Features', semver: 'minor' },
    fix: { title: '🔧 Bug Fixes', semver: 'patch' },
    perf: { title: '⚡ Performance', semver: 'patch' },
    docs: { title: '📖 Documentation', semver: 'patch' },
    style: { title: '💄 Styling', semver: 'patch' },
    refactor: { title: '🔨 Refactors', semver: 'patch' },
    test: { title: '🧪 Tests', semver: 'patch' },
    build: { title: '📦 Build', semver: 'patch' },
    ci: { title: '🤖 CI/CD', semver: 'patch' },
    chore: { title: '🧹 Chores', semver: 'patch' },
  },
}
```

## Exclude Authors

Filter out commits from specific authors:

```ts
export default {
  excludeAuthors: [
    'dependabot[bot]',
    'renovate[bot]',
    'github-actions[bot]',
  ],
}
```

## Repository URLs

Set custom GitHub/GitLab URLs:

```ts
export default {
  github: 'user/repo',
  // or
  gitlab: 'user/repo',
}
```

## Output Format

```ts
export default {
  output: 'CHANGELOG.md', // or 'json'
}
```

## Complete Example

```ts
export default {
  types: {
    feat: { title: '✨ Features', semver: 'minor' },
    fix: { title: '🐛 Fixes', semver: 'patch' },
  },
  excludeAuthors: ['dependabot[bot]'],
  github: 'myorg/myrepo',
  output: 'CHANGELOG.md',
}
```
