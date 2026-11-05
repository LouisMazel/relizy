import process from 'node:process'
import { logger } from '@maz-ui/node'
import { vi } from 'vitest'

const ENV_KEYS = ['RELIZY_REPORTER', 'NO_COLOR', 'CI', 'GITHUB_ACTIONS', 'GITLAB_CI'] as const

/**
 * Show the CI output of the CLI (no color, no provider) and capture its
 * lines, for the tests of what a command tells
 */
export function captureCliOutput() {
  const env = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]))
  for (const key of ENV_KEYS) {
    delete process.env[key]
  }
  Object.assign(process.env, { RELIZY_REPORTER: 'ci', NO_COLOR: '1' })

  vi.mocked(logger.removeReporter).mockReturnValue({ options: { reporters: [] } } as never)
  const output: string[] = []
  // A test may mock node:process without stdout
  const stubbed = !process.stdout
  if (stubbed) {
    Object.assign(process, { stdout: { write: () => true, isTTY: false } })
  }
  const write = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    output.push(String(chunk))
    return true
  })

  return {
    lines: () => output.join('').split('\n').filter(Boolean),
    restore: () => {
      write.mockRestore()
      if (stubbed) {
        Object.assign(process, { stdout: undefined })
      }
      for (const key of ENV_KEYS) {
        if (env[key] === undefined) {
          delete process.env[key]
        }
        else {
          process.env[key] = env[key]
        }
      }
    },
  }
}
