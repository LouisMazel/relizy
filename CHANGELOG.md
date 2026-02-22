# Changelog

## v1.0.2-beta.0...v1.0.2-beta.1

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.0.2-beta.0...v1.0.2-beta.1)

### 🚀 Features

- Add release PR comment ([462147f](https://github.com/LouisMazel/relizy/commit/462147f))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.0.1...v1.0.2-beta.0

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.0.1...v1.0.2-beta.0)

### 🩹 Fixes

- Prevent ENOBUFS error on new packages in independent mode ([fca172f](https://github.com/LouisMazel/relizy/commit/fca172f))

  New packages without tags now use the first commit that touched the package
  directory instead of the repository's first commit.

### 📖 Documentation

- **docs:** Add project name config in overview ([cfe000e](https://github.com/LouisMazel/relizy/commit/cfe000e))
- Update config docs ([5fc4513](https://github.com/LouisMazel/relizy/commit/5fc4513))

### 📦 Build

- Upgrade dependencies ([1ef5a67](https://github.com/LouisMazel/relizy/commit/1ef5a67))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.0.0...v1.0.1

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.0.0...v1.0.1)

### 💅 Refactors

- Add projectName config option ([08ca6a5](https://github.com/LouisMazel/relizy/commit/08ca6a5))

  Allows overriding the package name from root package.json for Twitter (X) and Slack posts.
  Use `projectName` in your config to customize the displayed name in social notifications.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.3.0...v1.0.0

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.3.0...v1.0.0)

### 🚀 Features

- Add automatic Twitter posting for releases ([0e2062a](https://github.com/LouisMazel/relizy/commit/0e2062a))

  Add functionality to automatically post release announcements
  to Twitter when a new version is published.
  - New Twitter integration module (src/core/twitter.ts) with:
    - Twitter credentials management from environment variables
    - Tweet message formatting with customizable templates
    - Release URL generation for GitHub/GitLab
    - Changelog summary extraction
    - Smart truncation to fit Twitter's 280 character limit
  - Configuration support:
    - release.twitter option to enable/disable Twitter posting
    - templates.twitterMessage for custom tweet templates
    - Environment variables for Twitter API credentials:
      - TWITTER_API_KEY / RELIZY_TWITTER_API_KEY
      - TWITTER_API_SECRET / RELIZY_TWITTER_API_SECRET
      - TWITTER_ACCESS_TOKEN / RELIZY_TWITTER_ACCESS_TOKEN
      - TWITTER_ACCESS_TOKEN_SECRET / RELIZY_TWITTER_ACCESS_TOKEN_SECRET
  - CLI support:
    - --twitter flag for the release command to enable Twitter posting
    - Hooks support: before:twitter, success:twitter, error:twitter
  - Integration:
    - Added as Step 7/7 in the release workflow
    - Non-blocking: Twitter posting failures won't fail the release
    - Dry-run support for testing
  - Added twitter-api-v2 for Twitter API integration
    Enable Twitter posting with environment variables set:
    relizy release --twitter
    Or configure in relizy.config.ts:
    export default defineConfig({
    release: {
    twitter: true
    }
    })

- Add option to skip Twitter posts for prerelease versions ([d068175](https://github.com/LouisMazel/relizy/commit/d068175))

  Add twitterOnlyStable option to control whether prerelease versions
  (alpha, beta, rc, etc.) should be posted to Twitter.
  - New configuration option release.twitterOnlyStable (default: true)
    - When enabled, only stable versions will be posted to Twitter
    - Prerelease versions will be skipped automatically
  - CLI flag --no-twitter-only-stable to allow Twitter posts for
    prerelease versions when needed
  - Updated handleTwitterPost function to check if version is
    a prerelease before posting
    By default, Twitter posting is now limited to stable versions only.
    Users can override this with:
    - Config: release.twitterOnlyStable: false
    - CLI: --no-twitter-only-stable flag
      Stable release (v1.0.0): Will be posted to Twitter
      Prerelease (v1.0.0-beta.1): Will be skipped (unless configured)

- **release:** ⚠️ Add Slack integration to social media posting ([5cb4fb6](https://github.com/LouisMazel/relizy/commit/5cb4fb6))

  BREAKING CHANGE: Add comprehensive Slack support to social command
  - Add SlackSocialConfig, SlackCredentials, SlackOptions types
  - Install @slack/web-api dependency for Slack Web API integration
  - Create src/core/slack.ts with Slack posting functionality
    - Support for rich blocks format (default) or custom templates
    - Automatic markdown to Slack mrkdwn conversion
    - Channel and token configuration with environment variable fallback
  - Create src/core/social-utils.ts for shared utilities
    - extractChangelogSummary() for changelog condensing
    - getReleaseUrl() for release URL generation
    - Shared between Twitter and Slack implementations
  - Add changelogUrl to SocialConfig for full changelog links
  - Update Twitter integration to support changelogUrl
  - Integrate Slack into social.ts with handleSlackPost()
    - Add safety checks for Slack credentials and channel
    - Support for before:slack, success:slack, error:slack hooks
    - Skip prerelease versions with onlyStable option
  - Add default Slack configuration and templates
  - Add 'slack' to HookStep type for hook support
    Features:
  - Post release announcements to any Slack workspace
  - Rich interactive messages with buttons (View Release, Full Changelog)
  - Configurable channel (supports both names and IDs)
  - Template support for custom message formatting
  - Smart changelog condensing with full changelog links
  - Dry-run support for testing

- **release:** Add partial Bitbucket support ([b7f1d3c](https://github.com/LouisMazel/relizy/commit/b7f1d3c))

  Add Bitbucket as a supported Git provider with limited functionality.
  Bitbucket does not have a releases API like GitHub/GitLab, so releases
  are skipped for Bitbucket repositories.
  Changes:
  - Add 'bitbucket' to GitProvider type
  - Update detectGitProvider() to detect Bitbucket repositories
    - Checks for 'bitbucket.org' or 'bitbucket' in remote URL
  - Update getReleaseUrl() to generate Bitbucket tag URLs
    - Format: https://{domain}/{repo}/commits/tag/{tag}
  - Update providerReleaseSafetyCheck() to handle Bitbucket
    - Shows informative warning that releases are not supported
    - Allows other features (versioning, changelog, publishing, social) to work
  - Update providerRelease() to skip release creation for Bitbucket
    - Returns empty postedReleases array
    - Logs clear warning messages
    - Still triggers success hooks
      Bitbucket support includes:
      ✅ Git provider detection
      ✅ Tag URLs for social media posts
      ✅ Compare URLs in changelog (via changelogen 0.6.2+)
      ✅ Versioning, changelog generation
      ✅ NPM publishing
      ✅ Social media posting (Twitter/Slack)
      ❌ Release creation (not available in Bitbucket API)
      The compare URLs in changelogs are automatically handled by changelogen
      which supports Bitbucket format: /branches/compare/{tag2}..{tag1}

- **relizy:** Add global tokens configuration for Twitter and Slack ([0492d3c](https://github.com/LouisMazel/relizy/commit/0492d3c))

  Add centralized token management in the global config.tokens object,
  with priority system for credential resolution.
  Changes:
  - Create Tokens interface in types.ts with support for:
    - github: GitHub token
    - gitlab: GitLab token
    - twitter: Twitter API credentials (apiKey, apiSecret, accessToken, accessTokenSecret)
    - slack: Slack bot token
  - Update RelizyConfig to:
    - Omit 'tokens' from IChangelogConfig (avoid conflict)
    - Add tokens?: Tokens property
  - Update config.ts to populate tokens from environment variables:
    - twitter.apiKey: TWITTER_API_KEY or RELIZY_TWITTER_API_KEY
    - twitter.apiSecret: TWITTER_API_SECRET or RELIZY_TWITTER_API_SECRET
    - twitter.accessToken: TWITTER_ACCESS_TOKEN or RELIZY_TWITTER_ACCESS_TOKEN
    - twitter.accessTokenSecret: TWITTER_ACCESS_TOKEN_SECRET or RELIZY_TWITTER_ACCESS_TOKEN_SECRET
    - slack: SLACK_TOKEN or RELIZY_SLACK_TOKEN
  - Update getTwitterCredentials() to use priority system:
    1. social.twitter.credentials (specific config)
    2. config.tokens.twitter (global config)
    3. Environment variables (handled in config.ts)
  - Update getSlackToken() to use priority system:
    1. social.slack.credentials (specific config)
    2. config.tokens.slack (global config)
    3. Environment variables (handled in config.ts)
  - Update social.ts to pass both credential sources to helpers
    Benefits:
  - Centralized token management
  - Clear priority system (specific > global > env)
  - Consistent with GitHub/GitLab token pattern
  - Users can configure tokens once in config.tokens or per-platform in social.\*
  - Better developer experience with multiple configuration options

- **relizy:** Add Codecov integration with optimal configuration ([810b21c](https://github.com/LouisMazel/relizy/commit/810b21c))
- **docs:** Add contributors section ([38425bd](https://github.com/LouisMazel/relizy/commit/38425bd))
- Improve error reporting for social and provider-release steps ([6d85e7a](https://github.com/LouisMazel/relizy/commit/6d85e7a))

  Social media and provider release failures are now non-blocking and
  provide detailed feedback in the final release summary.
  Changes:
  - Social command returns SocialResult with per-platform details
  - Provider-release returns errors in result instead of throwing
  - Release workflow displays detailed status in final log box
    Example output:
    Social media: 1 succeeded, 1 failed (slack)
    Provider release: Failed: Invalid token
    This allows releases to continue even if external services fail,
    while giving users full visibility into what succeeded or failed.

- `safetyCheck` is enable by default ([aea2dec](https://github.com/LouisMazel/relizy/commit/aea2dec))
- Add config to choose the max length of the twitter post ([7c98abb](https://github.com/LouisMazel/relizy/commit/7c98abb))

### 🩹 Fixes

- **release:** Add optional chaining for createdTags in success logger ([aa7928b](https://github.com/LouisMazel/relizy/commit/aa7928b))
  - Fix TypeError when createdTags is undefined in tests
  - Use optional chaining (createdTags?.length) to safely access length
  - Change fallback text from 'No' to 'None' for clarity
  - Resolves 41 E2E test failures
  - Progress: 692/862 tests passing (80.3%)

- Remove postinstall script ([ac8187a](https://github.com/LouisMazel/relizy/commit/ac8187a))

### 💅 Refactors

- Restructure social media configuration ([064cefb](https://github.com/LouisMazel/relizy/commit/064cefb))

  Refactor the social media posting configuration to be more
  modular and extensible for future platforms.
  - Removed twitter and twitterOnlyStable from ReleaseConfig
  - Added new release.social flag to enable all social media posting
  - Created new SocialConfig interface with platform-specific configs
  - Added social.twitter configuration section with:
    - enabled: Enable/disable Twitter posting
    - onlyStable: Skip prereleases (default: true)
    - messageTemplate: Custom tweet template
    - credentials: Optional Twitter API credentials (falls back to env vars)
  - More scalable architecture for adding new platforms
    (LinkedIn, Slack, Discord, etc.)
  - Cleaner separation of concerns
  - Platform-specific configuration
  - Credentials can be in config or environment variables
    Before:
    release: {
    twitter: true,
    twitterOnlyStable: true
    }
    After:
    release: {
    social: true
    },
    social: {
    twitter: {
    enabled: true,
    onlyStable: true
    }
    }
  - Replaced --twitter flag with --social
  - Removed --no-twitter-only-stable flag (use config instead)
  - Created ResolvedTwitterCredentials type for type safety
  - Updated getTwitterCredentials to accept config credentials
  - Refactored handleTwitterPost to use new config structure
  - Updated release workflow step label to "social media"

- Create standalone social command ([f3bdcd4](https://github.com/LouisMazel/relizy/commit/f3bdcd4))

  Create a dedicated social command that can be used independently
  or as part of the release workflow.
  - Created src/commands/social.ts with:
    - social() function - Main command implementation
    - socialSafetyCheck() - Validates social media credentials
    - handleTwitterPost() - Handles Twitter posting logic
    - Full changelog generation from git commits
  - Added new command: relizy social --from x.x.x --to x.x.x
  - Changed release flag from --social to --no-social
  - Default behavior: social posting is enabled (disable with --no-social)
  - Updated release.ts to call social() command instead of inline logic
  - Integrated socialSafetyCheck() in releaseSafetyCheck()
  - Removed handleTwitterPost from release.ts (moved to social.ts)
  - Changed release.social default from false to true
  - Social posting now enabled by default in release workflow
  - Use --no-social flag to disable during release
  - Added SocialOptions interface for command options
  - Added 'social' to HookStep type for hooks support
  - Modular: Social posting can be used independently
  - Reusable: Same logic in release and standalone command
  - Testable: Easier to test social posting in isolation
  - Extensible: Easy to add new social platforms
  - Safety: Validates credentials before attempting to post
    Standalone:
    relizy social --from v1.0.0 --to v1.1.0
    In release workflow:
    relizy release # Social posting enabled by default
    relizy release --no-social # Disable social posting

- **release:** Use bumpResult fallback when postedReleases unavailable ([f11e75f](https://github.com/LouisMazel/relizy/commit/f11e75f))
  - Add buildPostedReleasesFromBumpResult() to create releases from bump result
  - Implement priority system: postedReleases first, then bumpResult fallback
  - Handle independent, unified, and selective version modes
  - Add comprehensive logging with [social] and [social:twitter] prefixes
  - Ensure social posting works even when GitHub/GitLab releases are disabled
    This allows the social command to function independently of provider releases,
    making it more flexible and reliable in various release configurations.

- Put social dependencies in peerDependencies ([b51c011](https://github.com/LouisMazel/relizy/commit/b51c011))
- **docs:** Add social features to sidebar and navbar ([424cf33](https://github.com/LouisMazel/relizy/commit/424cf33))
- Social - improve format of twitter post ([bea4991](https://github.com/LouisMazel/relizy/commit/bea4991))
- Improve logs of safety check methods ([3c25d6d](https://github.com/LouisMazel/relizy/commit/3c25d6d))
- Improve logs of safety check methods ([e0601d8](https://github.com/LouisMazel/relizy/commit/e0601d8))
- Improve social safety check Checking if twitter-api-v2 and/or @slack/web-api are installed if needed ([d24c49c](https://github.com/LouisMazel/relizy/commit/d24c49c))

### 📖 Documentation

- Add social media integration documentation ([266da58](https://github.com/LouisMazel/relizy/commit/266da58))
  - Simplified README.md with social media features
  - Added comprehensive social media guides (overview, Twitter, Slack)
  - Updated provider-release docs with Bitbucket limitations
  - Fixed release config documentation (providerRelease property)
  - Updated config overview with social tokens

- Add link to CONTRIBUTING.md in README PR guidelines ([af862de](https://github.com/LouisMazel/relizy/commit/af862de))
- Add complete social media documentation and SEO metadata ([9101672](https://github.com/LouisMazel/relizy/commit/9101672))
  - Create docs/src/config/social.md with detailed configuration reference
  - Create docs/src/api/social.md with API documentation and examples
  - Create docs/src/cli/social.md with CLI usage guide
  - Add SEO frontmatter metadata to slack-integration.md guide
  - Add SEO frontmatter metadata to social-media.md guide
  - Add SEO frontmatter metadata to twitter-integration.md guide
  - Document Twitter and Slack configuration options, credentials, templates
  - Include CI/CD integration examples for GitHub Actions and GitLab CI
  - Add troubleshooting sections and complete usage examples

### 📦 Build

- Upgrade dependencies ([e2b07e8](https://github.com/LouisMazel/relizy/commit/e2b07e8))

#### ⚠️ Breaking Changes

- **release:** ⚠️ Add Slack integration to social media posting ([5cb4fb6](https://github.com/LouisMazel/relizy/commit/5cb4fb6))

  BREAKING CHANGE: Add comprehensive Slack support to social command
  - Add SlackSocialConfig, SlackCredentials, SlackOptions types
  - Install @slack/web-api dependency for Slack Web API integration
  - Create src/core/slack.ts with Slack posting functionality
    - Support for rich blocks format (default) or custom templates
    - Automatic markdown to Slack mrkdwn conversion
    - Channel and token configuration with environment variable fallback
  - Create src/core/social-utils.ts for shared utilities
    - extractChangelogSummary() for changelog condensing
    - getReleaseUrl() for release URL generation
    - Shared between Twitter and Slack implementations
  - Add changelogUrl to SocialConfig for full changelog links
  - Update Twitter integration to support changelogUrl
  - Integrate Slack into social.ts with handleSlackPost()
    - Add safety checks for Slack credentials and channel
    - Support for before:slack, success:slack, error:slack hooks
    - Skip prerelease versions with onlyStable option
  - Add default Slack configuration and templates
  - Add 'slack' to HookStep type for hook support
    Features:
  - Post release announcements to any Slack workspace
  - Rich interactive messages with buttons (View Release, Full Changelog)
  - Configurable channel (supports both names and IDs)
  - Template support for custom message formatting
  - Smart changelog condensing with full changelog links
  - Dry-run support for testing

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.0.0-beta.2...v1.0.0-beta.3

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.0.0-beta.2...v1.0.0-beta.3)

### 💅 Refactors

- Improve logs of safety check methods ([0bb788a](https://github.com/LouisMazel/relizy/commit/0bb788a))

### 📦 Build

- Upgrade dependencies ([5336e48](https://github.com/LouisMazel/relizy/commit/5336e48))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.0.0-beta.1...v1.0.0-beta.2

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.0.0-beta.1...v1.0.0-beta.2)

### 🚀 Features

- Add config to choose the max length of the twitter post ([da73a00](https://github.com/LouisMazel/relizy/commit/da73a00))

### 💅 Refactors

- Social - improve format of twitter post ([1043d2a](https://github.com/LouisMazel/relizy/commit/1043d2a))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.0.0-beta.0...v1.0.0-beta.1

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.0.0-beta.0...v1.0.0-beta.1)

### 🚀 Features

- `safetyCheck` is enable by default ([075dc4e](https://github.com/LouisMazel/relizy/commit/075dc4e))

### 🩹 Fixes

- Remove postinstall script ([ea98dff](https://github.com/LouisMazel/relizy/commit/ea98dff))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.3.0...v1.0.0-beta.0

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.3.0...v1.0.0-beta.0)

### 🚀 Features

- Add automatic Twitter posting for releases ([684f92b](https://github.com/LouisMazel/relizy/commit/684f92b))

  Add functionality to automatically post release announcements
  to Twitter when a new version is published.
  - New Twitter integration module (src/core/twitter.ts) with:
    - Twitter credentials management from environment variables
    - Tweet message formatting with customizable templates
    - Release URL generation for GitHub/GitLab
    - Changelog summary extraction
    - Smart truncation to fit Twitter's 280 character limit
  - Configuration support:
    - release.twitter option to enable/disable Twitter posting
    - templates.twitterMessage for custom tweet templates
    - Environment variables for Twitter API credentials:
      - TWITTER_API_KEY / RELIZY_TWITTER_API_KEY
      - TWITTER_API_SECRET / RELIZY_TWITTER_API_SECRET
      - TWITTER_ACCESS_TOKEN / RELIZY_TWITTER_ACCESS_TOKEN
      - TWITTER_ACCESS_TOKEN_SECRET / RELIZY_TWITTER_ACCESS_TOKEN_SECRET
  - CLI support:
    - --twitter flag for the release command to enable Twitter posting
    - Hooks support: before:twitter, success:twitter, error:twitter
  - Integration:
    - Added as Step 7/7 in the release workflow
    - Non-blocking: Twitter posting failures won't fail the release
    - Dry-run support for testing
  - Added twitter-api-v2 for Twitter API integration
    Enable Twitter posting with environment variables set:
    relizy release --twitter
    Or configure in relizy.config.ts:
    export default defineConfig({
    release: {
    twitter: true
    }
    })

- Add option to skip Twitter posts for prerelease versions ([e263972](https://github.com/LouisMazel/relizy/commit/e263972))

  Add twitterOnlyStable option to control whether prerelease versions
  (alpha, beta, rc, etc.) should be posted to Twitter.
  - New configuration option release.twitterOnlyStable (default: true)
    - When enabled, only stable versions will be posted to Twitter
    - Prerelease versions will be skipped automatically
  - CLI flag --no-twitter-only-stable to allow Twitter posts for
    prerelease versions when needed
  - Updated handleTwitterPost function to check if version is
    a prerelease before posting
    By default, Twitter posting is now limited to stable versions only.
    Users can override this with:
    - Config: release.twitterOnlyStable: false
    - CLI: --no-twitter-only-stable flag
      Stable release (v1.0.0): Will be posted to Twitter
      Prerelease (v1.0.0-beta.1): Will be skipped (unless configured)

- **release:** ⚠️ Add Slack integration to social media posting ([7a32114](https://github.com/LouisMazel/relizy/commit/7a32114))

  BREAKING CHANGE: Add comprehensive Slack support to social command
  - Add SlackSocialConfig, SlackCredentials, SlackOptions types
  - Install @slack/web-api dependency for Slack Web API integration
  - Create src/core/slack.ts with Slack posting functionality
    - Support for rich blocks format (default) or custom templates
    - Automatic markdown to Slack mrkdwn conversion
    - Channel and token configuration with environment variable fallback
  - Create src/core/social-utils.ts for shared utilities
    - extractChangelogSummary() for changelog condensing
    - getReleaseUrl() for release URL generation
    - Shared between Twitter and Slack implementations
  - Add changelogUrl to SocialConfig for full changelog links
  - Update Twitter integration to support changelogUrl
  - Integrate Slack into social.ts with handleSlackPost()
    - Add safety checks for Slack credentials and channel
    - Support for before:slack, success:slack, error:slack hooks
    - Skip prerelease versions with onlyStable option
  - Add default Slack configuration and templates
  - Add 'slack' to HookStep type for hook support
    Features:
  - Post release announcements to any Slack workspace
  - Rich interactive messages with buttons (View Release, Full Changelog)
  - Configurable channel (supports both names and IDs)
  - Template support for custom message formatting
  - Smart changelog condensing with full changelog links
  - Dry-run support for testing

- **release:** Add partial Bitbucket support ([ff5cd79](https://github.com/LouisMazel/relizy/commit/ff5cd79))

  Add Bitbucket as a supported Git provider with limited functionality.
  Bitbucket does not have a releases API like GitHub/GitLab, so releases
  are skipped for Bitbucket repositories.
  Changes:
  - Add 'bitbucket' to GitProvider type
  - Update detectGitProvider() to detect Bitbucket repositories
    - Checks for 'bitbucket.org' or 'bitbucket' in remote URL
  - Update getReleaseUrl() to generate Bitbucket tag URLs
    - Format: https://{domain}/{repo}/commits/tag/{tag}
  - Update providerReleaseSafetyCheck() to handle Bitbucket
    - Shows informative warning that releases are not supported
    - Allows other features (versioning, changelog, publishing, social) to work
  - Update providerRelease() to skip release creation for Bitbucket
    - Returns empty postedReleases array
    - Logs clear warning messages
    - Still triggers success hooks
      Bitbucket support includes:
      ✅ Git provider detection
      ✅ Tag URLs for social media posts
      ✅ Compare URLs in changelog (via changelogen 0.6.2+)
      ✅ Versioning, changelog generation
      ✅ NPM publishing
      ✅ Social media posting (Twitter/Slack)
      ❌ Release creation (not available in Bitbucket API)
      The compare URLs in changelogs are automatically handled by changelogen
      which supports Bitbucket format: /branches/compare/{tag2}..{tag1}

- **relizy:** Add global tokens configuration for Twitter and Slack ([caf16c4](https://github.com/LouisMazel/relizy/commit/caf16c4))

  Add centralized token management in the global config.tokens object,
  with priority system for credential resolution.
  Changes:
  - Create Tokens interface in types.ts with support for:
    - github: GitHub token
    - gitlab: GitLab token
    - twitter: Twitter API credentials (apiKey, apiSecret, accessToken, accessTokenSecret)
    - slack: Slack bot token
  - Update RelizyConfig to:
    - Omit 'tokens' from IChangelogConfig (avoid conflict)
    - Add tokens?: Tokens property
  - Update config.ts to populate tokens from environment variables:
    - twitter.apiKey: TWITTER_API_KEY or RELIZY_TWITTER_API_KEY
    - twitter.apiSecret: TWITTER_API_SECRET or RELIZY_TWITTER_API_SECRET
    - twitter.accessToken: TWITTER_ACCESS_TOKEN or RELIZY_TWITTER_ACCESS_TOKEN
    - twitter.accessTokenSecret: TWITTER_ACCESS_TOKEN_SECRET or RELIZY_TWITTER_ACCESS_TOKEN_SECRET
    - slack: SLACK_TOKEN or RELIZY_SLACK_TOKEN
  - Update getTwitterCredentials() to use priority system:
    1. social.twitter.credentials (specific config)
    2. config.tokens.twitter (global config)
    3. Environment variables (handled in config.ts)
  - Update getSlackToken() to use priority system:
    1. social.slack.credentials (specific config)
    2. config.tokens.slack (global config)
    3. Environment variables (handled in config.ts)
  - Update social.ts to pass both credential sources to helpers
    Benefits:
  - Centralized token management
  - Clear priority system (specific > global > env)
  - Consistent with GitHub/GitLab token pattern
  - Users can configure tokens once in config.tokens or per-platform in social.\*
  - Better developer experience with multiple configuration options

- **relizy:** Add Codecov integration with optimal configuration ([71f5226](https://github.com/LouisMazel/relizy/commit/71f5226))
- **docs:** Add contributors section ([b5a2a70](https://github.com/LouisMazel/relizy/commit/b5a2a70))
- Improve error reporting for social and provider-release steps ([2c17127](https://github.com/LouisMazel/relizy/commit/2c17127))

  Social media and provider release failures are now non-blocking and
  provide detailed feedback in the final release summary.
  Changes:
  - Social command returns SocialResult with per-platform details
  - Provider-release returns errors in result instead of throwing
  - Release workflow displays detailed status in final log box
    Example output:
    Social media: 1 succeeded, 1 failed (slack)
    Provider release: Failed: Invalid token
    This allows releases to continue even if external services fail,
    while giving users full visibility into what succeeded or failed.

### 🩹 Fixes

- **release:** Add optional chaining for createdTags in success logger ([886b3cd](https://github.com/LouisMazel/relizy/commit/886b3cd))
  - Fix TypeError when createdTags is undefined in tests
  - Use optional chaining (createdTags?.length) to safely access length
  - Change fallback text from 'No' to 'None' for clarity
  - Resolves 41 E2E test failures
  - Progress: 692/862 tests passing (80.3%)

### 💅 Refactors

- Restructure social media configuration ([f6b8384](https://github.com/LouisMazel/relizy/commit/f6b8384))

  Refactor the social media posting configuration to be more
  modular and extensible for future platforms.
  - Removed twitter and twitterOnlyStable from ReleaseConfig
  - Added new release.social flag to enable all social media posting
  - Created new SocialConfig interface with platform-specific configs
  - Added social.twitter configuration section with:
    - enabled: Enable/disable Twitter posting
    - onlyStable: Skip prereleases (default: true)
    - messageTemplate: Custom tweet template
    - credentials: Optional Twitter API credentials (falls back to env vars)
  - More scalable architecture for adding new platforms
    (LinkedIn, Slack, Discord, etc.)
  - Cleaner separation of concerns
  - Platform-specific configuration
  - Credentials can be in config or environment variables
    Before:
    release: {
    twitter: true,
    twitterOnlyStable: true
    }
    After:
    release: {
    social: true
    },
    social: {
    twitter: {
    enabled: true,
    onlyStable: true
    }
    }
  - Replaced --twitter flag with --social
  - Removed --no-twitter-only-stable flag (use config instead)
  - Created ResolvedTwitterCredentials type for type safety
  - Updated getTwitterCredentials to accept config credentials
  - Refactored handleTwitterPost to use new config structure
  - Updated release workflow step label to "social media"

- Create standalone social command ([4c8f20a](https://github.com/LouisMazel/relizy/commit/4c8f20a))

  Create a dedicated social command that can be used independently
  or as part of the release workflow.
  - Created src/commands/social.ts with:
    - social() function - Main command implementation
    - socialSafetyCheck() - Validates social media credentials
    - handleTwitterPost() - Handles Twitter posting logic
    - Full changelog generation from git commits
  - Added new command: relizy social --from x.x.x --to x.x.x
  - Changed release flag from --social to --no-social
  - Default behavior: social posting is enabled (disable with --no-social)
  - Updated release.ts to call social() command instead of inline logic
  - Integrated socialSafetyCheck() in releaseSafetyCheck()
  - Removed handleTwitterPost from release.ts (moved to social.ts)
  - Changed release.social default from false to true
  - Social posting now enabled by default in release workflow
  - Use --no-social flag to disable during release
  - Added SocialOptions interface for command options
  - Added 'social' to HookStep type for hooks support
  - Modular: Social posting can be used independently
  - Reusable: Same logic in release and standalone command
  - Testable: Easier to test social posting in isolation
  - Extensible: Easy to add new social platforms
  - Safety: Validates credentials before attempting to post
    Standalone:
    relizy social --from v1.0.0 --to v1.1.0
    In release workflow:
    relizy release # Social posting enabled by default
    relizy release --no-social # Disable social posting

- **release:** Use bumpResult fallback when postedReleases unavailable ([06909f8](https://github.com/LouisMazel/relizy/commit/06909f8))
  - Add buildPostedReleasesFromBumpResult() to create releases from bump result
  - Implement priority system: postedReleases first, then bumpResult fallback
  - Handle independent, unified, and selective version modes
  - Add comprehensive logging with [social] and [social:twitter] prefixes
  - Ensure social posting works even when GitHub/GitLab releases are disabled
    This allows the social command to function independently of provider releases,
    making it more flexible and reliable in various release configurations.

- Put social dependencies in peerDependencies ([6fcc1cb](https://github.com/LouisMazel/relizy/commit/6fcc1cb))
- **docs:** Add social features to sidebar and navbar ([1e61610](https://github.com/LouisMazel/relizy/commit/1e61610))

### 📖 Documentation

- Add social media integration documentation ([9e72531](https://github.com/LouisMazel/relizy/commit/9e72531))
  - Simplified README.md with social media features
  - Added comprehensive social media guides (overview, Twitter, Slack)
  - Updated provider-release docs with Bitbucket limitations
  - Fixed release config documentation (providerRelease property)
  - Updated config overview with social tokens

- Add link to CONTRIBUTING.md in README PR guidelines ([fe9b08f](https://github.com/LouisMazel/relizy/commit/fe9b08f))
- Add complete social media documentation and SEO metadata ([2548a2c](https://github.com/LouisMazel/relizy/commit/2548a2c))
  - Create docs/src/config/social.md with detailed configuration reference
  - Create docs/src/api/social.md with API documentation and examples
  - Create docs/src/cli/social.md with CLI usage guide
  - Add SEO frontmatter metadata to slack-integration.md guide
  - Add SEO frontmatter metadata to social-media.md guide
  - Add SEO frontmatter metadata to twitter-integration.md guide
  - Document Twitter and Slack configuration options, credentials, templates
  - Include CI/CD integration examples for GitHub Actions and GitLab CI
  - Add troubleshooting sections and complete usage examples

#### ⚠️ Breaking Changes

- **release:** ⚠️ Add Slack integration to social media posting ([7a32114](https://github.com/LouisMazel/relizy/commit/7a32114))

  BREAKING CHANGE: Add comprehensive Slack support to social command
  - Add SlackSocialConfig, SlackCredentials, SlackOptions types
  - Install @slack/web-api dependency for Slack Web API integration
  - Create src/core/slack.ts with Slack posting functionality
    - Support for rich blocks format (default) or custom templates
    - Automatic markdown to Slack mrkdwn conversion
    - Channel and token configuration with environment variable fallback
  - Create src/core/social-utils.ts for shared utilities
    - extractChangelogSummary() for changelog condensing
    - getReleaseUrl() for release URL generation
    - Shared between Twitter and Slack implementations
  - Add changelogUrl to SocialConfig for full changelog links
  - Update Twitter integration to support changelogUrl
  - Integrate Slack into social.ts with handleSlackPost()
    - Add safety checks for Slack credentials and channel
    - Support for before:slack, success:slack, error:slack hooks
    - Skip prerelease versions with onlyStable option
  - Add default Slack configuration and templates
  - Add 'slack' to HookStep type for hook support
    Features:
  - Post release announcements to any Slack workspace
  - Rich interactive messages with buttons (View Release, Full Changelog)
  - Configurable channel (supports both names and IDs)
  - Template support for custom message formatting
  - Smart changelog condensing with full changelog links
  - Dry-run support for testing

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.8...v0.3.0

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.8...v0.3.0)

### 🚀 Features

- Add support of registry token in config.tokens.registry and config.publish.token ([54b2d26](https://github.com/LouisMazel/relizy/commit/54b2d26))

### 🩹 Fixes

- Prevent git state pollution on publish failure ([444006e](https://github.com/LouisMazel/relizy/commit/444006e))

  The release workflow now publishes packages BEFORE creating git commits and tags,
  preventing state pollution when npm publish fails.
  **What changed:**
  - Step order reorganized: Bump → Changelog → Publish → Commit → Tag → Push
  - Automatic rollback of modified files if publish fails (package.json, CHANGELOG.md)
  - Only release-related files are restored, preserving any other local changes
    **Why this matters:**
    Previously, if publish failed (e.g., authentication error, OTP required), the git
    commit and tags were already created and pushed to remote, making it impossible to
    retry cleanly. Now, if publish fails, your repository stays in a clean state and
    you can simply retry the command.
    The rollback is smart: it only restores files that were modified by the bump and
    changelog steps, leaving your other work untouched.

- Detect OTP errors from npm two-factor authentication messages ([596dcfe](https://github.com/LouisMazel/relizy/commit/596dcfe))

  The interactive OTP prompt now works correctly when publishing to npm with
  two-factor authentication enabled. Previously, it would fail to detect OTP
  requirements and throw an error instead of asking for your code.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.7...v0.2.8

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.7...v0.2.8)

### 🩹 Fixes

- Prevent incorrect version bumps from incompatible future tags ([2ca91e4](https://github.com/LouisMazel/relizy/commit/2ca91e4))

  When bumping a stable version (e.g., 4.1.1 → 4.1.2), the system could
  incorrectly use tags from future major versions (e.g., v5.0.0-beta.0) as
  reference points, causing version calculation errors.
  This fix introduces intelligent tag filtering that:
  - Filters out tags with major versions higher than the current version
  - Filters out prerelease tags when bumping stable to stable
  - Preserves prerelease tags when working with prerelease versions
    Usage: No changes required - the filtering is automatic based on your
    current package version.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.6...v0.2.7

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.6...v0.2.7)

### 💅 Refactors

- Log errors in cli ([63d6418](https://github.com/LouisMazel/relizy/commit/63d6418))
- Rename option configName of loadRelizyConfig to configFile ([a720569](https://github.com/LouisMazel/relizy/commit/a720569))

### 📦 Build

- Upgrade dependencies ([16da2f1](https://github.com/LouisMazel/relizy/commit/16da2f1))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.5...v0.2.6

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.5...v0.2.6)

### 🩹 Fixes

- **docs:** Correct config examples ([07248ad](https://github.com/LouisMazel/relizy/commit/07248ad))
- Config type declaration - types is not required - #11 ([#11](https://github.com/LouisMazel/relizy/issues/11))
- Exclude commits for untracked packages to avoid incorrect version updates ([27e3d91](https://github.com/LouisMazel/relizy/commit/27e3d91))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.6-beta.1...v0.2.6-beta.2

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.6-beta.1...v0.2.6-beta.2)

### 🩹 Fixes

- **docs:** Correct config examples ([50d1998](https://github.com/LouisMazel/relizy/commit/50d1998))
- Config type declaration - types is not required - #11 ([#11](https://github.com/LouisMazel/relizy/issues/11))
- **docs:** Correct config examples ([07248ad](https://github.com/LouisMazel/relizy/commit/07248ad))
- Config type declaration - types is not required - #11 ([#11](https://github.com/LouisMazel/relizy/issues/11))
- Exclude commits for untracked packages to avoid incorrect version updates ([27e3d91](https://github.com/LouisMazel/relizy/commit/27e3d91))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.6-beta.0...v0.2.6-beta.1

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.6-beta.0...v0.2.6-beta.1)

No relevant changes since last release

## v0.2.5...v0.2.6-beta.0

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.5...v0.2.6-beta.0)

### 🩹 Fixes

- **docs:** Correct config examples ([50d1998](https://github.com/LouisMazel/relizy/commit/50d1998))
- Config type declaration - types is not required - #11 ([#11](https://github.com/LouisMazel/relizy/issues/11))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.4...v0.2.5

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.4...v0.2.5)

### 🚀 Features

- Add option to skip git tag creation during release ([5fe056d](https://github.com/LouisMazel/relizy/commit/5fe056d))

  Allow users to disable tag creation during release using the
  `--no-git-tag` flag. Useful when you want to publish and push
  commits without creating git tags.
  Usage: relizy release --no-git-tag

- **docs:** Document gitTag option and improve release examples ([13f9d32](https://github.com/LouisMazel/relizy/commit/13f9d32))
- Publish - add optional safety check to check package registry authentication ([0d9c2e0](https://github.com/LouisMazel/relizy/commit/0d9c2e0))
  - Only for npm and pnpm (not yarn and bun)
  - Is disabled by default
  - To enable it, set 'config.publish.safety' to true

### 🩹 Fixes

- Changelog generation with wrong tags ([15154ad](https://github.com/LouisMazel/relizy/commit/15154ad))
- Exclude modify files from commit body ([9f60547](https://github.com/LouisMazel/relizy/commit/9f60547))
- Improve checking of package to bump before running release ([f70e1eb](https://github.com/LouisMazel/relizy/commit/f70e1eb))
- Do not compute new version of root package in independent mode ([17a6ff2](https://github.com/LouisMazel/relizy/commit/17a6ff2))
- Get github user profiles only if its github release ([d38e61e](https://github.com/LouisMazel/relizy/commit/d38e61e))
- **docs:** Correct package.json config example ([0ac9b1b](https://github.com/LouisMazel/relizy/commit/0ac9b1b))
- Publish - print new version instead the old in publish log ([ead28af](https://github.com/LouisMazel/relizy/commit/ead28af))
- Don't throw an error when a folder in glob patterns has not package.json, ignore the package instead ([0f341aa](https://github.com/LouisMazel/relizy/commit/0f341aa))
- Don't throw an error when a folder in glob patterns has not package.json, ignore the package instead ([271ce5f](https://github.com/LouisMazel/relizy/commit/271ce5f))
- Bump - don't exit with error when no relevant commits to bump ([a5a58f5](https://github.com/LouisMazel/relizy/commit/a5a58f5))
- Release - errors when release stable version from prerelease ([a86a2e4](https://github.com/LouisMazel/relizy/commit/a86a2e4))

### 💅 Refactors

- Use a log debug when version has changed preid" ([f0e658c](https://github.com/LouisMazel/relizy/commit/f0e658c))
- Improve circular dependencies detection ([bde3725](https://github.com/LouisMazel/relizy/commit/bde3725))
- Bump - improve confirm prompt with data ([c49f111](https://github.com/LouisMazel/relizy/commit/c49f111))
- Improve logs while bumping package version ([89f5f73](https://github.com/LouisMazel/relizy/commit/89f5f73))
- Improve publication logs to know exactly what is being published ([aa602ba](https://github.com/LouisMazel/relizy/commit/aa602ba))

### 📖 Documentation

- **docs:** Improve SEO meta ([06d094c](https://github.com/LouisMazel/relizy/commit/06d094c))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.5-beta.13...v0.2.5-beta.14

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.5-beta.13...v0.2.5-beta.14)

### 💅 Refactors

- Improve publication logs to know exactly what is being published ([56e0a9b](https://github.com/LouisMazel/relizy/commit/56e0a9b))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.5-beta.12...v0.2.5-beta.13

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.5-beta.12...v0.2.5-beta.13)

### 🚀 Features

- Publish - add optional safety check to check package registry authentication ([ff81c7a](https://github.com/LouisMazel/relizy/commit/ff81c7a))
  - Only for npm and pnpm (not yarn and bun)
  - Is disabled by default
  - To enable it, set 'config.publish.safety' to true

### 💅 Refactors

- Improve logs while bumping package version ([493d403](https://github.com/LouisMazel/relizy/commit/493d403))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.5-beta.6...v0.2.5-beta.12

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.5-beta.6...v0.2.5-beta.12)

### 🚀 Features

- Add option to skip git tag creation during release ([9700ccf](https://github.com/LouisMazel/relizy/commit/9700ccf))

  Allow users to disable tag creation during release using the
  `--no-git-tag` flag. Useful when you want to publish and push
  commits without creating git tags.
  Usage: relizy release --no-git-tag

- **docs:** Document gitTag option and improve release examples ([91ee4c3](https://github.com/LouisMazel/relizy/commit/91ee4c3))

### 🩹 Fixes

- **docs:** Correct package.json config example ([2294e31](https://github.com/LouisMazel/relizy/commit/2294e31))
- Publish - print new version instead the old in publish log ([3fc5c07](https://github.com/LouisMazel/relizy/commit/3fc5c07))
- Don't throw an error when a folder in glob patterns has not package.json, ignore the package instead ([757acae](https://github.com/LouisMazel/relizy/commit/757acae))
- Don't throw an error when a folder in glob patterns has not package.json, ignore the package instead ([337303f](https://github.com/LouisMazel/relizy/commit/337303f))
- Bump - don't exit with error when no relevant commits to bump ([f0cf9ce](https://github.com/LouisMazel/relizy/commit/f0cf9ce))
- Release - errors when release stable version from prerelease ([ee87638](https://github.com/LouisMazel/relizy/commit/ee87638))

### 💅 Refactors

- Bump - improve confirm prompt with data ([d8b5788](https://github.com/LouisMazel/relizy/commit/d8b5788))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.5-beta.6...v0.2.5-beta.10

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.5-beta.6...v0.2.5-beta.10)

### 🚀 Features

- Add option to skip git tag creation during release ([9700ccf](https://github.com/LouisMazel/relizy/commit/9700ccf))

  Allow users to disable tag creation during release using the
  `--no-git-tag` flag. Useful when you want to publish and push
  commits without creating git tags.
  Usage: relizy release --no-git-tag

- **docs:** Document gitTag option and improve release examples ([91ee4c3](https://github.com/LouisMazel/relizy/commit/91ee4c3))

### 🩹 Fixes

- **docs:** Correct package.json config example ([2294e31](https://github.com/LouisMazel/relizy/commit/2294e31))
- Publish - print new version instead the old in publish log ([3fc5c07](https://github.com/LouisMazel/relizy/commit/3fc5c07))
- Don't throw an error when a folder in glob patterns has not package.json, ignore the package instead ([757acae](https://github.com/LouisMazel/relizy/commit/757acae))
- Don't throw an error when a folder in glob patterns has not package.json, ignore the package instead ([337303f](https://github.com/LouisMazel/relizy/commit/337303f))

### 💅 Refactors

- Bump - improve confirm prompt with data ([d8b5788](https://github.com/LouisMazel/relizy/commit/d8b5788))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.5-beta.6...v0.2.5-beta.9

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.5-beta.6...v0.2.5-beta.9)

### 🚀 Features

- Add option to skip git tag creation during release ([9700ccf](https://github.com/LouisMazel/relizy/commit/9700ccf))

  Allow users to disable tag creation during release using the
  `--no-git-tag` flag. Useful when you want to publish and push
  commits without creating git tags.
  Usage: relizy release --no-git-tag

- **docs:** Document gitTag option and improve release examples ([91ee4c3](https://github.com/LouisMazel/relizy/commit/91ee4c3))

### 🩹 Fixes

- **docs:** Correct package.json config example ([2294e31](https://github.com/LouisMazel/relizy/commit/2294e31))
- Publish - print new version instead the old in publish log ([3fc5c07](https://github.com/LouisMazel/relizy/commit/3fc5c07))
- Don't throw an error when a folder in glob patterns has not package.json, ignore the package instead ([757acae](https://github.com/LouisMazel/relizy/commit/757acae))

### 💅 Refactors

- Bump - improve confirm prompt with data ([d8b5788](https://github.com/LouisMazel/relizy/commit/d8b5788))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.5-beta.6...v0.2.5-beta.8

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.5-beta.6...v0.2.5-beta.8)

### 🚀 Features

- Add option to skip git tag creation during release ([9700ccf](https://github.com/LouisMazel/relizy/commit/9700ccf))

  Allow users to disable tag creation during release using the
  `--no-git-tag` flag. Useful when you want to publish and push
  commits without creating git tags.
  Usage: relizy release --no-git-tag

- **docs:** Document gitTag option and improve release examples ([91ee4c3](https://github.com/LouisMazel/relizy/commit/91ee4c3))

### 🩹 Fixes

- **docs:** Correct package.json config example ([2294e31](https://github.com/LouisMazel/relizy/commit/2294e31))
- Publish - print new version instead the old in publish log ([3fc5c07](https://github.com/LouisMazel/relizy/commit/3fc5c07))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.5-beta.6...v0.2.5-beta.7

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.5-beta.6...v0.2.5-beta.7)

### 🚀 Features

- Add option to skip git tag creation during release ([9700ccf](https://github.com/LouisMazel/relizy/commit/9700ccf))

  Allow users to disable tag creation during release using the
  `--no-git-tag` flag. Useful when you want to publish and push
  commits without creating git tags.
  Usage: relizy release --no-git-tag

- **docs:** Document gitTag option and improve release examples ([91ee4c3](https://github.com/LouisMazel/relizy/commit/91ee4c3))

### 🩹 Fixes

- **docs:** Correct package.json config example ([2294e31](https://github.com/LouisMazel/relizy/commit/2294e31))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.5-beta.5...v0.2.5-beta.6

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.5-beta.5...v0.2.5-beta.6)

### 🩹 Fixes

- Get github user profiles only if its github release ([9f7c67c](https://github.com/LouisMazel/relizy/commit/9f7c67c))

### 📖 Documentation

- **docs:** Improve SEO meta ([df629e6](https://github.com/LouisMazel/relizy/commit/df629e6))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

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
