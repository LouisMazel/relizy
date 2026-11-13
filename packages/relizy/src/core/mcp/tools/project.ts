import { z } from 'zod'

export const configArgSchema = z.string().optional().describe('Name of the relizy config, as `--config`: "relizy.standalone" for relizy.standalone.config.ts. Default: relizy.config')
