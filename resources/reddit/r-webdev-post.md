# Title

> I spent more time releasing my code than writing it. So I built an open-source CLI that handles versioning, changelogs, npm publish, and even Slack/Twitter announcements — in one command.

# Body

Full disclosure: I built this. It's free, open-source, and I'm not selling anything.

Here's a question: how much of your week goes to things that aren't coding? For me, it was releases. Bump versions, write changelogs, publish packages, create GitHub releases, copy-paste the changelog into Slack, draft a tweet... every single time.

I built [Relizy](https://github.com/LouisMazel/relizy) because I wanted to type one command and go grab coffee.

## The problem

I maintain a monorepo with 12+ packages. Every release was the same nightmare:

1. Figure out which packages actually changed
2. Determine the right semver bump for each
3. Update versions in every `package.json`
4. Update workspace dependency references
5. Generate changelogs (for each package AND the root)
6. Commit, tag, push
7. Publish each package to npm in the right order
8. Create a GitHub release
9. Notify the team on Slack

Miss one step? Congrats, you just published `v2.1.0` with a dependency on `@yourscope/core@2.0.0` that doesn't exist on npm yet.

I tried the existing tools:

- **Changesets**: forces you to write a changeset file for every PR. My contributors hated it. Half the PRs were missing changesets.
- **semantic-release**: great for single packages, but the monorepo story is painful. Plugins on plugins on plugins.
- **Lerna**: versioning works, but the release automation is barebones. And the changelogs? Ugly out of the box — the default format is a wall of commit hashes, and the presets aren't much better. You can customize it, but you're fighting the tool at every step. Plus the project has had a rocky maintenance history.
- **release-it**: generic by design. Getting monorepo releases right required a ton of custom plugin config.

None of them gave me what I wanted: **commit, run one command, go grab coffee.**

## What I built

[**Relizy**](https://github.com/LouisMazel/relizy) — a release automation CLI for monorepos and single packages.

The entire setup is one config file:

```typescript
import { defineConfig } from 'relizy'

export default defineConfig({
  monorepo: {
    versionMode: 'selective',
    packages: ['packages/*'],
  },
})
```

Then:

```bash
relizy release
```

That's it. One command. It:

- Parses your conventional commits to determine the bump type
- Bumps only the packages that actually changed (selective mode)
- Automatically bumps packages that _depend_ on changed packages (transitive deps!)
- Generates clean, readable changelogs — per-package + root aggregate
- Commits, tags, and pushes
- Publishes to npm in dependency order (handles auth, OTP, dist-tags)
- Creates a GitHub/GitLab release with full changelog body
- Posts release notes to Slack and tweets on X — automatically
- Comments on your PR with the release summary and install commands

**⬇️ INSERER ICI : TERMINAL GIF (asciinema ou vhs) — `relizy release --dry-run` sur un vrai monorepo, 30 secondes max ⬇️**

## The feature that sold me on building this: Selective Versioning

Most monorepo tools give you two choices:

1. **Unified**: bump everything together. Ship `v2.1.0` of a package that literally had zero changes. Your users see a new version, expect something new, find nothing.
2. **Independent**: every package has its own version. Now you're managing 12 independent release cycles. Good luck.

Relizy has a third mode: **selective**.

> Only packages with actual commits get bumped. But when they do, they all share the same version number.

So if `@mylib/core` and `@mylib/utils` changed but `@mylib/cli` didn't:

- `@mylib/core` → `2.1.0` ✅
- `@mylib/utils` → `2.1.0` ✅
- `@mylib/cli` → stays at `2.0.0` ⏭️

And if `@mylib/cli` depends on `@mylib/core`? Relizy detects that and bumps it too. Transitively. Automatically.

## Built-in release announcements (this one's a game changer)

After publishing, your team needs to know. Your users need to know. So what do you do? Copy-paste the changelog into Slack. Draft a tweet. Forget one. Do it again next week.

Relizy has a `social` command baked right into the release pipeline. Configure it once:

```typescript
export default defineConfig({
  social: {
    twitter: {
      enabled: true,
      template: '📣 {{projectName}} {{newVersion}} is out!\n\n{{changelog}}\n\n{{releaseUrl}}',
    },
    slack: {
      enabled: true,
      channel: '#releases',
    },
  },
})
```

Now when you run `relizy release`, it automatically:

- **Tweets on X** with your changelog, auto-truncated to 280 chars
- **Posts to Slack** with rich formatting, action buttons, and the full changelog
- Skips prereleases if you want (`onlyStable: true`)

No Zapier. No GitHub Action that calls another GitHub Action. It's just... part of the release.

## Clean changelogs out of the box

Relizy generates changelogs that are actually readable. Commits grouped by type, with emojis, compare links, and author attribution. No preset hunting, no plugin config. It just looks good.

You can even include commit bodies for detailed entries, or run a format command (`prettier`, `dprint`...) as a post-processing step.

**⬇️ INSERER ICI : SCREENSHOT D'UN CHANGELOG.md GENERE PAR RELIZY ⬇️**

## Other things I'm proud of

**Canary releases from any branch:**

```bash
relizy release --canary
# publishes 2.1.0-canary.a3f4b2c.0 with "canary" dist-tag
```

Perfect for testing PRs before merging.

**Dry run everything:**

```bash
relizy release --minor --dry-run
```

Shows exactly what _would_ happen. No side effects.

**Multiple configs for different workflows:**

```bash
relizy release --config beta    # uses relizy.beta.config.ts
relizy release --config stable  # uses relizy.stable.config.ts
```

**Works with any package manager** — npm, yarn, pnpm, bun. Auto-detected.

**PR comments** — relizy posts a summary comment on your GitHub/GitLab PR with release details, version transitions, and install commands for each package. Your reviewers see exactly what shipped.

**⬇️ INSERER ICI : SCREENSHOT D'UN COMMENTAIRE PR GENERE PAR RELIZY ⬇️**

**Lifecycle hooks** — plug in custom logic at every step: `before:bump`, `success:publish`, `error:release`... Run scripts, trigger pipelines, whatever you need.

**Prerelease support** — alpha, beta, rc, custom preid. Relizy detects when a package "graduates" from prerelease to stable and handles the transition automatically.

## What it's NOT

- Not a monorepo task runner (use Turborepo/Nx for that)
- Not a package manager (use pnpm workspaces)
- Not a CI system — but it works great inside GitHub Actions or GitLab CI

Relizy does one thing: **releases**. And it does it well.

## Tech stack

Built with TypeScript on top of [changelogen](https://github.com/unjs/changelogen) (from the UnJS ecosystem). Uses Commander.js for the CLI, c12 for config loading, and semver for version operations.

## I want your honest feedback

- Does this solve a real problem for you?
- What's missing?
- What would make you switch from your current setup?

The repo: [github.com/LouisMazel/relizy](https://github.com/LouisMazel/relizy)

Docs: [relizy.dev](https://relizy.dev)

Thanks for reading. Happy to answer any questions.
