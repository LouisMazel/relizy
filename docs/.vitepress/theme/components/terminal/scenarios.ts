/**
 * The scenarios of the terminal of the homepage: what `relizy release` shows,
 * step by step, in a terminal, in dry-run and in CI.
 */

export type Tone = 'dim' | 'green' | 'magenta' | 'yellow' | 'cyan' | 'red' | 'bold' | 'badge' | 'brand'

export interface Segment {
  text: string
  tone?: Tone | Tone[]
}

/** A line of the output, on the rail of the steps */
export interface Line {
  symbol?: Segment
  segments: Segment[]
}

export interface Box {
  title: Segment[]
  rows: Segment[][]
}

export type Action
  = | { do: 'type', text: string }
    | { do: 'intro', title: string, dryRun?: boolean }
    | { do: 'line', line: Line, wait?: number }
    | { do: 'box', box: Box, wait?: number }
    | {
      do: 'step'
      running: string
      /** What the step does while it runs, `ai` for the AI */
      progress?: { text: string, ai?: boolean, ms: number }[]
      ms?: number
      done: Segment[]
      duration: string
      /** Lines under the result: notes, warnings */
      after?: Line[]
    }
    | { do: 'confirm', question: Segment[], options: string[] }
    | { do: 'outro', segments: Segment[] }
    | { do: 'pause', ms: number }

const dim = (text: string): Segment => ({ text, tone: 'dim' })
const plain = (text: string): Segment => ({ text })

/** A row of the release plan: name, versions and why */
function planRow(name: string, from: string, to: string, why: string): Segment[] {
  return [
    { text: name.padEnd(12), tone: 'bold' },
    dim(from.padStart(6)),
    dim('  →  '),
    { text: to.padEnd(7), tone: ['green', 'bold'] },
    dim(why),
  ]
}

/** A row of the summary: status, label, value */
function summaryRow(status: 'done' | 'none', label: string, value: string, link?: string): Segment[][] {
  const row = [
    status === 'done' ? { text: '✔ ', tone: 'green' as const } : plain('  '),
    dim(label.padEnd(17)),
    plain(value),
  ]
  return link ? [row, [plain(' '.repeat(19)), { text: link, tone: 'cyan' }]] : [row]
}

const plan: Box = {
  title: [plain('Release plan · 3 packages')],
  rows: [
    planRow('@acme/core', '2.3.1', '2.4.0', '2 features, 1 fix'),
    planRow('@acme/ui', '2.3.1', '2.4.0', '1 feature'),
    planRow('@acme/cli', '2.3.1', '2.4.0', 'follows @acme/core'),
  ],
}

function summary(dryRun: boolean): Box {
  return {
    title: dryRun ? [plain('Summary  '), { text: ' DRY RUN ', tone: 'badge' }] : [plain('Summary')],
    rows: [
      ...summaryRow('none', 'Version', '2.4.0'),
      ...summaryRow('none', 'Tag', 'v2.4.0'),
      ...summaryRow('none', 'Content', '5 features · 3 fixes · 2 contributors'),
      ...summaryRow('done', 'Changelog', 'done'),
      ...summaryRow('done', 'Publish', '3 packages · latest · registry.npmjs.org'),
      ...summaryRow('done', 'Commit and tags', dryRun ? 'v2.4.0' : 'a1b2c3d · v2.4.0'),
      ...summaryRow('done', 'Provider release', '1 release on github', 'https://github.com/acme/acme/releases/tag/v2.4.0'),
      ...summaryRow('done', 'Social media', 'twitter, slack'),
      ...summaryRow('done', 'PR comment', dryRun ? 'previewed' : 'posted'),
      ...summaryRow('none', 'AI', dryRun ? '2 rewrites simulated (claude-code)' : '2 rewrites by claude-code in 21.3s · 5.8k tokens · $0.019'),
      ...dryRun ? summaryRow('none', 'For real', 'relizy release') : summaryRow('none', 'Install', 'pnpm add @acme/core@2.4.0'),
    ],
  }
}

const releaseNotes: Box = {
  title: [{ text: 'Preview', tone: 'yellow' }, plain(' '), { text: 'GitHub release v2.4.0', tone: 'bold' }],
  rows: [
    [{ text: '### 🚀 Features', tone: ['cyan', 'bold'] }],
    [plain('- '), { text: 'core:', tone: 'bold' }, plain(' stream the events of a run '), dim('(a1b2c3d)')],
    [plain('- '), { text: 'ui:', tone: 'bold' }, plain(' add the `compact` density to the tables '), dim('(e4f5a6b)')],
    [{ text: '### 🩹 Fixes', tone: ['cyan', 'bold'] }],
    [plain('- '), { text: 'core:', tone: 'bold' }, plain(' retry the requests on a 429 '), dim('(c7d8e9f)')],
    [dim('… 18 more lines (--log-level verbose)')],
  ],
}

export const releaseScenario: Action[] = [
  { do: 'type', text: 'pnpm relizy release' },
  { do: 'intro', title: 'relizy release' },
  { do: 'step', running: 'Checking the release', ms: 700, done: [plain('Ready to release (tokens, registry, branch)')], duration: '412ms' },
  { do: 'box', box: plan, wait: 500 },
  { do: 'confirm', question: [plain('Release these 3 versions?')], options: ['Release', 'Cancel'] },
  { do: 'step', running: 'Computing the versions', ms: 500, done: [plain('3 packages to release')], duration: '1.2s' },
  { do: 'step', running: 'Writing the changelogs', progress: [{ text: 'Finding the GitHub profiles of the contributors', ms: 700 }], done: [plain('4 changelogs written')], duration: '284ms' },
  {
    do: 'step',
    running: 'Publishing the packages',
    progress: [
      { text: 'Building the packages (pnpm build)', ms: 1100 },
      { text: 'Publishing @acme/core@2.4.0 (1/3)', ms: 600 },
      { text: 'Publishing @acme/ui@2.4.0 (2/3)', ms: 600 },
      { text: 'Publishing @acme/cli@2.4.0 (3/3)', ms: 600 },
    ],
    done: [plain('Published @acme/core@2.4.0, @acme/ui@2.4.0, @acme/cli@2.4.0')],
    duration: '6.8s',
  },
  { do: 'step', running: 'Committing and tagging', ms: 500, done: [plain('Committed and tagged v2.4.0')], duration: '41ms' },
  { do: 'step', running: 'Pushing', ms: 600, done: [plain('Pushed the commit and the tags')], duration: '1.1s' },
  {
    do: 'step',
    running: 'Creating the releases',
    progress: [
      { text: 'Writing the notes of v2.4.0', ms: 600 },
      { text: 'Rewriting the notes of v2.4.0 with AI (claude-code)', ai: true, ms: 3200 },
      { text: 'Creating the GitHub release v2.4.0', ms: 600 },
    ],
    done: [plain('1 GitHub release created')],
    duration: '18.4s',
    after: [{ symbol: { text: '✨' }, segments: [{ text: 'The notes of v2.4.0 rewritten by AI (claude-code) in 16.9s, 3.6k tokens, $0.012', tone: 'magenta' }] }],
  },
  {
    do: 'step',
    running: 'Posting the release',
    progress: [
      { text: 'Rewriting the Twitter post with AI (claude-code)', ai: true, ms: 1800 },
      { text: 'Posting on Twitter', ms: 500 },
      { text: 'Posting on Slack', ms: 500 },
    ],
    done: [plain('Posted on twitter, slack')],
    duration: '2.3s',
  },
  { do: 'step', running: 'Commenting the pull request', ms: 600, done: [plain('Pull request #128 commented')], duration: '640ms' },
  { do: 'box', box: summary(false), wait: 600 },
  { do: 'outro', segments: [{ text: '✔', tone: 'green' }, plain(' Released '), { text: 'acme 2.4.0', tone: 'bold' }, dim('  33.8s')] },
]

export const dryRunScenario: Action[] = [
  { do: 'type', text: 'pnpm relizy release --dry-run' },
  { do: 'intro', title: 'relizy release', dryRun: true },
  { do: 'step', running: 'Checking the release', ms: 600, done: [plain('Ready to release (tokens, registry, branch)')], duration: '398ms' },
  { do: 'box', box: { ...plan, title: [plain('Release plan · 3 packages · DRY RUN')] }, wait: 500 },
  { do: 'confirm', question: [plain('Release these 3 versions?  '), { text: ' DRY RUN ', tone: 'badge' }, dim(' nothing will be written')], options: ['Release', 'Cancel'] },
  { do: 'step', running: 'Computing the versions', ms: 500, done: [plain('3 packages to release')], duration: '1.1s' },
  { do: 'step', running: 'Writing the changelogs', ms: 700, done: [plain('4 changelogs written')], duration: '301ms' },
  { do: 'step', running: 'Publishing the packages', progress: [{ text: 'Publishing @acme/core@2.4.0 (1/3)', ms: 500 }, { text: 'Publishing @acme/cli@2.4.0 (3/3)', ms: 500 }], done: [plain('Published @acme/core@2.4.0, @acme/ui@2.4.0, @acme/cli@2.4.0')], duration: '2.4s' },
  {
    do: 'step',
    running: 'Creating the releases',
    progress: [{ text: 'Writing the notes of v2.4.0', ms: 700 }],
    done: [plain('1 GitHub release created')],
    duration: '292ms',
    after: [{ symbol: { text: '✨' }, segments: [{ text: 'The notes of v2.4.0: AI rewrite simulated (claude-code not called in dry run, see --ai-preview)', tone: 'magenta' }] }],
  },
  { do: 'box', box: releaseNotes, wait: 900 },
  { do: 'step', running: 'Posting the release', ms: 600, done: [plain('Posted on twitter, slack')], duration: '418ms' },
  { do: 'box', box: summary(true), wait: 600 },
  { do: 'outro', segments: [{ text: ' DRY RUN ', tone: 'badge' }, plain(' Simulated release of '), { text: 'acme 2.4.0', tone: 'bold' }, plain(', nothing was written'), dim('  4.1s')] },
]

/** A collapsible group of the log of GitHub Actions */
export interface CiGroup {
  title: string
  lines: Segment[][]
  result: Segment[]
  failed?: boolean
  after?: Segment[][]
}

export const ciScenario: CiGroup[] = [
  { title: 'Checking the release', lines: [[plain('Using Git provider: github')], [plain('Registry auth: ok (registry.npmjs.org)')]], result: [plain('Ready to release (tokens, registry, branch)'), dim('  398ms')] },
  { title: 'Computing the versions', lines: [[plain('Bumping 3 packages from v2.3.1 (selective mode)')], [plain('@acme/cli follows @acme/core')]], result: [plain('3 packages to release'), dim('  1.1s')], after: [[dim('  @acme/core  2.3.1 → 2.4.0  2 features, 1 fix')], [dim('  @acme/ui    2.3.1 → 2.4.0  1 feature')], [dim('  @acme/cli   2.3.1 → 2.4.0  follows @acme/core')]] },
  { title: 'Writing the changelogs', lines: [[dim('› '), plain('Finding the GitHub profiles of the contributors')], [plain('4 CHANGELOG.md updated')]], result: [plain('4 changelogs written'), dim('  284ms')] },
  { title: 'Publishing the packages', lines: [[dim('› '), plain('Building the packages (pnpm build)')], [dim('› '), plain('Publishing @acme/core@2.4.0 (1/3)')], [dim('› '), plain('Publishing @acme/ui@2.4.0 (2/3)')], [dim('› '), plain('Publishing @acme/cli@2.4.0 (3/3)')]], result: [plain('Published @acme/core@2.4.0, @acme/ui@2.4.0, @acme/cli@2.4.0'), dim('  6.8s')] },
  { title: 'Committing and tagging', lines: [[plain('chore(release): bump version to 2.4.0')]], result: [plain('Committed and tagged v2.4.0'), dim('  41ms')] },
  { title: 'Pushing', lines: [[plain('git push --follow-tags')]], result: [plain('Pushed the commit and the tags'), dim('  1.1s')] },
  { title: 'Creating the releases', lines: [[dim('› '), plain('Writing the notes of v2.4.0')], [plain('✨ '), { text: 'Rewriting the notes of v2.4.0 with AI (claude-code)', tone: 'magenta' }], [dim('› '), plain('Creating the GitHub release v2.4.0')]], result: [plain('1 GitHub release created'), dim('  18.4s')], after: [[plain('  ✨ '), { text: 'The notes of v2.4.0 rewritten by AI (claude-code) in 16.9s, 3.6k tokens, $0.012', tone: 'magenta' }]] },
  { title: 'Posting the release', lines: [[dim('› '), plain('Posting on Twitter')], [dim('› '), plain('Posting on Slack')]], result: [plain('Posted on twitter'), plain(', '), { text: 'slack failed', tone: 'yellow' }, dim('  2.3s')], failed: true },
]

export const ciSummary: Segment[][] = [
  [dim('    Version           '), plain('2.4.0')],
  [{ text: '  ✔ ', tone: 'green' }, dim('Publish           '), plain('3 packages · latest · registry.npmjs.org')],
  [{ text: '  ✔ ', tone: 'green' }, dim('Provider release  '), plain('1 release on github')],
  [dim('                      '), { text: 'https://github.com/acme/acme/releases/tag/v2.4.0', tone: 'cyan' }],
  [{ text: '  ▲ ', tone: 'yellow' }, dim('Social media      '), { text: 'slack: channel_not_found', tone: 'yellow' }],
  [{ text: '✔ ', tone: 'green' }, { text: 'Released acme 2.4.0', tone: 'bold' }, dim('  33.8s')],
]
