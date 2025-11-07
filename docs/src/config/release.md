# Release Configuration

Configure release workflow behavior.

## commit

Enable/disable git commits:

```ts
export default {
  release: {
    commit: true,
  },
}
```

## tag

Enable/disable git tags:

```ts
export default {
  release: {
    tag: true,
  },
}
```

## push

Enable/disable git push:

```ts
export default {
  release: {
    push: true,
  },
}
```

## commitMessage

Customize commit message:

```ts
export default {
  release: {
    commitMessage: 'chore(release): v{version}',
  },
}
```

## Complete Example

```ts
export default {
  release: {
    commit: true,
    tag: true,
    push: true,
    commitMessage: 'chore(release): v{version}',
  },
}
```
