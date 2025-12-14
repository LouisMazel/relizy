[relizy](../globals.md) / generateChangelog

# Function: generateChangelog()

> **generateChangelog**(`__namedParameters`): `Promise`\<`string`\>

Defined in: [src/core/changelog.ts:21](https://github.com/LouisMazel/relizy/blob/16b3fd2aaf30cce7d45f45df9581ca61ca50bf78/src/core/changelog.ts#L21)

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
