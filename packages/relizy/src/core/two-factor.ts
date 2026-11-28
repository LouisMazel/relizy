import type { WebAuthHandler } from '@relizy/core'
import type { OtpRequest } from '../types'
import { spawn } from 'node:child_process'
import process from 'node:process'
import { getTrustedPublishingProvider, isInCI, isNpmjsRegistry } from '@relizy/core'
import { getAppHandlers } from './events'
import { askText } from './prompts'
import { promptInReleaseUi, showNowInReleaseUi } from './release-ui'

/**
 * The 2FA of npm, shared by the publish, the approval and rejection of the
 * staged versions and `relizy trust`: npm is tried without code first and
 * offers its web page (security key, passkey or code), shown to the app
 * (`onWebAuth`) or opened in the browser; a code is asked (`onOtp` or the
 * terminal) only when npm needs one it cannot get on the web
 */

/** A person can answer in this terminal: stdin and stdout are TTYs, and stdout does not carry the JSON events */
export function isInteractiveTerminal(): boolean {
  return process.env.RELIZY_REPORTER !== 'json' && Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY)
}

/**
 * Opens a page of npmjs.com in the browser of the person, as npm does for its
 * web 2FA: only in an interactive terminal outside a CI, never with
 * `BROWSER=none`. Returns false when the page could not be opened
 */
export function openNpmPage(url: string): boolean {
  if (!/^https:\/\/www\.npmjs\.com\//.test(url) || !isInteractiveTerminal() || isInCI() || process.env.BROWSER === 'none') {
    return false
  }

  const [command, args] = process.platform === 'darwin'
    ? [
        'open',
        [url],
      ]
    : process.platform === 'win32'
      ? [
          'cmd',
          ['/c', 'start', '', url],
        ]
      : [
          'xdg-open',
          [url],
        ]

  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' })
    child.on('error', () => {})
    child.unref()
    return true
  }
  catch {
    return false
  }
}

/**
 * Shows the web 2FA page npm gives a security-key account: to the app
 * (`onWebAuth`), else in the output. The run goes on once validated
 */
export function getWebAuthHandler(): WebAuthHandler {
  const { onWebAuth } = getAppHandlers()
  if (onWebAuth) {
    return onWebAuth
  }

  return ({ url, purpose }) => {
    const what = {
      trust: 'set up trusted publishing',
      publish: 'publish the packages',
      approve: 'approve the staged versions',
      reject: 'reject the staged versions',
    }[purpose]
    const opened = openNpmPage(url)
    return showNowInReleaseUi({
      title: 'Validate on npm',
      lines: [
        `To ${what}, validate with your security key, passkey or code${opened
          ? ' (opened in your browser)'
          : ''}:`,
        url,
        '',
        'Check "skip 2FA for the next 5 minutes" when npm offers it:',
        'one validation then covers the whole batch.',
      ],
    })
  }
}

/**
 * The web 2FA handler of a publish to this registry: none in a CI, under
 * trusted publishing, for another registry than npmjs, or when nobody can
 * validate (no terminal and no `onWebAuth`)
 */
export function getPublishWebAuthHandler(registry: string): WebAuthHandler | undefined {
  if (isInCI() || getTrustedPublishingProvider() || !isNpmjsRegistry(registry)) {
    return undefined
  }
  if (!getAppHandlers().onWebAuth && !isInteractiveTerminal()) {
    return undefined
  }
  return getWebAuthHandler()
}

/**
 * Asks the 2FA code of a batch, once npm needs one it cannot get on the web:
 * from `onOtp`, else from the terminal; empty cancels
 */
export function createOtpAsker({ registry, purpose, otp }: { registry: string, purpose: NonNullable<OtpRequest['purpose']>, otp?: string }) {
  let given = otp
  return async ({ count }: { count: number }): Promise<string | undefined> => {
    if (given) {
      const code = given
      given = undefined
      return code
    }

    const { onOtp } = getAppHandlers()
    if (onOtp) {
      const code: unknown = await onOtp({ registry, purpose, count })
      return typeof code === 'string' && code.trim()
        ? code.trim()
        : undefined
    }

    if (!isInteractiveTerminal()) {
      return undefined
    }

    const code = await promptInReleaseUi(() => askText({
      message: `2FA code of npm for ${count} ${purpose === 'trust'
        ? 'package'
        : 'version'}${count > 1
        ? 's'
        : ''} (leave empty to cancel)`,
    })).catch(() => '')
    return code.trim() || undefined
  }
}
