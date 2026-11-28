import type { ServerContext } from '../context'
import { getErrorMessage } from '@maz-ui/utils/helpers/getErrorMessage'
import { filterOutPrivatePackages, InteractiveAuthRequiredError, isNpmjsRegistry, listStagedVersions } from '@relizy/core'
import { getMonorepoPackagePatterns } from '../../groups'
import { getNpmRegistry, resolveRegistryTargetsForPackages } from '../../npm-registry'
import { readPackages } from '../../repo'
import { code, tableCell } from '../markdown'
import { loadProjectConfig } from '../runtime'
import { configArgSchema } from './project'
import { defineTool } from './types'

/** When and by whom: `2026-11-28 by maz` */
function describeStaging(entry: { createdAt?: string, actor?: string }): string {
  return [entry.createdAt, entry.actor && 'by '.concat(entry.actor)].filter(Boolean).join(' ')
}

export async function listStaged(context: ServerContext, { config: configName }: { config?: string }): Promise<string> {
  const config = await loadProjectConfig({ config: configName, cwd: context.cwd })
  const packages = filterOutPrivatePackages(readPackages({
    cwd: config.cwd,
    patterns: getMonorepoPackagePatterns(config),
    ignored: config.monorepo?.ignored,
  }))
  const registry = resolveRegistryTargetsForPackages(packages, config).map(target => target.registry || getNpmRegistry(config.cwd)).find(isNpmjsRegistry) ?? 'https://registry.npmjs.org/'
  const title = `# Staged versions (relizy ${context.version})`

  try {
    const staged = await listStagedVersions({
      cwd: config.cwd,
      registry,
      packageNames: packages.map(pkg => pkg.name),
    })
    if (staged.length === 0) {
      return [title, '', 'No version of the public packages of the project awaits approval: the released versions are installable.'].join('\n')
    }
    return [
      title,
      '',
      'These versions are staged on npm: not installable until a maintainer approves them with 2FA. Never say they are out.',
      '',
      '| Package | Version | Tag | Status | Staged | Id |',
      '| --- | --- | --- | --- | --- | --- |',
      ...staged.map(entry => `| ${code(entry.name)} | ${entry.version} | ${entry.tag} | ${entry.status} | ${tableCell(describeStaging(entry))} | ${code(entry.stageId)} |`),
      '',
      'To approve them, ask the user to run `relizy stage approve --all` (their 2FA), or to approve on npmjs.com. Never run it yourself.',
    ].join('\n')
  }
  catch (error) {
    const reason = error instanceof InteractiveAuthRequiredError
      ? 'this runs in a CI or under trusted publishing, where npm refuses to list the staged versions'
      : `npm could not list them (${getErrorMessage(error).split('\n')[0]}): the user may not be logged in (\`npm login\`), or their npm is older than 11.15.0`
    return [title, '', `Not available: ${reason}. Ask the user to run \`relizy stage list\` in their terminal.`].join('\n')
  }
}

export const listStagedVersionsTool = defineTool({
  name: 'list_staged_versions',
  title: 'List the staged versions awaiting approval',
  description: 'List the versions of the public packages of the project staged on npm (`publish.staged`), awaiting the approval of a maintainer: version, dist-tag, status (`validating`, `staged`), date, id. A staged version is not installable: check it before saying a release is out. Read-only, with the npm login of the user; "not available" as a result in a CI or without login. Never approves nor rejects.',
  inputSchema: {
    config: configArgSchema,
  },
  openWorld: true,
  run: listStaged,
})
