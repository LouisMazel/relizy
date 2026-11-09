### 🚀 Features

- **auth:** ⚠️ Rename the `token` option of `createClient` to `accessToken` ([#212](https://github.com/acme/app/pull/212))

  `token` was confused with the refresh token. Rename it in your client:

  ```ts
  import { createClient } from '@acme/app'

  export const client = createClient({ accessToken: process.env.ACME_TOKEN })
  ```

- **auth:** Renew the session in the background ([#215](https://github.com/acme/app/pull/215))

  Sessions expired after an hour. Pass `refreshToken: true` to `createClient` to renew them before they expire.

- Export the `AcmeError` class ([9f3c2ab](https://github.com/acme/app/commit/9f3c2ab))

### 🩹 Fixes

- **upload:** Resume an interrupted upload instead of starting over ([#208](https://github.com/acme/app/issues/208))
- **upload:** Keep the file name of a resumed upload ([4d1e7a0](https://github.com/acme/app/commit/4d1e7a0))
- Retry the requests failing with a 503 ([#219](https://github.com/acme/app/pull/219), [#201](https://github.com/acme/app/issues/201))

### 📖 Documentation

- Document the error codes ([c07b5d1](https://github.com/acme/app/commit/c07b5d1))

#### ⚠️ Breaking Changes

- **auth:** ⚠️ Rename the `token` option of `createClient` to `accessToken` ([#212](https://github.com/acme/app/pull/212))

  `token` was confused with the refresh token. Rename it in your client:

  ```ts
  import { createClient } from '@acme/app'

  export const client = createClient({ accessToken: process.env.ACME_TOKEN })
  ```
