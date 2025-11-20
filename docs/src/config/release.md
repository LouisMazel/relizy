---
title: Release Configuration
description: Configure release workflow behavior.
keywords: release config, workflow config, git commit config, release automation, release settings
category: Configuration
tags: [config, release, workflow, automation]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## commit

Enable/disable git commits:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  release: {
    commit: true,
  },
})
```

## push

Enable/disable git push of commit and tags:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  release: {
    push: true,
  },
})
```

## changelog

Enable/disable changelog generation:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  release: {
    changelog: true,
  },
})
```

## clean

Enable/disable git clean:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  release: {
    clean: true,
  },
})
```

## noVerify

Enable/disable git --no-verify flag:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  release: {
    noVerify: true,
  },
})
```

## publish

Enable/disable npm publish:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  release: {
    publish: true,
  },
})
```

## gitTag

Enable/disable git tag push:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  release: {
    gitTag: true,
  },
})
```

## Complete Example

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  release: {
    commit: true,
    changelog: true,
    clean: true,
    noVerify: false,
    publish: true,
    release: true,
    push: true,
    gitTag: true,
  },
})
```
