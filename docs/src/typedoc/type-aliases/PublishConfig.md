[relizy](../globals.md) / PublishConfig

# Type Alias: PublishConfig

> **PublishConfig** = `IChangelogConfig`\[`"publish"`\] & `object`

Defined in: [src/types.ts:362](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/types.ts#L362)

## Type Declaration

### access?

> `optional` **access**: `"public"` \| `"restricted"`

NPM access level (e.g. `public` or `restricted`)

### buildCmd?

> `optional` **buildCmd**: `string`

Command to build your packages before publishing (e.g. `pnpm build`)

### otp?

> `optional` **otp**: `string`

NPM OTP (e.g. `123456`)

### packageManager?

> `optional` **packageManager**: [`PackageManager`](PackageManager.md)

Package manager (e.g. `pnpm`, `npm`, `yarn` or `bun`)

### packages?

> `optional` **packages**: `string`[]

Glob pattern matching for packages to publish

### registry?

> `optional` **registry**: `string`

NPM registry URL (e.g. `https://registry.npmjs.org/`)

### safetyCheck?

> `optional` **safetyCheck**: `boolean`

Skip safety check

#### Default

```ts
false
```

### tag?

> `optional` **tag**: `string`

NPM tag (e.g. `latest`)

### token?

> `optional` **token**: `string`

NPM token (e.g. `123456`) - only supported for pnpm and npm
