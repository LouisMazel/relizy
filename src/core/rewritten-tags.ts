import type { OnRewrittenTag, ReadPackage } from '../types'
import type { ResolvedRelizyConfig } from './config'
import process from 'node:process'
import { confirm, select } from '@inquirer/prompts'
import { logger } from '@maz-ui/node'
import {
  findReachableCommitBySubject,
  getCommitSubject,
  isAncestor,
  pushTagForce,
  retagAnnotatedLocal,
  tagExists,
} from './git-refs'

/**
 * Per-process memo so the user is prompted at most once per (from, to) pair,
 * even though `resolveTags` runs many times (e.g. once per package, then again
 * for changelog / publish / provider-release within a single `relizy release`).
 */
const sessionCache = new Map<string, string>()

/** Test helper: clear the per-process decision cache. */
export function resetRewrittenTagCache(): void {
  sessionCache.clear()
}

function short(sha: string): string {
  return sha.slice(0, 9)
}

function extractVersionFromRef(ref: string): string {
  // Independent tags are `name@version`; unified tags are `v{{version}}`.
  const atIndex = ref.lastIndexOf('@')
  const candidate = atIndex >= 0 ? ref.slice(atIndex + 1) : ref
  return candidate.startsWith('v') ? candidate.slice(1) : candidate
}

function resolveStrategy(config: ResolvedRelizyConfig): OnRewrittenTag {
  const isTTY = Boolean(process.stdout?.isTTY)
  const strategy = config.onRewrittenTag
    ?? (!config.bump?.yes && isTTY ? 'prompt' : 'ephemeral')

  // Never attempt an interactive prompt without a TTY: it would hang or crash
  // in CI. Fall back to the safe, non-destructive ephemeral correction.
  if (strategy === 'prompt' && !isTTY) {
    return 'ephemeral'
  }

  return strategy
}

function buildExplanation({
  from,
  to,
  twin,
  subject,
}: {
  from: string
  to: string
  twin: string | null
  subject: string | null
}): string {
  const lines = [
    `⚠️  Tag "${from}" points to a commit that is no longer in the history of "${to}".`,
    `It was most likely rewritten by a "git rebase" after the tag was created.`,
    `Generating a changelog from it would span the whole divergent range (often the entire history since the last stable release, with duplicated commits) instead of the real changes.`,
  ]
  if (twin) {
    const subjectSuffix = subject ? ` ("${subject}")` : ''
    lines.push(`Equivalent commit found on "${to}": ${short(twin)}${subjectSuffix}.`)
  }
  else {
    lines.push(`No equivalent commit could be found on "${to}".`)
  }
  lines.push(`Tip: never rebase "develop"/"main" (commits that are tagged or pushed are immutable). Integrate branches via merge or fast-forward instead.`)
  return lines.join('\n')
}

async function rebind({
  from,
  twin,
  config,
  dryRun,
  push,
}: {
  from: string
  twin: string
  config: ResolvedRelizyConfig
  dryRun: boolean
  push: boolean
}): Promise<string> {
  const message = config.templates?.tagMessage?.replaceAll('{{newVersion}}', extractVersionFromRef(from)) || from

  if (dryRun) {
    logger.info(`[dry-run] git tag -f -a ${from} ${short(twin)} -m "${message}" (re-bind orphaned tag)`)
    if (push) {
      logger.info(`[dry-run] git push origin ${from} --force`)
    }
    return from
  }

  await retagAnnotatedLocal({
    tag: from,
    commit: twin,
    message,
    signed: config.signTags,
    cwd: config.cwd,
    logLevel: config.logLevel,
  })
  logger.success(`Re-bound tag "${from}" -> ${short(twin)} locally.`)

  if (push) {
    await pushTagForce(from, config.cwd, config.logLevel)
    logger.success(`Force-pushed tag "${from}" to origin.`)
  }
  else {
    logger.info(`To publish the corrected tag later: git push origin ${from} --force`)
  }

  return from
}

async function promptOrphan({
  from,
  twin,
  config,
  dryRun,
  explanation,
}: {
  from: string
  twin: string | null
  config: ResolvedRelizyConfig
  dryRun: boolean
  explanation: string
}): Promise<string> {
  logger.warn(explanation)

  const choices: { name: string, value: string }[] = []
  if (twin) {
    choices.push({ name: `Use equivalent commit ${short(twin)} for this run only (recommended, non-destructive)`, value: 'ephemeral' })
    choices.push({ name: `Re-bind tag "${from}" -> ${short(twin)} locally (push it manually later)`, value: 'rebind-local' })
    choices.push({ name: `Re-bind tag "${from}" -> ${short(twin)} locally AND force-push to origin`, value: 'rebind-push' })
  }
  choices.push({ name: `Keep the orphaned tag (changelog will span the full divergent range)`, value: 'keep' })
  choices.push({ name: `Abort`, value: 'abort' })

  let answer: string
  try {
    answer = await select({
      message: `How should relizy handle the rewritten tag "${from}"?`,
      choices,
      default: twin ? 'ephemeral' : 'keep',
    })
  }
  catch (error) {
    const userHasExited = error instanceof Error && error.name === 'ExitPromptError'
    logger.log('')
    logger.fail(userHasExited ? 'Cancelled' : 'Error while resolving rewritten tag')
    process.exit(userHasExited ? 0 : 1)
  }

  switch (answer) {
    case 'ephemeral':
      logger.info(`Using equivalent commit ${short(twin!)} as the changelog base for this run.`)
      return twin!
    case 'rebind-local':
      return rebind({ from, twin: twin!, config, dryRun, push: false })
    case 'rebind-push': {
      const confirmed = await confirm({
        message: `Force-push tag "${from}" to origin? This rewrites the already-published tag.`,
        default: false,
      }).catch(() => false)

      if (!confirmed) {
        logger.info('Skipping force-push; re-binding the tag locally only.')
        return rebind({ from, twin: twin!, config, dryRun, push: false })
      }
      return rebind({ from, twin: twin!, config, dryRun, push: true })
    }
    case 'keep':
      logger.warn(`Keeping orphaned tag "${from}"; the changelog range may be incorrect.`)
      return from
    case 'abort':
    default:
      logger.log('')
      logger.fail('Aborted. Re-bind the tag or fix your history, then retry.')
      process.exit(0)
  }
}

/**
 * Ensure the resolved `from` tag is reachable from `to`. When it is not (a
 * rewritten / orphaned tag), explain the situation and either prompt the user
 * or auto-correct, depending on the configured strategy. Returns the effective
 * `from` to use (the original tag, the rebound tag, or the equivalent commit
 * SHA for an ephemeral correction).
 *
 * No commit is ever rewritten; the only mutation possible is moving a tag.
 */
export async function reconcileFromTag({
  from,
  to,
  config,
  dryRun = false,
}: {
  from: string
  to: string
  config: ResolvedRelizyConfig
  pkg?: ReadPackage
  dryRun?: boolean
}): Promise<string> {
  // Feature disabled or nothing to compare. An explicit `--from` is still
  // checked: an orphaned tag passed explicitly produces an equally broken
  // changelog, so the user benefits from the detection too.
  if (config.detectRewrittenTags === false || !from || from === to) {
    return from
  }

  const cwd = config.cwd

  // Only tags can be orphaned. SHAs, the NEW_PACKAGE marker, the first commit
  // and branch names are left untouched.
  if (!(await tagExists(from, cwd))) {
    return from
  }

  // Cache the decision per `from` tag (not per `from`+`to`). Within a single
  // `relizy release` the later steps (provider-release, social) compare the
  // same `from` tag against a different `to` (the new tag, `HEAD`), which are
  // all descendants of the branch used at bump time. Reachability is therefore
  // identical, so reusing the first decision avoids re-prompting 2-3 times.
  const cached = sessionCache.get(from)
  if (cached !== undefined) {
    return cached
  }

  // Healthy tag: reachable from `to`, nothing to do (silent no-op).
  if (await isAncestor(from, to, cwd)) {
    sessionCache.set(from, from)
    return from
  }

  // Orphaned tag detected.
  const subject = await getCommitSubject(from, cwd)
  const twin = subject ? await findReachableCommitBySubject(subject, to, cwd) : null
  const explanation = buildExplanation({ from, to, twin, subject })

  const strategy = resolveStrategy(config)

  let result: string

  if (strategy === 'error') {
    logger.error(explanation)
    throw new Error(`Tag "${from}" was rewritten (rebased) and is no longer reachable from "${to}". Re-bind the tag or fix your history.`)
  }
  else if (strategy === 'prompt') {
    result = await promptOrphan({ from, twin, config, dryRun, explanation })
  }
  else if (!twin) {
    // Non-interactive but no safe correction available.
    logger.warn(explanation)
    logger.warn(`Falling back to the original tag "${from}"; the changelog range may be incorrect.`)
    result = from
  }
  else if (strategy === 'rebind') {
    logger.warn(explanation)
    result = await rebind({ from, twin, config, dryRun, push: false })
  }
  else {
    // ephemeral (default non-interactive)
    logger.warn(explanation)
    logger.info(`Using equivalent commit ${short(twin)} as the changelog base for this run (tag "${from}" left untouched).`)
    result = twin
  }

  sessionCache.set(from, result)
  return result
}
