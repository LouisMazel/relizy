# @relizy/core

The building blocks of [relizy](https://relizy.dev), the release automation tool, published on their own: read a workspace, parse and lint conventional commits, compute versions and tags, render changelogs, drive git without a shell, resolve registries and create GitHub and GitLab releases.

The functions take plain parameters (`cwd`, paths, an options object) and do not depend on a configuration file. Those that report what they do accept an optional `logger` (`CoreLogger`, every method optional), silent by default; nothing is written to stdout.

## Installation

```bash
pnpm add @relizy/core
```

Node.js `^22.23.4 || ^24.22.1 || >=26.12.1`, ESM only.

## Usage

### Git

Git runs without a shell, the reads can be cached inside `withGitCache()`:

```ts
import { getCurrentGitBranch, listTags, withGitCache } from '@relizy/core'

const { branch, lastTag } = await withGitCache(async () => ({
  branch: getCurrentGitBranch(process.cwd()),
  lastTag: (await listTags({ cwd: process.cwd() }))[0],
}))
```

### Commits

```ts
import { getGitDiff, parseCommits } from '@relizy/core'

const commits = parseCommits(getGitDiff('v1.0.0', 'HEAD', cwd), { scopeMap: {} })
// [{ type: 'feat', scope: 'ui', description: 'add a button', isBreaking: false, ... }]
```

### Commitlint

```ts
import { lintCommitMessage } from '@relizy/core'

const { valid, problems, suggestion } = await lintCommitMessage('Added a button')
```

### Packages

```ts
import { detectPackageManager, readPackages } from '@relizy/core'

const packages = readPackages({ cwd, patterns: ['packages/*'] })
const packageManager = detectPackageManager(cwd)
```

### Versions

```ts
import { getPackageNewVersion } from '@relizy/core'

getPackageNewVersion({ name: 'my-lib', currentVersion: '1.2.3', releaseType: 'minor', preid: undefined, suffix: undefined })
// '1.3.0'
```

### Tags

```ts
import { getIndependentTag } from '@relizy/core'

getIndependentTag({ name: 'my-lib', version: '1.3.0' })
// 'my-lib@1.3.0'
```

### Changelog

```ts
import { renderChangelog } from '@relizy/core'

const markdown = await renderChangelog({
  commits,
  from: 'v1.0.0',
  to: 'v1.1.0',
  isFirstCommit: false,
  cwd,
  types: { feat: { title: 'Features' }, fix: { title: 'Fixes' } },
  repo: { provider: 'github', repo: 'owner/name' },
})
```

### Registry (npm)

```ts
import { resolveRegistryTargetsForPackage } from '@relizy/core'

const targets = resolveRegistryTargetsForPackage({ name: '@scope/lib' }, {
  registry: 'https://registry.npmjs.org/',
  registries: [{ registry: 'https://npm.example.com/', packageFilter: ['@scope/*'] }],
  buildDefaultTarget: () => ({ registry: 'https://registry.npmjs.org/' }),
})
// the default registry, then npm.example.com
```

### Providers

```ts
import { getRepoConfig } from '@relizy/core'

getRepoConfig('git@github.com:owner/name.git')
// { provider: 'github', domain: 'github.com', repo: 'owner/name' }
```

### CI and utils

```ts
import { getCIName } from '@relizy/core'

getCIName() // 'GitHub Actions', or null outside a CI
```

## API reference

Every export has its signature, options and example in its JSDoc. The same reference, by domain, is in the docs for AI agents shipped with the `relizy` package (`relizy mcp`, tools `search_docs` and `get_doc`, pages `core/*`). The relizy CLI, its configuration and its guides are on [relizy.dev](https://relizy.dev).

## License

MIT
