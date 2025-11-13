---
title: Hooks
description: Hooks are lifecycle events that allow you to run custom scripts at specific stages of the release workflow.
keywords: relizy hooks, lifecycle hooks, release hooks, before hooks, after hooks, error hooks, generate changelog hook
category: Configuration
tags: [config, hooks, lifecycle, automation, workflow]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }} They can be either shell commands (strings) or JavaScript/TypeScript functions.

## Hook Types

Relizy provides three types of hooks for each step:

- **`before:<step>`** - Executed before the step starts
- **`success:<step>`** - Executed after the step completes successfully
- **`error:<step>`** - Executed when an error occurs during the step

## Available Steps

Hooks are available for the following steps:

- `bump` - Version bumping
- `changelog` - Changelog generation
- `commit-and-tag` - Git commit and tag creation
- `push` - Push changes to remote repository
- `publish` - Package publication to npm registry
- `provider-release` - Release publication to Git provider (GitHub/GitLab)
- `release` - Full release workflow (only available for `relizy release`)

## Special Hook: `generate:changelog`

The `generate:changelog` hook is unique and allows you to customize the generated changelog content. This hook is executed for **each package's changelog generation and root changelog generation**.

### Parameters

```ts
type GenerateChangelogHook = (
  config: ResolvedRelizyConfig,
  dryRun: boolean,
  params: {
    commits: GitCommit[]
    changelog: string
  }
) => string | void | null | undefined | Promise<string | void | null | undefined>
```

- **`config`** - Resolved Relizy configuration
- **`dryRun`** - Whether the command is running in dry-run mode
- **`params.commits`** - Array of Git commits for the current package
- **`params.changelog`** - The generated changelog content by Relizy

### Return Value

- Return a **string** to replace the generated changelog with your custom content
- Return **`undefined`**, **`void`**, or **`null`** to keep the original generated changelog

### Use Cases

1. **Enhance the changelog** - Add additional information to Relizy's generated changelog
2. **Complete replacement** - Ignore Relizy's output and generate your own changelog from scratch using the commits
3. **AI-powered generation** - Use AI services to generate human-readable changelogs
4. **Custom formatting** - Apply specific formatting rules or templates

### Example

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  hooks: {
    'generate:changelog': async (config, dryRun, { commits, changelog }) => {
      // Use AI to enhance the changelog
      const enhancedChangelog = await generateAIChangelog(commits)
      return enhancedChangelog

      // Or keep the original by returning nothing
      // return undefined
    }
  }
})
```

## Configuration

Hooks are configured in the `hooks` object in your [relizy.config.ts](../guide/installation.md#configuration):

### String Commands

Execute shell commands:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  hooks: {
    'before:bump': 'echo "Starting version bump"',
    'success:bump': 'npm run build',
    'error:bump': 'echo "Version bump failed" && exit 1'
  }
})
```

### Function Hooks

Execute JavaScript/TypeScript functions:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  hooks: {
    'before:bump': (config, dryRun) => {
      console.log('Starting bump with config:', config.monorepo?.versionMode)
      console.log('Dry run mode:', dryRun)
    },
    'success:bump': async (config, dryRun) => {
      // Async operations are supported
      await sendNotification('Version bumped successfully')
    },
    'error:bump': (config, dryRun) => {
      console.error('Bump failed!')
      // You can throw to stop execution
      throw new Error('Critical error during bump')
    }
  }
})
```

## Hook Execution Context

### Parameters

All hooks (except `generate:changelog`) receive:

1. **`config`** (`ResolvedRelizyConfig`) - The resolved configuration object
2. **`dryRun`** (`boolean`) - Whether the command is running in dry-run mode

### Dry Run Mode

When a command is executed with `--dry-run`, hooks are still executed but you should check the `dryRun` parameter to avoid side effects:

```ts
export default defineConfig({
  hooks: {
    'success:publish': (config, dryRun) => {
      if (dryRun) {
        console.log('[dry-run] Would send notification')
        return
      }
      sendNotification('Packages published!')
    }
  }
})
```

## Hooks by Command

Different commands execute different hooks based on their workflow:

### `relizy bump`

- `before:bump`
- `success:bump` | `error:bump`

### `relizy changelog`

- `before:changelog`
- `generate:changelog` (for each package and root changelog)
- `success:changelog` | `error:changelog`

### `relizy publish`

- `before:publish`
- `success:publish` | `error:publish`

### `relizy provider-release`

- `before:provider-release`
- `success:provider-release` | `error:provider-release`

### `relizy release`

The `release` command orchestrates multiple steps and executes hooks for each:

1. `before:release`
2. **Bump** → `before:bump`, (`success:bump` | `error:bump`)
3. **Changelog** → `before:changelog`, `generate:changelog`, (`success:changelog` | `error:changelog`)
4. **Commit and Tag** → `before:commit-and-tag`, (`success:commit-and-tag` | `error:commit-and-tag`)
5. **Push** → `before:push`, (`success:push` | `error:push`)
6. **Publish** → `before:publish`, (`success:publish` | `error:publish`)
7. **Provider Release** → `before:provider-release`, (`success:provider-release` | `error:provider-release`)
8. `success:release` | `error:release`

::: tip
You can disable specific steps with flags like `--no-changelog`, `--no-push`, or `--no-publish`. Hooks for disabled steps won't be executed.
:::

## Practical Examples

### Send Slack Notifications

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  hooks: {
    'success:release': async (config, dryRun) => {
      if (dryRun)
        return

      await fetch('https://hooks.slack.com/services/YOUR/WEBHOOK/URL', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `🚀 New release published!`
        })
      })
    }
  }
})
```

### Run Tests Before Publishing

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  hooks: {
    'before:publish': 'npm run test',
    'error:publish': (config, dryRun) => {
      console.error('❌ Publishing failed, rolling back...')
      // Implement rollback logic
    }
  }
})
```

### Update Documentation

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  hooks: {
    'success:bump': 'npm run docs:generate',
    'success:changelog': 'npm run docs:build'
  }
})
```

### AI-Enhanced Changelog Generation

```ts
import OpenAI from 'openai'
import { defineConfig } from 'relizy'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export default defineConfig({
  hooks: {
    'generate:changelog': async (config, dryRun, { commits, changelog }) => {
      if (dryRun || commits.length === 0) {
        return undefined // Keep original
      }

      const commitMessages = commits
        .map(c => `${c.type}: ${c.message}`)
        .join('\n')

      const response = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [{
          role: 'user',
          content: `Generate a user-friendly changelog entry from these commits:\n${commitMessages}`
        }]
      })

      return response.choices[0].message.content || changelog
    }
  }
})
```

### Deploy After Release

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  hooks: {
    'success:provider-release': async (config, dryRun) => {
      if (dryRun) {
        console.log('[dry-run] Would trigger deployment')
        return
      }

      // Trigger deployment pipeline
      await fetch('https://api.yourci.com/deploy', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.CI_TOKEN}` }
      })
    }
  }
})
```

## Error Handling

When an error hook throws an error or a string command exits with a non-zero code, the entire workflow stops:

```ts
export default defineConfig({
  'error:bump': (config, dryRun) => {
    // Log error details
    console.error('Bump failed, check logs')

    // Stop the workflow
    throw new Error('Critical failure')
  }
})
```

## Best Practices

1. **Check `dryRun`** - Always respect the dry-run flag to avoid side effects during testing
2. **Handle errors gracefully** - Use try-catch blocks in async hooks
3. **Keep hooks fast** - Long-running hooks slow down the release process
4. **Use async/await** - For asynchronous operations, always return promises
5. **Log appropriately** - Use console.log/error for visibility during execution
6. **Avoid blocking operations** - Don't use hooks for interactive prompts

## TypeScript Types

```ts
type HookType = 'before' | 'success' | 'error'
type HookStep
  = | 'bump'
    | 'changelog'
    | 'commit-and-tag'
    | 'provider-release'
    | 'publish'
    | 'push'

type HookConfig = {
  [K in `${HookType}:${HookStep}`]?:
    | string
    | ((config: ResolvedRelizyConfig, dryRun: boolean) => any)
} & {
  'generate:changelog'?: (
    config: ResolvedRelizyConfig,
    dryRun: boolean,
    params: {
      commits: GitCommit[]
      changelog: string
    }
  ) => string | void | null | undefined | Promise<string | void | null | undefined>
}
```
