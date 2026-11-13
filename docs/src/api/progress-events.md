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

The commands a command runs (`bump` inside `release`) share its listener, and their steps are the `progress` of the step of the parent: one `release` gives one `command:start`. A listener can be async (`void | Promise<void>`): it is not awaited, and a listener that throws or rejects does not stop the run (never an unhandled rejection). Several runs can follow each other at the same time (several projects of an application): each run gets its own events, and what its steps did never mixes with another run. The API leaves the logs to the [logger](./usage.md#shared-options): there is no `log` event out of the CLI renderers.

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

A prompt cannot be answered (it would write on stdout): `release` and `bump` without `--yes` fail at once with what to do, as without a terminal, and any other prompt (a one-time password: pass `--otp`) fails the same way. The exit code is the one of the command (`0`, or `1` on an error: the `command:error` event comes before).

## Events

Every event has `type` and `time` (milliseconds since the epoch).

| `type`             | When                                                                | Fields                                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `command:start`    | The command starts                                                  | `command` (`release`, `bump`...), `title`, `dryRun`                                                                                                                            |
| `step:start`       | A step starts                                                       | `step`, `label` (what it does)                                                                                                                                                 |
| `step:done`        | A step succeeded                                                    | `step`, `label`, `message` (what it did), `durationMs`, `details`, `data` (what it did, see [Step data](#step-data))                                                           |
| `step:failed`      | A step failed                                                       | `step`, `label`, `message`, `durationMs`, `fatal` (`false` when the release goes on: a post, a provider release), `cancelled`, `data` (what it did before failing, when known) |
| `step:skipped`     | A step is left out                                                  | `step`, `label`, `reason`: the flag of the run (`--no-publish`), `canary`, or the option of the config (`release.social: false`)                                               |
| `step:item`        | A thing of the running step starts or ends: a package, a platform   | `step` (`publish`, `social`), `item`: `name`, `status` (`running`, `done`, `failed`, `skipped`), `detail`, `url`                                                               |
| `progress`         | What the running step does now                                      | `message`, `ai` (done by AI)                                                                                                                                                   |
| `note`             | What a step did, shown under its result                             | `message`, `ai`                                                                                                                                                                |
| `link`             | What a step created: a release, an npm page, a post, the PR comment | `step` (`publish`, `provider-release`, `social`, `pr-comment`), `label`, `url`                                                                                                 |
| `preview`          | What a dry run generated (changelog, release notes, post)           | `title`, `meta`, `content`                                                                                                                                                     |
| `log`              | A log of relizy (the CLI renderers only, not the debug ones)        | `level`, `message`                                                                                                                                                             |
| `release:finish`   | `release` is over                                                   | `report`: the [report of the release](./../config/release.md#report)                                                                                                           |
| `command:complete` | Another command is over                                             | `message`, `nothing`, `failed`, `warnings`, `links`, `durationMs`                                                                                                              |
| `command:error`    | The command failed, or its prompt was refused                       | `message`, `failedStep`, `cancelled`, `report` (a release that failed)                                                                                                         |

`step` is the name of the step as the [hooks](./../config/hooks.md) name it: `checks`, `bump`, `changelog`, `publish`, `commit-and-tag`, `push`, `provider-release`, `social`, `pr-comment`, and `merge-preview` for the steps of [`mergePreview()`](./merge-preview.md). It is missing for a step that has no hook. The steps of the other commands (`relizy publish` alone: `publish`) use the same names.

A name can come with several `step:start`/`step:done` pairs: `relizy publish` alone gives three `publish` pairs (checking the packages, building them with `publish.buildCmd`, publishing them, only the last one with `data`), and `mergePreview()` one `merge-preview` pair per part of the preview (the merge, the release, the checks, the comment, the commit status). Within `release`, `publish` is one pair.

The types are exported: `RelizyEvent` (the union), `RelizyEventListener`, one type per event (`StepDoneEvent`, `StepItemEvent`...), and the data of each step (`StepDataMap`, `PublishStepData`...).

## Step data

`step:done` (and `step:failed` when the step knows what it did before failing) carries `data`, what the step did as data, typed by `step`: an interface renders each step without parsing its `message`.

| `step`             | `data`                                                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `checks`           | `checks`: `{ name, status, message? }` per safety check (`provider-release`, `publish`, `social`, `branch`, `push`), `status` `passed`, `failed` or `skipped`                              |
| `bump`             | `packages`: `{ name, oldVersion, newVersion, group? }`                                                                                                                                     |
| `changelog`        | `files`: `{ file, packageName, content }`, the file relative to the project and the entry added (previewed in dry-run)                                                                     |
| `publish`          | `registry`, `tag` (the dist-tag), `dryRun`, `packages`: `{ name, version, status, url?, reason? }` in publish order, `status` `published`, `skipped` (already on the registry) or `failed` |
| `commit-and-tag`   | `commit`: `{ hash?, message }` (no hash in dry-run), `tags`                                                                                                                                |
| `push`             | `remote`, `branch`, `tags` (the tags were pushed)                                                                                                                                          |
| `provider-release` | `provider`, `releases`: `{ tag, name?, url? }`                                                                                                                                             |
| `social`           | `dryRun`, `posts`: `{ platform, status, url?, reason? }`, `status` `posted`, `skipped` or `failed`                                                                                         |
| `pr-comment`       | `posted`, `number?`, `url?`                                                                                                                                                                |

With `dryRun: true` (the run is a simulation), `published` and `posted` mean what the run would do: nothing was published nor posted, and the packages have no `url`.

```ts
import { release } from 'relizy'

await release({
  onProgress(event) {
    if (event.type === 'step:item') {
      console.log(event.step, event.item.name, event.item.status)
    }

    if (event.type === 'step:done' && event.step === 'publish') {
      for (const pkg of event.data?.packages ?? []) {
        console.log(pkg.name, pkg.version, pkg.status, pkg.url)
      }
    }
  },
})
```

## Answering from the application

The prompts of the terminal have their option, for an application asking in its own interface:

- `onConfirm(plan)` ([`release()`](./release.md), [`bump()`](./bump.md)) validates the computed versions before anything is written; `false` cancels the run as a refused prompt. An error it throws fails the run (`cancelled: false`, nothing written): throw a `RelizyCancelError` to cancel instead. It is not called when the versions are confirmed in advance: `yes`, or `bump.yes: true` in the config or the profile. Without `onConfirm` nor `yes`, the terminal asks
- `onOtp({ registry, packageName })` ([`release()`](./release.md), [`publish()`](./publish.md)) gives the one-time password the registry asks for, as a string or a promise. An empty password (or none) cancels the publish as a refused prompt (a `RelizyCancelError`, `cancelled: true`); the packages published before stay published

```ts
import { release } from 'relizy'

await release({
  // Asked once the versions are computed, nothing written yet
  onConfirm: plan => showPlanInTheApp(plan.packages),
  onOtp: ({ registry }) => askTheOtpInTheApp(registry),
  onProgress: event => renderInTheApp(event),
})
```

## See Also

- [Programmatic API](./usage.md)
- [`previewRelease()`](./preview-release.md), the same steps before the release runs
- [CLI output](./../cli/commands.md#output)
