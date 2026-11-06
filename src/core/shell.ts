/**
 * Quoting of the values of the shell commands. Leaf module, without dependency.
 */

/**
 * Wrap a value in single quotes for safe shell interpolation.
 * Single quotes preserve everything literally; embedded single quotes are
 * escaped via the `'\''` idiom. Used for refs, tags and commit subjects that
 * may contain `(`, `)`, `:`, spaces, etc.
 */
export function shellSingleQuote(value: string): string {
  return `'${value.replaceAll('\'', '\'\\\'\'')}'`
}

/**
 * A value of a shell command, quoted unless it only holds the characters of a
 * plain ref: a branch name such as `feat/a$(cmd)`, valid for git, would run
 * its command in the shell
 */
export function shellArg(value: string): string {
  return /^[\w@./:=+^~-]+$/.test(value) ? value : shellSingleQuote(value)
}
