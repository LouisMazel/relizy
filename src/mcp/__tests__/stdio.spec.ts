import type { Buffer } from 'node:buffer'

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { cleanTempDirs, createRepository, ROOT_DIR } from './helpers'

interface JsonRpcMessage {
  id?: number
  result?: { content?: { text: string }[], serverInfo?: { name: string } }
}

/** Runs `relizy mcp` like an agent does, and returns every line of its stdout once the requests are answered */
function runServer(cwd: string, requests: object[], expected: number): Promise<{ lines: string[], stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(ROOT_DIR, 'node_modules/tsx/dist/cli.mjs'), join(ROOT_DIR, 'src/cli.ts'), 'mcp', '--cwd', cwd], {
      cwd: ROOT_DIR,
      env: { ...process.env, CI: 'true', GITHUB_ACTIONS: 'true' },
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`The server did not answer: ${stdout}${stderr}`))
    }, 50_000)

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
      const lines = stdout.split('\n').filter(Boolean)

      if (lines.length >= expected) {
        clearTimeout(timer)
        child.kill()
        resolve({ lines, stderr })
      }
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    for (const request of requests) {
      child.stdin.write(`${JSON.stringify(request)}\n`)
    }
  })
}

afterAll(() => {
  cleanTempDirs()
})

describe('Given relizy mcp started on stdio', () => {
  describe('When an agent initializes it and previews the release, in CI', () => {
    it('Then stdout only carries the protocol, without banner nor log, and the repository is untouched', async () => {
      const repository = createRepository()
      repository.writeJson('.', { name: 'app', version: '1.0.0' })
      repository.write('relizy.config.mjs', `export default { hooks: { 'before:bump': 'touch hooked' } }\n`)
      repository.commit('chore: init')
      repository.git('tag', '-a', 'v1.0.0', '-m', 'v1.0.0')
      repository.commit('feat: add the export', { 'export.js': 'export {}' })

      const { lines } = await runServer(repository.cwd, [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' } } },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'preview_release', arguments: { config: 'relizy' } } },
      ], 2)

      const messages = lines.map(line => JSON.parse(line) as JsonRpcMessage)

      expect(messages[0]?.result?.serverInfo?.name).toBe('relizy')
      expect(messages[1]?.result?.content?.[0]?.text).toContain('**Version:** 1.0.0 → 1.1.0')
      expect(repository.git('status', '--porcelain')).toBe('')
      expect(repository.git('tag')).toBe('v1.0.0')
      expect(existsSync(join(repository.cwd, 'hooked'))).toBe(false)
    }, 60_000)
  })
})
