const MASK = '***'
const VISIBLE_SUFFIX = 4
// Below this length, revealing the last chars would expose too much, so mask fully.
const MIN_LENGTH_TO_REVEAL = 16

/**
 * Prefixes of the known secret formats: they tell the kind of secret without
 * being part of it (longest first, so `sk-ant-` wins over `sk-`)
 */
const KNOWN_PREFIXES = [
  'github_pat_',
  'sk-ant-oat',
  'sk-ant-api',
  'sk-ant-',
  'glpat-',
  'xoxb-',
  'xoxp-',
  'xapp-',
  'ghp_',
  'gho_',
  'ghu_',
  'ghs_',
  'ghr_',
  'npm_',
  'sk-',
]

/**
 * Mask a secret string while keeping what identifies it without revealing it:
 * a URL keeps its origin (`https://hooks.slack.com/***`), a token its known
 * prefix and its last 4 characters (`npm_***2Hwk`, `***2Hwk` without known
 * prefix). Secrets shorter than {@link MIN_LENGTH_TO_REVEAL} are masked entirely.
 */
function maskSecretValue(value: string): string {
  if (/^https?:\/\//.test(value)) {
    try {
      return `${new URL(value).origin}/${MASK}`
    }
    catch {
      return MASK
    }
  }

  if (value.length < MIN_LENGTH_TO_REVEAL) {
    return MASK
  }

  const prefix = KNOWN_PREFIXES.find(known => value.startsWith(known)) ?? ''

  return `${prefix}${MASK}${value.slice(-VISIBLE_SUFFIX)}`
}

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

const CIRCULAR = '[Circular]'

/**
 * `ancestors` holds the objects being redacted above the current value: a value
 * referencing one of them (e.g. a model instance of `ai.providers['ai-sdk']`
 * whose client points back to it) is replaced instead of recursing forever.
 */
function redactValue(value: unknown, inSecretContainer: boolean, keyIsSensitive: boolean, ancestors: WeakSet<object>): unknown {
  if (typeof value === 'string') {
    if (value === '') {
      return value
    }
    if (inSecretContainer || keyIsSensitive) {
      return maskSecretValue(value)
    }
    return value
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  if (ancestors.has(value)) {
    return CIRCULAR
  }

  ancestors.add(value)

  const result = Array.isArray(value)
    ? value.map(item => redactValue(item, inSecretContainer, false, ancestors))
    : redactObject(value as Record<string, unknown>, inSecretContainer, ancestors)

  ancestors.delete(value)

  return result
}

function redactObject(obj: Record<string, unknown>, inSecretContainer: boolean, ancestors: WeakSet<object>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase()
    const childInContainer = inSecretContainer || SECRET_CONTAINER_KEYS.has(lowerKey)
    const keyIsSensitive = SENSITIVE_KEYS.has(lowerKey)
    result[key] = redactValue(value, childInContainer, keyIsSensitive, ancestors)
  }
  return result
}

/**
 * Return a deep clone of `value` with every secret masked, without mutating the
 * original. Secrets are detected by sensitive key name (`token`, `password`,
 * `apiKey`, `webhookUrl`...) and by living under a secret container (e.g.
 * `tokens.*`). A URL keeps its origin, a token of 16 characters or more keeps
 * its known prefix and its last 4 characters, a shorter one is fully masked
 * (`***`). Empty strings are kept, and a circular reference becomes `[Circular]`.
 *
 * @param value - The value to redact, typically a config object
 * @returns A clone of the same shape with the secrets masked
 * @example
 * ```ts
 * redactSecrets({ tokens: { github: 'ghp_abcdefghijklmnop1234' }, name: 'app' })
 * // { tokens: { github: 'ghp_***1234' }, name: 'app' }
 * ```
 */
export function redactSecrets<T>(value: T): T {
  return redactValue(value, false, false, new WeakSet()) as T
}
