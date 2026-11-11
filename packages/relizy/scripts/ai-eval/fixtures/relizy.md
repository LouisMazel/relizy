### 🩹 Fixes

- Read the git log of a long range without overflowing the exec buffer ([e48ad14](https://github.com/LouisMazel/relizy/commit/e48ad14))

  The `git log` of a new package in a large repository (its whole history) overflowed the 1 MB default buffer of execSync and failed the bump with ENOBUFS.

- Start an independent package without a tag of its version at the release of this version ([d0da83e](https://github.com/LouisMazel/relizy/commit/d0da83e))

  A package moved from the unified or selective group to an independent group has no tag of its own yet (its releases were tagged v6.18.0): it started at an old tag of the package, or at its first commit. It now starts at the commit that set its current version in its package.json, followed through its moves, named after its tag (v6.18.0). The same applies to a package released by hand or whose tag push failed. A package created with its current version is released as a new package.

### 📦 Build

- **deps:** Upgrade minor and patch dependencies ([d15b26d](https://github.com/LouisMazel/relizy/commit/d15b26d))

  - `c12` from 3.3.3 to 3.3.4
  - `fast-glob` from 3.3.2 to 3.3.3

- Require node versions patched by the october 2026 security releases ([a4fca4f](https://github.com/LouisMazel/relizy/commit/a4fca4f))

  `engines.node` goes from `>=22.12.0` to `^22.23.4 || ^24.22.1 || >=26.12.1`, the releases that fix the 10 CVEs of the Node.js October 2026 security releases (including the Brotli decoder RCE, CVE-2026-111497).
