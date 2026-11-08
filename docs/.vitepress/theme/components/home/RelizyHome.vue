<script lang="ts" setup>
import { MazArrowRight } from '@maz-ui/icons/raw/MazArrowRight'
import { MazGithub as MazGithubRaw } from '@maz-ui/icons/raw/MazGithub'
import { MazBeaker } from '@maz-ui/icons/static/MazBeaker'
import { MazChatBubbleLeftRight } from '@maz-ui/icons/static/MazChatBubbleLeftRight'
import { MazCheckBadge } from '@maz-ui/icons/static/MazCheckBadge'
import { MazCloudArrowUp } from '@maz-ui/icons/static/MazCloudArrowUp'
import { MazCodeBracket } from '@maz-ui/icons/static/MazCodeBracket'
import { MazCommandLine } from '@maz-ui/icons/static/MazCommandLine'
import { MazCpuChip } from '@maz-ui/icons/static/MazCpuChip'
import { MazCube } from '@maz-ui/icons/static/MazCube'
import { MazDocumentText } from '@maz-ui/icons/static/MazDocumentText'
import { MazEye } from '@maz-ui/icons/static/MazEye'
import { MazGithub } from '@maz-ui/icons/static/MazGithub'
import { MazLockClosed } from '@maz-ui/icons/static/MazLockClosed'
import { MazLogoNpm } from '@maz-ui/icons/static/MazLogoNpm'
import { MazLogoTwitter } from '@maz-ui/icons/static/MazLogoTwitter'
import { MazMegaphone } from '@maz-ui/icons/static/MazMegaphone'
import { MazRocketLaunch } from '@maz-ui/icons/static/MazRocketLaunch'
import { MazShieldCheck } from '@maz-ui/icons/static/MazShieldCheck'
import { MazSparkles } from '@maz-ui/icons/static/MazSparkles'
import { MazSquares2x2 } from '@maz-ui/icons/static/MazSquares2x2'
import { MazTag } from '@maz-ui/icons/static/MazTag'
import MazBadge from 'maz-ui/components/MazBadge'
import MazBtn from 'maz-ui/components/MazBtn'
import MazCardSpotlight from 'maz-ui/components/MazCardSpotlight'
import MazCodeHighlight from 'maz-ui/components/MazCodeHighlight'
import MazTabsBar from 'maz-ui/components/MazTabsBar'
import { ref } from 'vue'
import RelizyTerminal from '../terminal/RelizyTerminal.vue'
import TerminalWindow from '../terminal/TerminalWindow.vue'
import HomeContributors from './HomeContributors.vue'
import HomeCopyCommand from './HomeCopyCommand.vue'
import HomeFeatureCard from './HomeFeatureCard.vue'
import HomeModes from './HomeModes.vue'

/**
 * The homepage of the docs
 */

const pipeline = [
  { icon: MazTag, title: 'Versions', text: 'From your Conventional Commits, dependents included', href: '/cli/bump' },
  { icon: MazDocumentText, title: 'Changelogs', text: 'One per package, and the root one', href: '/guide/changelog' },
  { icon: MazCube, title: 'Publish', text: 'npm, pnpm, yarn or bun, any registry', href: '/cli/publish' },
  { icon: MazCodeBracket, title: 'Commit & tag', text: 'The release commit and its tags', href: '/config/commit-templates' },
  { icon: MazCloudArrowUp, title: 'Push', text: 'Guarded against a stale branch', href: '/config/release' },
  { icon: MazRocketLaunch, title: 'Releases', text: 'GitHub or GitLab, notes rewritten by AI', href: '/cli/provider-release' },
  { icon: MazMegaphone, title: 'Announce', text: 'One post on X, on Slack, on Teams', href: '/guide/social-media' },
  { icon: MazChatBubbleLeftRight, title: 'PR comment', text: 'The summary of the release', href: '/guide/pr-comment' },
]

const ecosystem = [
  { name: 'npm', icon: MazLogoNpm },
  { name: 'pnpm' },
  { name: 'yarn' },
  { name: 'bun' },
  { name: 'GitHub', icon: MazGithub },
  { name: 'GitLab' },
  { name: 'X', icon: MazLogoTwitter },
  { name: 'Slack' },
  { name: 'Microsoft Teams' },
  { name: 'Claude Code', icon: MazSparkles },
  { name: 'AI SDK', icon: MazSparkles },
]

/** The config shown on the page */
const configCode = `import { defineConfig } from 'relizy'

export default defineConfig({
  monorepo: {
    versionMode: 'selective',
    packages: ['packages/*'],
  },
  ai: {
    providerRelease: { enabled: true },
  },
  social: {
    twitter: { enabled: true },
    slack: { enabled: true },
    teams: { enabled: true },
  },
})`

/** The release job of the CI, shown on the page */
const ciTabs = [{ label: 'GitHub Actions' }, { label: 'GitLab CI' }]
const ciTab = ref(1)

const ciSnippets = [
  {
    file: '.github/workflows/release.yml',
    code: `jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      id-token: write
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - id: release
        uses: relizy/action@v2
        with:
          release-type: \${{ inputs.release }}
      - if: steps.release.outputs.released == 'true'
        run: ./deploy.sh \${{ steps.release.outputs.version }}`,
  },
  {
    file: '.gitlab-ci.yml',
    code: `include:
  - component: gitlab.com/relizy/relizy/release@2
    inputs:
      when: on_success

deploy:
  stage: deploy
  needs: [release]
  # The rules of the release job
  rules:
    - if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH && $CI_COMMIT_MESSAGE !~ /^chore\\(release\\): /'
  script:
    - if [ "$RELIZY_RELEASED" = "true" ]; then ./deploy.sh "$RELIZY_VERSION"; fi`,
  },
]

const ciFeatures = [
  { title: 'Set up', text: 'Node.js, your package manager and your dependencies, from the lockfile.' },
  { title: 'Tokens', text: 'One input per token, npm trusted publishing without any.' },
  { title: 'Outputs', text: 'The version, the tags and the links, ready for the next steps.' },
]
</script>

<template>
  <div class="relative overflow-hidden text-foreground">
    <!-- Hero -->
    <section class="relative isolate px-6 pt-16 pb-12 tab-m:pt-24">
      <div aria-hidden="true" class="absolute inset-0 -z-1 bg-[linear-gradient(to_right,var(--maz-divider)_1px,transparent_1px),linear-gradient(to_bottom,var(--maz-divider)_1px,transparent_1px)] bg-size-[4.5rem_4.5rem] opacity-60 mask-[radial-gradient(ellipse_60%_55%_at_50%_0%,var(--maz-foreground),transparent)]" />
      <div aria-hidden="true" class="absolute -top-32 left-1/2 -z-1 h-112 w-4xl -translate-x-1/2 rounded-full bg-linear-to-r from-primary/30 via-secondary/20 to-primary/10 blur-3xl" />

      <div class="mx-auto flex max-w-5xl flex-col items-center text-center">
        <a href="/guide/migration-v2" class="animate-rise">
          <MazBadge color="primary" pastel class="gap-2">
            <span class="font-semibold">v2</span>
            <span class="text-foreground/80">New output, dry-run previews and release summaries</span>
            <span aria-hidden="true">→</span>
          </MazBadge>
        </a>

        <h1 class="mt-8 animate-rise text-4xl leading-[1.05] font-extrabold tracking-[-0.035em] text-balance [animation-delay:80ms] tab-m:text-5xl lap-m:text-6xl">
          Ship every release
          <span class="block bg-linear-to-r from-primary to-secondary bg-clip-text pb-2 text-transparent">in one command.</span>
        </h1>

        <p class="mt-6 max-w-2xl animate-rise text-lg leading-relaxed text-pretty text-muted [animation-delay:160ms] tab-m:text-xl">
          For open-source libraries, monorepos and private apps. Relizy reads your commits and does the rest: versions, changelogs, npm, git tags, GitHub and GitLab releases, posts and PR comments, from your terminal or your CI.
        </p>

        <div class="mt-10 flex animate-rise flex-wrap items-center justify-center gap-3 [animation-delay:240ms]">
          <MazBtn href="/guide/getting-started" size="lg" :end-icon="MazArrowRight">
            Get started
          </MazBtn>
          <MazBtn href="https://github.com/LouisMazel/relizy" size="lg" color="contrast" outlined :start-icon="MazGithubRaw">
            Star on GitHub
          </MazBtn>
        </div>

        <div class="mt-6 animate-rise [animation-delay:320ms]">
          <HomeCopyCommand command="pnpm add -D relizy" />
        </div>
      </div>
    </section>

    <!-- Terminal -->
    <section class="relative px-6 pb-24">
      <RelizyTerminal />
    </section>

    <!-- Ecosystem -->
    <section class="border-y border-divider bg-surface/40 px-6 py-10">
      <p class="text-center text-sm text-muted">
        Works with the tools of your release
      </p>
      <ul class="mx-auto mt-6 flex max-w-5xl flex-wrap items-center justify-center gap-x-8 gap-y-4">
        <li v-for="tool in ecosystem" :key="tool.name" class="flex items-center gap-2 text-base font-semibold text-muted transition-colors duration-(--duration-fast) hover:text-foreground">
          <component :is="tool.icon" v-if="tool.icon" class="size-5" />
          {{ tool.name }}
        </li>
      </ul>
    </section>

    <!-- Pipeline -->
    <section class="px-6 py-24 tab-m:py-32">
      <div class="mx-auto max-w-6xl">
        <div class="mx-auto max-w-3xl text-center">
          <p class="eyebrow">
            The whole release
          </p>
          <h2 class="section-title">
            Eight steps, one command, zero rituals.
          </h2>
          <p class="mt-4 text-lg text-muted">
            Each step can run alone, be skipped or hooked. Relizy checks the tokens, the registry and the branch before writing anything.
          </p>
        </div>

        <ol class="relative mt-16 grid gap-4 tab-m:grid-cols-2 lap-s:grid-cols-4">
          <li v-for="(step, index) in pipeline" :key="step.title">
            <MazCardSpotlight color="primary" class="size-full" content-class="h-full">
              <a :href="step.href" class="group flex h-full flex-col">
                <div class="flex items-center gap-3">
                  <span class="inline-flex size-9 items-center justify-center rounded-lg bg-linear-to-br from-primary to-secondary text-primary-foreground">
                    <component :is="step.icon" class="size-5" />
                  </span>
                  <span class="font-mono text-xs text-muted">0{{ index + 1 }}</span>
                  <span aria-hidden="true" class="ml-auto text-muted transition-[translate,color] duration-(--duration-fast) group-hover:translate-x-1 group-hover:text-primary">→</span>
                </div>
                <span class="mt-4 font-semibold text-foreground">{{ step.title }}</span>
                <span class="mt-1 text-sm text-muted">{{ step.text }}</span>
              </a>
            </MazCardSpotlight>
          </li>
        </ol>
      </div>
    </section>

    <!-- CI -->
    <section class="px-6 pb-24 tab-m:pb-32">
      <div class="mx-auto grid max-w-6xl items-center gap-12 lap-s:grid-cols-2">
        <div>
          <p class="eyebrow">
            GitHub Action & GitLab component
          </p>
          <h2 class="section-title text-balance">
            Ship every release in one step.
          </h2>
          <p class="mt-4 text-lg leading-relaxed text-muted">
            The official <code class="text-primary">relizy/action</code> and the GitLab CI component of the CI/CD catalog run the whole release from your CI. <code class="text-primary">relizy init</code> writes them for you.
          </p>
          <dl class="mt-8 grid gap-4">
            <div v-for="feature in ciFeatures" :key="feature.title" class="flex gap-3">
              <dt class="w-20 shrink-0 font-semibold text-foreground">
                {{ feature.title }}
              </dt>
              <dd class="text-muted">
                {{ feature.text }}
              </dd>
            </div>
          </dl>
          <div class="mt-8 flex flex-wrap gap-3">
            <MazBtn href="/guide/github-actions#the-relizy-action" color="contrast" outlined :start-icon="MazGithubRaw">
              GitHub Action
            </MazBtn>
            <MazBtn href="/guide/gitlab-ci#the-relizy-component" color="transparent" :end-icon="MazArrowRight">
              GitLab component
            </MazBtn>
          </div>
        </div>

        <div class="min-w-0">
          <MazTabsBar v-model="ciTab" :items="ciTabs" class="mb-4" />
          <!-- Stacked in one cell: the section keeps the height of the longest snippet when switching -->
          <div class="grid">
            <TerminalWindow
              v-for="(snippet, index) in ciSnippets"
              :key="snippet.file"
              :title="snippet.file"
              :class="{ invisible: ciTab !== index + 1 }"
              class="col-start-1 row-start-1"
            >
              <MazCodeHighlight :code="snippet.code" language="yaml" theme="tokyo-night" :rounded="false" class="text-[0.8125rem] [&_pre]:bg-transparent! [&_pre]:p-5!" />
            </TerminalWindow>
          </div>
        </div>
      </div>
    </section>

    <!-- Features -->
    <section class="px-6 pb-24 tab-m:pb-32">
      <div class="mx-auto max-w-6xl">
        <div class="mx-auto max-w-3xl text-center">
          <p class="eyebrow">
            Built for real repositories
          </p>
          <h2 class="section-title">
            Everything a release needs.
          </h2>
        </div>

        <div class="mt-16 grid gap-4 lap-s:grid-cols-3">
          <HomeFeatureCard :icon="MazSquares2x2" title="Monorepos, your way" href="/guide/version-modes" link="Version modes" class="lap-s:row-span-2">
            Three version modes, dependents bumped with their dependencies, and <a href="/guide/version-groups" class="text-primary hover:underline">version groups</a> to release several sets of packages in one run.
            <template #visual>
              <HomeModes />
            </template>
          </HomeFeatureCard>

          <HomeFeatureCard :icon="MazSparkles" title="Release notes written by AI" href="/guide/ai-changelog" link="AI changelogs">
            Claude Code or any AI SDK model rewrites the notes and the posts. References, links and contributors are kept, nothing is invented.
            <template #visual>
              <div class="grid gap-2 font-mono text-xs">
                <p class="rounded-lg bg-surface px-3 py-2 text-muted line-through decoration-muted/50">
                  feat(core): add retry option to fetcher
                </p>
                <p class="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-foreground">
                  ✨ Requests are now retried on network errors, configurable with <span class="text-primary">retry</span>.
                </p>
              </div>
            </template>
          </HomeFeatureCard>

          <HomeFeatureCard :icon="MazShieldCheck" title="Commits linted like your releases" href="/commitlint/" link="Commit linting">
            <code class="text-primary">relizy commitlint</code> uses your config: every commit shows its effect on the next release, every problem how to fix it.
            <template #visual>
              <div class="rounded-lg bg-terminal p-3 font-mono text-xs leading-relaxed text-terminal-fg">
                <p><span class="text-terminal-green">✔</span> feat(core) <span class="text-terminal-dim">→ minor bump, 🚀 Enhancements</span></p>
                <p><span class="text-terminal-red">✖</span> fix(cor): Typo.</p>
                <p class="pl-4 text-terminal-dim">
                  scope-enum <span class="text-terminal-fg">did you mean "core"?</span>
                </p>
              </div>
            </template>
          </HomeFeatureCard>

          <HomeFeatureCard :icon="MazEye" title="Preview before you ship" href="/cli/commands#global-options" link="Dry run">
            <code class="text-primary">--dry-run</code> shows the versions, the changelogs, the release notes, the posts and the PR comment, without committing, publishing nor posting anything. The AI is only called with <code class="text-primary">--ai-preview</code>.
          </HomeFeatureCard>

          <HomeFeatureCard :icon="MazCommandLine" title="Made for your CI" href="/guide/ci-cd" link="CI/CD setup">
            Collapsible logs on GitHub Actions and GitLab CI, a summary of the run, and outputs for the next steps.
            <template #visual>
              <pre class="overflow-x-auto rounded-lg bg-terminal p-3 font-mono text-xs text-terminal-fg"><span class="text-terminal-dim">- if: </span>steps.release.outputs.<span class="text-terminal-cyan">released</span> == <span class="text-terminal-green">'true'</span></pre>
            </template>
          </HomeFeatureCard>

          <HomeFeatureCard :icon="MazChatBubbleLeftRight" title="The summary, everywhere" href="/guide/pr-comment" link="PR comments" wide class="lap-s:col-span-2">
            The end of the terminal, the summary of the CI run and the comment of the pull request: the same summary, with the links of what the release created.
            <template #visual>
              <div class="rounded-xl border border-divider bg-surface p-4 text-sm">
                <p class="flex items-center gap-2 text-xs text-muted">
                  <MazGithub class="size-4" /> relizy-bot commented
                </p>
                <p class="mt-2 font-semibold">
                  🚀 Released acme 2.4.0
                </p>
                <div class="mt-3 divide-y divide-divider rounded-lg border border-divider text-xs">
                  <p class="flex justify-between px-3 py-1.5">
                    <span class="text-muted">Content</span><span>5 features · 3 fixes</span>
                  </p>
                  <p class="flex justify-between px-3 py-1.5">
                    <span class="text-muted">✅ Publish</span><span class="text-primary">3 packages · latest</span>
                  </p>
                  <p class="flex justify-between px-3 py-1.5">
                    <span class="text-muted">✅ Provider release</span><span class="text-primary">v2.4.0</span>
                  </p>
                  <p class="flex justify-between px-3 py-1.5">
                    <span class="text-muted">✨ AI</span><span>2 rewrites · 5.8k tokens · $0.019</span>
                  </p>
                </div>
              </div>
            </template>
          </HomeFeatureCard>

          <HomeFeatureCard :icon="MazLockClosed" title="Private projects too" href="/guide/private-projects" link="Private projects">
            Version your apps, APIs and internal monorepos: changelogs, tags and releases, nothing published.
          </HomeFeatureCard>

          <HomeFeatureCard :icon="MazBeaker" title="Canary releases" href="/guide/prereleases#canary-releases" link="Canary releases">
            Publish a test version of any branch, rolled back once published.
            <template #visual>
              <p class="inline-block rounded-md bg-surface px-2 py-1 font-mono text-xs text-primary">
                2.4.0-0.canary-a1b2c3d
              </p>
            </template>
          </HomeFeatureCard>

          <HomeFeatureCard :icon="MazCpuChip" title="Ready for AI agents" href="/guide/ai-agents" link="AI agents">
            <code class="text-primary">relizy mcp</code> lets Claude Code, Cursor or Codex preview a release, lint a commit and read the docs, read-only.
          </HomeFeatureCard>

          <HomeFeatureCard :icon="MazCheckBadge" title="Know what a merge releases" href="/guide/merge-preview" link="Merge preview">
            Each pull request tells what its merge releases, and its check fails when the release would fail.
            <template #visual>
              <p class="flex items-center gap-2 rounded-md bg-surface px-2 py-1 font-mono text-xs">
                <span class="text-success">✔</span><span class="text-foreground">relizy/merge-preview</span><span class="text-muted">acme@2.5.0</span>
              </p>
            </template>
          </HomeFeatureCard>
        </div>
      </div>
    </section>

    <!-- Config -->
    <section class="px-6 pb-24 tab-m:pb-32">
      <div class="mx-auto grid max-w-6xl items-center gap-12 lap-s:grid-cols-2">
        <div>
          <p class="eyebrow">
            One config
          </p>
          <h2 class="section-title">
            Configure once. Release forever.
          </h2>
          <p class="mt-4 text-lg leading-relaxed text-muted">
            A typed <code class="text-primary">relizy.config.ts</code>, generated by <code class="text-primary">relizy init</code>. Every option has a sensible default, so most projects need only a few lines.
          </p>
          <div class="mt-8 flex flex-wrap gap-3">
            <MazBtn href="/config/overview" color="contrast" outlined>
              Explore the config
            </MazBtn>
            <MazBtn href="/guide/ai-agents" color="transparent" :end-icon="MazArrowRight">
              Set up AI agents
            </MazBtn>
          </div>
        </div>

        <TerminalWindow title="relizy.config.ts">
          <!-- The background of the window, not the one of the shiki theme -->
          <MazCodeHighlight :code="configCode" language="ts" theme="tokyo-night" :rounded="false" class="text-[0.8125rem] [&_pre]:bg-transparent! [&_pre]:p-5!" />
        </TerminalWindow>
      </div>
    </section>

    <!-- Call to action -->
    <section class="px-6 pb-24">
      <div class="relative mx-auto max-w-6xl overflow-hidden rounded-md bg-linear-to-br from-primary to-secondary p-px">
        <div class="relative rounded-[calc(var(--maz-rounded-md)-1px)] bg-surface px-6 py-16 text-center tab-m:py-20">
          <div aria-hidden="true" class="absolute inset-0 bg-linear-to-br from-primary/15 to-secondary/15" />
          <div class="relative">
            <h2 class="text-3xl font-bold tracking-tight tab-m:text-5xl">
              Ship your next release in minutes.
            </h2>
            <p class="mx-auto mt-4 max-w-xl text-lg text-muted">
              <code class="text-primary">relizy init</code> detects your setup. <code class="text-primary">relizy release</code> does the rest.
            </p>
            <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
              <HomeCopyCommand command="pnpm dlx relizy init" />
              <MazBtn href="/guide/getting-started" size="lg" :end-icon="MazArrowRight">
                Read the guide
              </MazBtn>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Contributors -->
    <section class="px-6 pb-24">
      <div class="mx-auto max-w-6xl">
        <h2 class="text-2xl font-bold tracking-tight">
          Contributors
        </h2>
        <div class="mt-6">
          <Suspense>
            <HomeContributors repo="louismazel/relizy" :creators="['LouisMazel']" :links="[{ username: 'LouisMazel', link: 'https://twitter.com/mazeel', type: 'twitter' }]" />
          </Suspense>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="border-t border-divider px-6 py-10">
      <div class="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-sm text-muted tab-m:flex-row">
        <p>Released under the MIT License · © Louis Mazel</p>
        <p>
          Designed with
          <a href="https://maz-ui.com" target="_blank" class="font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline">maz-ui</a>,
          the Vue & Nuxt design system
        </p>
      </div>
    </footer>
  </div>
</template>
