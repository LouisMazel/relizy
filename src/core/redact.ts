const REDACTED = '[redacted]'

/**
 * Key names whose value is always a secret, wherever they appear in the config.
 * Compared in lower case.
 */
const SENSITIVE_KEYS = new Set([
  'token',
  'publishtoken',
  'oauthtoken',
  'apikey',
  'apikeysecret',
  'accesstoken',
  'accesstokensecret',
  'password',
  'secret',
  'webhookurl',
  '_authtoken',
])

/**
 * Container keys whose nested string values are all secrets, even when the
 * leaf key name is not sensitive on its own (e.g. `tokens.registry`,
 * `tokens.github`).
 */
const SECRET_CONTAINER_KEYS = new Set(['tokens'])

/**
 * Patterns of well-known secret formats, masked inside free-form strings such
 * as shell commands or error messages. Each keeps a recognizable prefix so the
 * log stays useful for debugging without leaking the secret.
 */
const TOKEN_PATTERNS: Array<{ regex: RegExp, replacement: string }> = [
  // npm automation/granular tokens: npm_xxxxx
  { regex: /npm_[A-Z0-9]{8,}/gi, replacement: 'npm_[redacted]' },
  // GitHub PAT (fine-grained): github_pat_xxxxx
  { regex: /github_pat_\w{8,}/gi, replacement: 'github_pat_[redacted]' },
  // GitHub classic tokens: ghp_/gho_/ghs_/ghr_/ghu_
  { regex: /gh[posru]_[A-Z0-9]{8,}/gi, replacement: 'gh_[redacted]' },
  // GitLab personal access tokens: glpat-xxxxx
  { regex: /glpat-[\w\-]{8,}/gi, replacement: 'glpat-[redacted]' },
  // Slack tokens: xoxb-/xoxp-/xoxa-/xoxr-/xoxs- (keep the prefix via capture group)
  { regex: /(xox[baprs]-)[A-Z0-9-]{6,}/gi, replacement: '$1[redacted]' },
  // Any `_authToken=...` assignment (npm nerf-dart auth in commands / .npmrc)
  { regex: /_authToken=\S+/gi, replacement: '_authToken=[redacted]' },
]

/**
 * Mask known secret patterns inside a free-form string (commands, error
 * messages, URLs). Leaves the rest of the string intact.
 */
export function maskTokens(input: string): string {
  let output = input
  for (const { regex, replacement } of TOKEN_PATTERNS) {
    output = output.replace(regex, replacement)
  }
  return output
}

function redactValue(value: unknown, inSecretContainer: boolean, keyIsSensitive: boolean): unknown {
  if (typeof value === 'string') {
    if (value === '') {
      return value
    }
    if (inSecretContainer || keyIsSensitive) {
      return REDACTED
    }
    return value
  }

  if (Array.isArray(value)) {
    return value.map(item => redactValue(item, inSecretContainer, false))
  }

  if (value && typeof value === 'object') {
    return redactObject(value as Record<string, unknown>, inSecretContainer)
  }

  return value
}

function redactObject(obj: Record<string, unknown>, inSecretContainer: boolean): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase()
    const childInContainer = inSecretContainer || SECRET_CONTAINER_KEYS.has(lowerKey)
    const keyIsSensitive = SENSITIVE_KEYS.has(lowerKey)
    result[key] = redactValue(value, childInContainer, keyIsSensitive)
  }
  return result
}

/**
 * Return a deep clone of `value` with every secret masked, without mutating the
 * original. Secrets are detected by sensitive key name and by living under a
 * secret container (e.g. `tokens.*`).
 */
export function redactSecrets<T>(value: T): T {
  return redactValue(value, false, false) as T
}
