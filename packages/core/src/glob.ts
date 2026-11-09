/**
 * Globs of the directories never searched for packages: `node_modules`, `dist`
 * and `.git`. Passed as the `ignore` option of `fast-glob`.
 */
export const GLOB_IGNORE = ['**/node_modules/**', '**/dist/**', '**/.git/**']
