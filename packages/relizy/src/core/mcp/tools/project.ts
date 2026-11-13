import { z } from 'zod'

export { getVersionMode, readPackageSets, relativePath } from '../../package-sets'
export type { PackageSet } from '../../package-sets'

export const configArgSchema = z.string().optional().describe('Name of the relizy config, as `--config`: "relizy.standalone" for relizy.standalone.config.ts. Default: relizy.config')
