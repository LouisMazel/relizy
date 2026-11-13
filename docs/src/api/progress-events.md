---
title: Progress events
description: Follow a relizy run without parsing text - the typed events of the onProgress option and of RELIZY_REPORTER=json, one JSON object per line.
keywords: relizy events, onProgress, RELIZY_REPORTER json, ndjson, progress events, step events, follow a release, RelizyEvent
category: API Reference
tags: [api, events, progress, json, cli]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

A program running relizy (an app, a script, a CI wrapper) gets what happens as typed events: a step started, done, failed or skipped, what it does now, the links it created, the logs, the end of the run. The events are the same from the API and from the CLI.

## From Node.js

Every command takes an `onProgress` option, called with each event of the run:

```ts
import type { RelizyEvent } from 'relizy'
import { release } from 'relizy'

const report = await release({
  yes: true,
  profile: 'beta',
  onProgress(event: RelizyEvent) {
    switch (event.type) {
      case 'step:start':
        console.log(`> ${event.label}`)
        break
      case 'step:done':
        console.log(`  ${event.message} (${event.durationMs} ms)`)
        break
      case 'step:failed':
        console.error(`  ${event.label} failed: ${event.message}`)
        break
      case 'link':
        console.log(`  ${event.label}: ${event.url}`)
        break
    }
  },
})
```

The commands a command runs (`bump` inside `release`) share its listener, and their steps are the `progress` of the step of the parent: one `release` gives one `command:start`. A listener that throws does not stop the run. The API leaves the logs to the [logger](./usage.md#shared-options): there is no `log` event out of the CLI renderers.

## From the CLI

`RELIZY_REPORTER=json` writes one JSON event per line on stdout, and nothing else (the logs of relizy before the run starts go to stderr). A parent process reads the lines as they come:

```bash
RELIZY_REPORTER=json relizy release --profile beta --yes
```

```text
{"type":"command:start","command":"release","title":"relizy release","dryRun":false,"time":1794595334759}
{"type":"step:start","step":"bump","label":"Computing the versions","time":1794595334801}
{"type":"step:done","step":"bump","label":"Computing the versions","message":"relizy 1.4.0  →  1.5.0","durationMs":412,"details":[],"time":1794595335213}
{"type":"release:finish","report":{"status":"released","released":true,"version":"1.5.0"},"time":1794595340120}
```

A prompt cannot be answered, so pass `--yes` to `release` and `bump`. The exit code is the one of the command (`0`, or `1` on an error: the `command:error` event comes before).

## Events

Every event has `type` and `time` (milliseconds since the epoch).

| `type`             | When                                                                | Fields                                                                                                                        |
| ------------------ | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `command:start`    | The command starts                                                  | `command` (`release`, `bump`...), `title`, `dryRun`                                                                           |
| `step:start`       | A step starts                                                       | `step`, `label` (what it does)                                                                                                |
| `step:done`        | A step succeeded                                                    | `step`, `label`, `message` (what it did), `durationMs`, `details`                                                             |
| `step:failed`      | A step failed                                                       | `step`, `label`, `message`, `durationMs`, `fatal` (`false` when the release goes on: a post, a provider release), `cancelled` |
| `step:skipped`     | A step is left out                                                  | `step`, `label`, `reason` (`--no-publish`)                                                                                    |
| `progress`         | What the running step does now                                      | `message`, `ai` (done by AI)                                                                                                  |
| `note`             | What a step did, shown under its result                             | `message`, `ai`                                                                                                               |
| `link`             | What a step created: a release, an npm page, a post, the PR comment | `step` (`publish`, `providerRelease`, `social`, `prComment`), `label`, `url`                                                  |
| `preview`          | What a dry run generated (changelog, release notes, post)           | `title`, `meta`, `content`                                                                                                    |
| `log`              | A log of relizy (the CLI renderers only, not the debug ones)        | `level`, `message`                                                                                                            |
| `release:finish`   | `release` is over                                                   | `report`: the [report of the release](./../config/release.md#report)                                                          |
| `command:complete` | Another command is over                                             | `message`, `nothing`, `failed`, `warnings`, `links`, `durationMs`                                                             |
| `command:error`    | The command failed, or its prompt was refused                       | `message`, `failedStep`, `cancelled`, `report` (a release that failed)                                                        |

`step` is the name of the step as the [hooks](./../config/hooks.md) name it: `checks`, `bump`, `changelog`, `publish`, `commit-and-tag`, `push`, `provider-release`, `social`, `pr-comment`. It is missing for a step that has no hook. The steps of the other commands (`relizy publish` alone: `publish`) use the same names.

The types are exported: `RelizyEvent` (the union), `RelizyEventListener`, and one interface per event (`StepDoneEvent`...).

## See Also

- [Programmatic API](./usage.md)
- [`previewRelease()`](./preview-release.md), the same steps before the release runs
- [CLI output](./../cli/commands.md#output)
