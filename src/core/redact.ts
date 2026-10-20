const MASK = '***'
const VISIBLE_PREFIX = 4
const VISIBLE_SUFFIX = 4
// Below this length, revealing 4+4 chars would expose too much, so mask fully.
const MIN_LENGTH_TO_REVEAL = 16

/**
 * Mask a secret string while keeping a recognizable extract: the first and last
 * few characters stay visible (e.g. `npm_***2Hwk`) so the right credential can
 * still be identified, while the secret itself is never fully exposed. Secrets
 * shorter than {@link MIN_LENGTH_TO_REVEAL} are masked entirely.
 */
function maskSecretValue(value: string): string {
  if (value.length < MIN_LENGTH_TO_REVEAL) {
    return MASK
  }
  return `${value.slice(0, VISIBLE_PREFIX)}${MASK}${value.slice(-VISIBLE_SUFFIX)}`
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
 * original. Secrets are detected by sensitive key name and by living under a
 * secret container (e.g. `tokens.*`).
 */
export function redactSecrets<T>(value: T): T {
  return redactValue(value, false, false, new WeakSet()) as T
}
