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
