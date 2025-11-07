[relizy](../globals.md) / PublishConfig

# Type Alias: PublishConfig

> **PublishConfig** = `IChangelogConfig`\[`"publish"`\] & `object`

Defined in: [src/types.ts:281](https://github.com/LouisMazel/relizy/blob/6094991aea4ffff9cbc685f08c1d8aa7cd9db591/src/types.ts#L281)

## Type Declaration

### access?

> `optional` **access**: `"public"` \| `"restricted"`

NPM access level (e.g. `public` or `restricted`)

#### Default

```ts
undefined
```

### buildCmd?

> `optional` **buildCmd**: `string`

Command to build your packages before publishing (e.g. `pnpm build`)

#### Default

```ts
undefined
```

### otp?

> `optional` **otp**: `string`

NPM OTP (e.g. `123456`)

#### Default

```ts
undefined
```

### packages?

> `optional` **packages**: `string`[]

Glob pattern matching for packages to publish

#### Default

```ts
undefined
```

### registry?

> `optional` **registry**: `string`

NPM registry URL (e.g. `https://registry.npmjs.org/`)

#### Default

```ts
undefined
```

### tag?

> `optional` **tag**: `string`

NPM tag (e.g. `latest`)

#### Default

```ts
undefined
```
