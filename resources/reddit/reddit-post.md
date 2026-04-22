# Reddit Post: Relizy Launch

## Posting Strategy

**Target subreddits (post 1-2 days apart, customize each):**

- r/javascript (primary - 2.1M members)
- r/node (secondary - 300K+)
- r/webdev (tertiary - 3.1M)
- r/opensource (showcase-friendly)

**Best posting time:** Tuesday or Wednesday, 7-9 AM EST (12-14h UTC)

**Before posting:**

1. Make sure your Reddit account has recent activity in these subs (comment genuinely for 2+ weeks)
2. Record a **terminal GIF** (use [asciinema](https://asciinema.org/) or [vhs](https://github.com/charmbracelet/vhs)) showing `relizy release --dry-run` on a real monorepo. This is THE biggest engagement booster.
3. Take a screenshot of a generated changelog + GitHub release

**Screenshots to prepare:**

- [ ] Terminal recording of `relizy release --dry-run` (30 seconds max) — **THE most important visual**
- [ ] A generated CHANGELOG.md showing the clean, emoji-organized output (insert at `<!-- 📸 INSERT CHANGELOG SCREENSHOT HERE -->`)
- [ ] A GitHub Release page created by relizy
- [ ] A Slack message posted by relizy (rich block format with buttons)
- [ ] A PR comment posted by relizy showing version transitions and install commands
- [ ] The `relizy.config.ts` file (show how minimal it is)
- [ ] Before/after: manual release script vs relizy config

---

## Variants by Subreddit

### 🎯 r/javascript (Day 1 — primary target)

**Title:**

> Our release process was 47 manual steps across 12 packages. I replaced it with `relizy release`.

**Intro (replace the first paragraph of the post body):**

Use the standard intro below as-is. This sub loves technical deep-dives with real pain points. The selective versioning and dependency graph sections will resonate most here.

---

### 🟢 r/node (Day 3 — Node/npm angle)

**Title:**

> Publishing 12 npm packages in the right order with correct cross-dependencies was hell. I built a CLI to automate the entire flow.

**Intro (replace the first paragraph):**

Full disclosure: I built this. It's free, open-source, and I'm not selling anything. I just want honest feedback from people who actually publish npm packages.

If you maintain multiple npm packages in a monorepo, you know the pain: publish `@scope/core` before `@scope/cli`, or your users get a broken install. Update every `package.json` cross-dependency by hand. Handle npm OTP prompts one by one. Pray you didn't forget a package.

I built [Relizy](https://github.com/LouisMazel/relizy) to make this a single command.

**Engagement angle:** Focus on npm publishing order, OTP handling, dist-tags, workspace dependency resolution. These are Node-specific pains.

---

### 🌐 r/webdev (Day 5 — broader audience, DX angle)

**Title:**

> I spent more time releasing my code than writing it. So I built an open-source CLI that handles versioning, changelogs, npm publish, and even Slack/Twitter announcements — in one command.

**Intro (replace the first paragraph):**

Full disclosure: I built this. It's free, open-source, and I'm not selling anything.

Here's a question: how much of your week goes to things that aren't coding? For me, it was releases. Bump versions, write changelogs, publish packages, create GitHub releases, copy-paste the changelog into Slack, draft a tweet... every single time.

I built [Relizy](https://github.com/LouisMazel/relizy) because I wanted to type one command and go grab coffee.

**Engagement angle:** Focus on developer experience and time savings. r/webdev is broader — less monorepo-savvy, more interested in "how does this save me time?" Lead with the social/Slack feature and the changelog quality. Less emphasis on the selective versioning internals.

---

### 💚 r/opensource (Day 7 — community angle)

**Title:**

> I open-sourced my release automation tool after using it internally for a year. Looking for feedback and contributors.

**Intro (replace the first paragraph):**

I've been building a release CLI called [Relizy](https://github.com/LouisMazel/relizy) to solve a problem I kept hitting: releasing multiple packages from a monorepo is way too many manual steps.

After using it on my own projects for a while, I want to get it in front of other maintainers. I'm looking for:

- **Honest feedback** — what's missing? What would you need before adopting it?
- **Edge cases** — what weird monorepo setups should I support?
- **Contributors** — if this solves a real problem for you and you want to help shape it

Here's what it does and why I built it:

**Engagement angle:** Frame it as a community story. Ask for contributions. Mention specific areas where you want help (docs, tests, new provider integrations). End with "what would you need before using this?" instead of "what's missing?"

---

## Post Title (reference — used by r/javascript variant)

> Our release process was 47 manual steps across 12 packages. I replaced it with `relizy release`.

---

## Post Body (shared — swap intro per variant above)

---

**Full disclosure: I built this. It's free, open-source, and I'm not selling anything. I just want honest feedback from people who deal with the same pain.**

### The problem

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

### What I built

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

<!-- 📸 INSERT TERMINAL GIF HERE -->

### The feature that sold me on building this: Selective Versioning

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

### Built-in release announcements (this one's a game changer)

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

### Clean changelogs out of the box

Relizy generates changelogs that are actually readable. Commits grouped by type, with emojis, compare links, and author attribution. No preset hunting, no plugin config. It just looks good.

You can even include commit bodies for detailed entries, or run a format command (`prettier`, `dprint`...) as a post-processing step.

<!-- 📸 INSERT CHANGELOG SCREENSHOT HERE — show a generated CHANGELOG.md -->

### Other things I'm proud of

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

**Lifecycle hooks** — plug in custom logic at every step: `before:bump`, `success:publish`, `error:release`... Run scripts, trigger pipelines, whatever you need.

**Prerelease support** — alpha, beta, rc, custom preid. Relizy detects when a package "graduates" from prerelease to stable and handles the transition automatically.

### What it's NOT

- Not a monorepo task runner (use Turborepo/Nx for that)
- Not a package manager (use pnpm workspaces)
- Not a CI system — but it works great inside GitHub Actions or GitLab CI

Relizy does one thing: **releases**. And it does it well.

### Tech stack

Built with TypeScript on top of [changelogen](https://github.com/unjs/changelogen) (from the UnJS ecosystem). Uses Commander.js for the CLI, c12 for config loading, and semver for version operations.

### I want your honest feedback

- Does this solve a real problem for you?
- What's missing?
- What would make you switch from your current setup?

The repo: [github.com/LouisMazel/relizy](https://github.com/LouisMazel/relizy)
Docs: [relizy.pages.dev](https://relizy.pages.dev)

Thanks for reading. Happy to answer any questions.

---

## Engagement Playbook (for after posting)

1. **Be present for the first 2 hours.** Reply to every comment within minutes.
2. **Never ask for GitHub stars.** Ask for feedback, criticism, and feature requests.
3. **If someone mentions a competing tool**, don't bash it. Say "I used X for a while too — here's specifically where it fell short for my use case..."
4. **If someone finds a bug or edge case**, thank them genuinely and open an issue on the spot.
5. **Pin a comment** with a quick FAQ if the same questions come up.
6. **Don't cross-post the same day.** Wait 2-3 days between subreddits. Customize the angle for each sub.
7. **Follow up on Hacker News** 3-5 days later with a "Show HN" post (different angle, shorter).
