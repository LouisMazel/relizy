# Publish Configuration

Configure NPM publishing.

## access

Set package access level:

```ts
export default {
  publish: {
    access: 'public', // or 'restricted'
  },
}
```

## tag

Set npm dist-tag:

```ts
export default {
  publish: {
    tag: 'latest', // or 'beta', 'next', etc.
  },
}
```

## registry

Use custom npm registry:

```ts
export default {
  publish: {
    registry: 'https://registry.npmjs.org',
  },
}
```

## Complete Example

```ts
export default {
  publish: {
    access: 'public',
    tag: 'latest',
    registry: 'https://registry.npmjs.org',
  },
}
```
