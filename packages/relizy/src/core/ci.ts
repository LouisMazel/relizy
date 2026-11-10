import type { ResolvedRelizyConfig } from './config'
import process from 'node:process'
import { logger } from '@maz-ui/node'
import { ensurePushAccess as ensureCorePushAccess } from '@relizy/core'

/**
 * Check, before publishing anything, that the release commit and the tags can
 * be pushed (see `ensurePushAccess` of `@relizy/core`): on GitLab, the push
 * goes through `tokens.gitlab` when the job token cannot push.
 */
export function ensurePushAccess({ config, env = process.env }: { config: ResolvedRelizyConfig, env?: NodeJS.ProcessEnv }): Promise<void> {
  return ensureCorePushAccess({
    cwd: config.cwd,
    gitlabToken: config.tokens.gitlab,
    env,
    logger,
  })
}
