[relizy](../globals.md) / extractVersionFromTag

# Function: extractVersionFromTag()

> **extractVersionFromTag**(`tag`, `packageName?`): `string` \| `null`

Defined in: [src/core/version.ts:709](https://github.com/LouisMazel/relizy/blob/dc294c6b88715027ecd2379bf72e0317c5da3413/src/core/version.ts#L709)

Extracts a semantic version from a git tag.
Supports multiple tag formats:
- v1.2.3 → 1.2.3
- 1.2.3 → 1.2.3
- package-name@1.2.3 → 1.2.3
- v1.2.3-beta.0 → 1.2.3-beta.0

## Parameters

### tag

`string`

The git tag to extract version from

### packageName?

`string`

Optional package name for independent mode tags (e.g., "pkg-name@1.2.3")

## Returns

`string` \| `null`

The extracted version string or null if invalid
