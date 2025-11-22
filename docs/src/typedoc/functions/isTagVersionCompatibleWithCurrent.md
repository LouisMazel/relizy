[relizy](../globals.md) / isTagVersionCompatibleWithCurrent

# Function: isTagVersionCompatibleWithCurrent()

> **isTagVersionCompatibleWithCurrent**(`tagVersion`, `currentVersion`): `boolean`

Defined in: [src/core/version.ts:757](https://github.com/LouisMazel/relizy/blob/a435282e06e69dcbf3309f6ea7f68f7c7432183d/src/core/version.ts#L757)

Checks if a tag's version is compatible with the current version.
A tag is compatible if its major version is less than or equal to the current major version.

This prevents accidentally using tags from future major versions (e.g., v5.0.0-beta.0)
when bumping a current stable version (e.g., 4.1.1 → 4.1.2).

## Parameters

### tagVersion

`string`

The semantic version extracted from the tag

### currentVersion

`string`

The current package version

## Returns

`boolean`

true if the tag version's major is <= current major version

## Example

```ts
isTagVersionCompatibleWithCurrent('4.1.1', '4.1.0') // true - same major
isTagVersionCompatibleWithCurrent('5.0.0-beta.0', '4.1.1') // false - newer major
isTagVersionCompatibleWithCurrent('3.9.9', '4.1.1') // true - older major
```
