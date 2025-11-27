[relizy](../globals.md) / shouldFilterPrereleaseTags

# Function: shouldFilterPrereleaseTags()

> **shouldFilterPrereleaseTags**(`currentVersion`, `graduating`): `boolean`

Defined in: [src/core/version.ts:693](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/core/version.ts#L693)

Determines if prerelease tags should be filtered out when searching for tags.
Returns true when the current version is stable AND we're not graduating to stable.

This prevents beta/prerelease tags from being used as the base for stable version bumps.

## Parameters

### currentVersion

`string`

### graduating

`boolean`

## Returns

`boolean`

## Example

```ts
shouldFilterPrereleaseTags('4.1.1', false) // true - stable version, not graduating
shouldFilterPrereleaseTags('4.1.1-beta.0', true) // false - graduating to stable
shouldFilterPrereleaseTags('4.1.1-beta.0', false) // false - prerelease version
```
