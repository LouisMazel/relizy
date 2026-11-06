import type { AIReleaseContext } from '../../src/core/ai'
import type { CheckResult, EvalTarget } from './checks'
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'
import { logger } from '@maz-ui/node'
import { generateAIProviderReleaseBody, generateAISocialChangelog } from '../../src/core/ai'
import { loadRelizyConfig } from '../../src/core/config'
import { describeAIUsage, takeReleaseFacts } from '../../src/core/progress'
import { getReleaseAI } from '../../src/core/release-facts'
import { resolveSlackPostMaxLength } from '../../src/core/slack'
import { runChecks } from './checks'

/**
 * Rewrites the fixtures with the AI provider of relizy.config.ts and checks
 * the outputs against what the built-in prompts promise. Each run calls the
 * AI (and costs): run it by hand after a change of the prompts.
 *
 * pnpm ai:eval [--fixture major] [--target twitter] [--runs 3] [--language fr] [--changelog body.md] [--out report.md]
 */

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures')
const TARGETS: EvalTarget[] = ['providerRelease', 'twitter', 'slack-summary', 'slack-full']
const TWITTER_MAX_LENGTH = 200

const CONTEXTS: Record<string, AIReleaseContext> = {
  major: { project: '@acme/app', version: '3.0.0', previousVersion: '2.4.1' },
  injection: { project: '@acme/app', version: '2.4.2', previousVersion: '2.4.1' },
  packages: { project: 'acme-kit' },
  relizy: { project: 'relizy', version: '1.14.4-beta.0', previousVersion: '1.14.3' },
}

interface EvalResult {
  fixture: string
  target: EvalTarget
  run: number
  output: string
  durationMs: number
  checks: CheckResult[]
}

const { values } = parseArgs({
  options: {
    fixture: { type: 'string', multiple: true },
    target: { type: 'string', multiple: true },
    runs: { type: 'string', default: '1' },
    language: { type: 'string' },
    changelog: { type: 'string' },
    out: { type: 'string' },
  },
})

const runs = Number(values.runs)

const fixtures = values.changelog
  ? [{ name: basename(values.changelog, '.md'), input: readFileSync(values.changelog, 'utf8') }]
  : Object.keys(CONTEXTS)
      .filter(name => !values.fixture || values.fixture.includes(name))
      .map(name => ({ name, input: readFileSync(join(FIXTURES_DIR, `${name}.md`), 'utf8') }))
const targets = TARGETS.filter(target => !values.target || values.target.includes(target))

function getLabel(result: { fixture: string, target: EvalTarget, run: number }): string {
  return runs > 1 ? `${result.fixture} > ${result.target} #${result.run}` : `${result.fixture} > ${result.target}`
}

function formatFailure(check: CheckResult): string {
  return `${check.name} (${check.detail})`
}

function formatCheck(check: CheckResult): string {
  const detail = check.detail ? ` (${check.detail})` : ''
  return `- ${check.passed ? 'pass' : 'FAIL'}: ${check.name}${detail}`
}

const config = await loadRelizyConfig({
  overrides: { ai: { fallback: 'fail', ...(values.language && { language: values.language }) } },
})

async function rewrite(target: EvalTarget, input: string, context?: AIReleaseContext): Promise<{ output: string, maxLength?: number }> {
  if (target === 'providerRelease') {
    return { output: await generateAIProviderReleaseBody({ config, rawBody: input, context }) }
  }

  if (target === 'twitter') {
    const output = await generateAISocialChangelog({ config, rawBody: input, platform: 'twitter', maxLength: TWITTER_MAX_LENGTH, context })
    return { output, maxLength: TWITTER_MAX_LENGTH }
  }

  const changelogFormat = target === 'slack-full' ? 'full' : 'summary'
  config.social.slack = { ...config.social.slack, changelog: changelogFormat }
  const maxLength = resolveSlackPostMaxLength({ changelogFormat })

  return { output: await generateAISocialChangelog({ config, rawBody: input, platform: 'slack', maxLength, context }), maxLength }
}

const results: EvalResult[] = []

for (const fixture of fixtures) {
  for (const target of targets) {
    for (let run = 1; run <= runs; run++) {
      const started = Date.now()
      const { output, maxLength } = await rewrite(target, fixture.input, CONTEXTS[fixture.name])
      const checks = runChecks({ target, input: fixture.input, output, maxLength })

      results.push({ fixture: fixture.name, target, run, output, durationMs: Date.now() - started, checks })

      const failed = checks.filter(result => !result.passed)
      const label = getLabel({ fixture: fixture.name, target, run })
      if (failed.length === 0) {
        logger.success(`${label}: ${checks.length} checks passed`)
      }
      else {
        logger.fail(`${label}: ${failed.map(formatFailure).join('; ')}`)
      }
    }
  }
}

const rewrites = takeReleaseFacts().aiRewrites
const failedRuns = results.filter(result => result.checks.some(check => !check.passed))
const usage = describeAIUsage(getReleaseAI(rewrites) ?? {})
const usageLabel = usage.length > 0 ? `, ${usage.join(', ')}` : ''
logger.info(`${results.length - failedRuns.length}/${results.length} rewrites passed every check${usageLabel}`)

if (values.out) {
  const report = results.map(result => [
    `## ${getLabel(result)} (${(result.durationMs / 1000).toFixed(1)}s)`,
    '',
    ...result.checks.map(formatCheck),
    '',
    '````md',
    result.output,
    '````',
  ].join('\n'))

  writeFileSync(values.out, `# AI eval\n\n${report.join('\n\n')}\n`)
  logger.info(`Report written to ${values.out}`)
}

process.exitCode = failedRuns.length > 0 ? 1 : 0
