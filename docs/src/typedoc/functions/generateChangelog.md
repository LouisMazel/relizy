[relizy](../globals.md) / generateChangelog

# Function: generateChangelog()

> **generateChangelog**(`__namedParameters`): `Promise`\<`string`\>

Defined in: [src/core/changelog.ts:21](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/core/changelog.ts#L21)

Generate changelog for a specific package

## Parameters

### \_\_namedParameters

#### config

[`ResolvedRelizyConfig`](../type-aliases/ResolvedRelizyConfig.md)

#### dryRun

`boolean`

#### newVersion

`string`

#### pkg

\{ `commits`: `GitCommit`[]; `fromTag?`: `string`; `name`: `string`; `newVersion?`: `string`; \}

#### pkg.commits

`GitCommit`[]

#### pkg.fromTag?

`string`

#### pkg.name

`string`

#### pkg.newVersion?

`string`

## Returns

`Promise`\<`string`\>
