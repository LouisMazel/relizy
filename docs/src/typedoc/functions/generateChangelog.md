[relizy](../globals.md) / generateChangelog

# Function: generateChangelog()

> **generateChangelog**(`__namedParameters`): `Promise`\<`string`\>

Defined in: [src/core/changelog.ts:22](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/core/changelog.ts#L22)

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
