[relizy](../globals.md) / PublishConfig

# Type Alias: PublishConfig

> **PublishConfig** = `IChangelogConfig`\[`"publish"`\] & `object`

Defined in: [src/types.ts:270](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/types.ts#L270)

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

### packages?

> `optional` **packages**: `string`[]

Glob pattern matching for packages to publish

### registry?

> `optional` **registry**: `string`

NPM registry URL (e.g. `https://registry.npmjs.org/`)

### tag?

> `optional` **tag**: `string`

NPM tag (e.g. `latest`)
