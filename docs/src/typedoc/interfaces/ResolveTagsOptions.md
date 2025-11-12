[relizy](../globals.md) / ResolveTagsOptions

# Interface: ResolveTagsOptions\<VM, S, Package, NewVersion, CurrentVersion\>

Defined in: [src/core/tags.ts:165](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/core/tags.ts#L165)

## Type Parameters

### VM

`VM` *extends* [`VersionMode`](../type-aliases/VersionMode.md)

### S

`S` *extends* [`Step`](../type-aliases/Step.md)

### Package

`Package` = `VM` *extends* `"independent"` ? [`PackageInfo`](PackageInfo.md) : `undefined`

### NewVersion

`NewVersion` = `S` *extends* `"bump"` \| `"changelog"` ? `undefined` : `string`

### CurrentVersion

`CurrentVersion` = `S` *extends* `"bump"` \| `"changelog"` ? `string` : `undefined`

## Properties

### config

> **config**: [`ResolvedRelizyConfig`](../type-aliases/ResolvedRelizyConfig.md)

Defined in: [src/core/tags.ts:172](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/core/tags.ts#L172)

***

### currentVersion

> **currentVersion**: `CurrentVersion`

Defined in: [src/core/tags.ts:176](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/core/tags.ts#L176)

***

### logLevel

> **logLevel**: `"error"` \| `"default"` \| `"silent"` \| `"warning"` \| `"normal"` \| `"debug"` \| `"trace"` \| `"verbose"`

Defined in: [src/core/tags.ts:178](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/core/tags.ts#L178)

***

### newVersion

> **newVersion**: `NewVersion`

Defined in: [src/core/tags.ts:177](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/core/tags.ts#L177)

***

### pkg

> **pkg**: `Package`

Defined in: [src/core/tags.ts:175](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/core/tags.ts#L175)

***

### step

> **step**: `S`

Defined in: [src/core/tags.ts:174](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/core/tags.ts#L174)

***

### versionMode

> **versionMode**: `VM`

Defined in: [src/core/tags.ts:173](https://github.com/LouisMazel/relizy/blob/00a8c3756a8e1c3653bf15cc6263696f62d24f68/src/core/tags.ts#L173)
