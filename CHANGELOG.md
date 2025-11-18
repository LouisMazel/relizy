# Changelog

## v0.2.5-beta.4...v0.2.5-beta.5

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.5-beta.4...v0.2.5-beta.5)

### 🩹 Fixes

- Do not compute new version of root package in independent mode ([3be33db](https://github.com/LouisMazel/relizy/commit/3be33db))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.5-beta.3...v0.2.5-beta.4

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.5-beta.3...v0.2.5-beta.4)

### 💅 Refactors

- Improve circular dependencies detection ([1cd0ec7](https://github.com/LouisMazel/relizy/commit/1cd0ec7))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.5-beta.2...v0.2.5-beta.3

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.5-beta.2...v0.2.5-beta.3)

### 🩹 Fixes

- Improve checking of package to bump before running release ([560dbe1](https://github.com/LouisMazel/relizy/commit/560dbe1))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.5-beta.1...v0.2.5-beta.2

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.5-beta.1...v0.2.5-beta.2)

### 💅 Refactors

- Use a log debug when version has changed preid" ([1350fc4](https://github.com/LouisMazel/relizy/commit/1350fc4))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.5-beta.0...v0.2.5-beta.1

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.5-beta.0...v0.2.5-beta.1)

### 🩹 Fixes

- Exclude modify files from commit body ([e51fab7](https://github.com/LouisMazel/relizy/commit/e51fab7))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.4...v0.2.5-beta.0

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.4...v0.2.5-beta.0)

### 🩹 Fixes

- Changelog generation with wrong tags ([03f3959](https://github.com/LouisMazel/relizy/commit/03f3959))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.4

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.3...v0.2.4)

### 💅 Refactors

- Add missing 'v' charac before version in default commit message template ([57f5376](https://github.com/LouisMazel/relizy/commit/57f5376))

### 📖 Documentation

- Update README with documentation links ([458ab03](https://github.com/LouisMazel/relizy/commit/458ab03))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.3

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.3-alpha.0...v0.2.3)

### 💅 Refactors

- Use isInCI utility method to disable OTP prompt (npm) ([171f957](https://github.com/LouisMazel/relizy/commit/171f957))
- Use isInCI utility method to disable OTP prompt (npm) ([34f3262](https://github.com/LouisMazel/relizy/commit/34f3262))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.3-alpha.0

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.2...v0.2.3-alpha.0)

### 💅 Refactors

- Use isInCI utility method to disable OTP prompt (npm) ([171f957](https://github.com/LouisMazel/relizy/commit/171f957))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.2

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.2-beta.1...v0.2.2)

### 🩹 Fixes

- Changelog title and compare link generation ([690dcaf](https://github.com/LouisMazel/relizy/commit/690dcaf))
- Handle prerelease version preid changes correctly ([31ab35e](https://github.com/LouisMazel/relizy/commit/31ab35e))

  When changing prerelease preid (e.g. alpha → beta), the function was
  incorrectly detecting the release type from commits and bumping the
  version (e.g. 1.0.0-alpha.5 → 1.1.0-beta.0 instead of 1.0.0-beta.0).
  Now it correctly returns 'prerelease' to keep the version in the same
  release line while only updating the preid identifier.

- Changelog title and compare link generation ([9b8fcfc](https://github.com/LouisMazel/relizy/commit/9b8fcfc))
- Handle prerelease version preid changes correctly ([1e566a9](https://github.com/LouisMazel/relizy/commit/1e566a9))

  When changing prerelease preid (e.g. alpha → beta), the function was
  incorrectly detecting the release type from commits and bumping the
  version (e.g. 1.0.0-alpha.5 → 1.1.0-beta.0 instead of 1.0.0-beta.0).
  Now it correctly returns 'prerelease' to keep the version in the same
  release line while only updating the preid identifier.

### 💅 Refactors

- Rename 'after' hook to 'success' ([a0fe54c](https://github.com/LouisMazel/relizy/commit/a0fe54c))

  The 'after' prefix was ambiguous and could be confused with timing.
  'success' is more explicit and clearly indicates that the hook is
  executed when a step completes successfully. This aligns with the
  existing 'error' hook for failed steps.

- Rename 'after' hook to 'success' ([b238ad5](https://github.com/LouisMazel/relizy/commit/b238ad5))

  The 'after' prefix was ambiguous and could be confused with timing.
  'success' is more explicit and clearly indicates that the hook is
  executed when a step completes successfully. This aligns with the
  existing 'error' hook for failed steps.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.2-beta.1

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.2-beta.0...v0.2.2-beta.1)

### 🩹 Fixes

- Handle prerelease version preid changes correctly ([31ab35e](https://github.com/LouisMazel/relizy/commit/31ab35e))

  When changing prerelease preid (e.g. alpha → beta), the function was
  incorrectly detecting the release type from commits and bumping the
  version (e.g. 1.0.0-alpha.5 → 1.1.0-beta.0 instead of 1.0.0-beta.0).
  Now it correctly returns 'prerelease' to keep the version in the same
  release line while only updating the preid identifier.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.2-beta.0

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.1-alpha.0...v0.2.2-beta.0)

No relevant changes since last release

## v0.2.1-alpha.0

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.0...v0.2.1-alpha.0)

### 🩹 Fixes

- Changelog title and compare link generation ([690dcaf](https://github.com/LouisMazel/relizy/commit/690dcaf))

### 💅 Refactors

- Rename 'after' hook to 'success' ([a0fe54c](https://github.com/LouisMazel/relizy/commit/a0fe54c))

  The 'after' prefix was ambiguous and could be confused with timing.
  'success' is more explicit and clearly indicates that the hook is
  executed when a step completes successfully. This aligns with the
  existing 'error' hook for failed steps.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.1.0...v0.2.0

### 🚀 Features

- **relizy:** Add lifecycle hooks system ([20633be](https://github.com/LouisMazel/relizy/commit/20633be))

  Implement comprehensive lifecycle hooks system allowing users to execute
  custom scripts at specific stages of the release workflow.
  Hooks support:
  - String commands (shell scripts)
  - JavaScript/TypeScript functions
  - Three hook types: before, after, error
  - Six lifecycle steps: bump, changelog, commit-and-tag, push, publish, provider-release
  - Special hook: generate:changelog for customizing changelog generation
    Add CI environment detection utilities (isInCI, getCIName) to support
    conditional hook execution in CI/CD pipelines.

- **relizy:** Add lifecycle hooks system ([eedda3a](https://github.com/LouisMazel/relizy/commit/eedda3a))

  Implement comprehensive lifecycle hooks system allowing users to execute
  custom scripts at specific stages of the release workflow.
  Hooks support:
  - String commands (shell scripts)
  - JavaScript/TypeScript functions
  - Three hook types: before, after, error
  - Six lifecycle steps: bump, changelog, commit-and-tag, push, publish, provider-release
  - Special hook: generate:changelog for customizing changelog generation
    Add CI environment detection utilities (isInCI, getCIName) to support
    conditional hook execution in CI/CD pipelines.

### 💅 Refactors

- **relizy:** Improve type definitions and documentation ([ddd2d82](https://github.com/LouisMazel/relizy/commit/ddd2d82))

  Improve TypeScript type definitions and JSDoc documentation across core modules.
  Export utility types (HookType, HookStep) for external use.
  Clarify configuration interfaces with better naming and comments.

- **relizy:** Improve type definitions and documentation ([4a3792f](https://github.com/LouisMazel/relizy/commit/4a3792f))

  Improve TypeScript type definitions and JSDoc documentation across core modules.
  Export utility types (HookType, HookStep) for external use.
  Clarify configuration interfaces with better naming and comments.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.1.0...v0.2.0-beta.0

### 🚀 Features

- **relizy:** Add lifecycle hooks system ([20633be](https://github.com/LouisMazel/relizy/commit/20633be))

  Implement comprehensive lifecycle hooks system allowing users to execute
  custom scripts at specific stages of the release workflow.
  Hooks support:
  - String commands (shell scripts)
  - JavaScript/TypeScript functions
  - Three hook types: before, after, error
  - Six lifecycle steps: bump, changelog, commit-and-tag, push, publish, provider-release
  - Special hook: generate:changelog for customizing changelog generation
    Add CI environment detection utilities (isInCI, getCIName) to support
    conditional hook execution in CI/CD pipelines.

### 🩹 Fixes

- Exclude resources files (svg, png, etc) from commit body in generated changelog ([6094991](https://github.com/LouisMazel/relizy/commit/6094991))

### 💅 Refactors

- **relizy:** Add lifecycle hooks system ([5b090f6](https://github.com/LouisMazel/relizy/commit/5b090f6))

  Add comprehensive hook system for all release lifecycle events:
  - New hooks: before/after/error for bump, changelog, commit-and-tag, push, publish, provider-release
  - Support both function and shell command hooks
  - Hooks configurable in relizy.config.ts under `hooks` property
  - Automatic hook execution at each lifecycle step

- **relizy:** Add safety checks for provider releases ([c7c37b5](https://github.com/LouisMazel/relizy/commit/c7c37b5))

  Add safety validation before executing provider releases:
  - Check Git provider token availability before release
  - Validate provider type (github/gitlab)
  - New CLI flag: --no-safety-check to disable checks
  - Safety checks configurable via safetyCheck option in config
  - Fail fast with clear error messages when tokens missing

- **relizy:** Make monorepo config optional for standalone packages ([6b3f7ef](https://github.com/LouisMazel/relizy/commit/6b3f7ef))

  Allow relizy to work without monorepo configuration for standalone packages:
  - Config file now optional - falls back to standalone mode
  - loadRelizyConfig renamed from loadMonorepoConfig
  - No error when config file missing (unless --config explicitly provided)
  - Display "standalone" when no versionMode defined
  - Update all imports and type references across codebase

- **relizy:** Improve CLI options and naming consistency ([2473280](https://github.com/LouisMazel/relizy/commit/2473280))

  Improve CLI interface with better naming and new options:
  - Rename --no-release to --no-provider-release for clarity
  - Add --provider flag to manually specify git provider (github/gitlab)
  - Make --config flag optional (defaults to standalone mode)
  - Update all related config properties: release.release → release.providerRelease
  - Consistent option naming across all commands

- **relizy:** Add interactive OTP prompt for npm publish ([cc8233a](https://github.com/LouisMazel/relizy/commit/cc8233a))

  Add automatic OTP handling for npm packages requiring 2FA:
  - Prompt user for OTP when npm returns OTP error
  - Store OTP in session to reuse across multiple package publishes
  - 90-second timeout on OTP input prompt
  - Detect CI environment and fail gracefully without prompting
  - Retry publish with --otp flag after receiving code
  - Support OTP priority: dynamic > session > config

- **relizy:** Extract OTP logic into focused functions ([73eae0b](https://github.com/LouisMazel/relizy/commit/73eae0b))

  Improve code maintainability by breaking down publishPackage:
  - Extract isOtpError(): detect OTP-related errors
  - Extract promptOtpWithTimeout(): handle OTP input with timeout
  - Extract handleOtpError(): manage CI detection and OTP prompting
  - Extract executePublishCommand(): execute npm publish command
  - Reduce complexity of main publishPackage function

- **relizy:** Improve type definitions and documentation ([ddd2d82](https://github.com/LouisMazel/relizy/commit/ddd2d82))

  Improve TypeScript type definitions and JSDoc documentation across core modules.
  Export utility types (HookType, HookStep) for external use.
  Clarify configuration interfaces with better naming and comments.

### 📖 Documentation

- **docs:** Global documentation improvements ([d8572dd](https://github.com/LouisMazel/relizy/commit/d8572dd))
- Update configuration examples and references ([748140a](https://github.com/LouisMazel/relizy/commit/748140a))

  Update documentation to reflect new naming conventions:
  - Replace changelog.config.ts references with relizy.config.ts
  - Update CLAUDE.md config references

- **docs:** Update and improve documentation ([e1eb533](https://github.com/LouisMazel/relizy/commit/e1eb533))
- Add CONTRIBUTING.md doc ([1ec1bea](https://github.com/LouisMazel/relizy/commit/1ec1bea))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.0.0...v0.1.0

### 🚀 Features

- Relizy - release manager ([5c41ba1](https://github.com/LouisMazel/relizy/commit/5c41ba1))

### 📖 Documentation

- Add documentation website of Relizy ([ec156b0](https://github.com/LouisMazel/relizy/commit/ec156b0))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))
