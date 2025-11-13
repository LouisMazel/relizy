---
title: GitLab CI
description: Complete guide to using Relizy with GitLab CI/CD.
keywords: gitlab ci, gitlab pipeline, gitlab ci cd, automated releases gitlab, gitlab automation
category: Guide
tags: [guide, gitlab, ci-cd, automation, pipeline]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Quick Start

Create `.gitlab-ci.yml`:

```yaml
release:
  image: node:20
  stage: deploy
  when: manual
  script:
    - npm ci
    - git config user.name "GitLab CI"
    - git config user.email "ci@gitlab.com"
    - relizy release --$RELEASE_TYPE --yes
  variables:
    GITLAB_TOKEN: $CI_JOB_TOKEN
  only:
    - main
```

## Pipeline Triggers

### Manual Trigger (Recommended)

Best for controlled releases:

```yaml
release:patch:
  image: node:20
  stage: deploy
  when: manual
  script:
    - npm ci
    - relizy release --patch --yes
  only:
    - main

release:minor:
  image: node:20
  stage: deploy
  when: manual
  script:
    - npm ci
    - relizy release --minor --yes
  only:
    - main

release:major:
  image: node:20
  stage: deploy
  when: manual
  script:
    - npm ci
    - relizy release --major --yes
  only:
    - main
```

### On Push to Main

Automatic releases:

```yaml
release:
  image: node:20
  stage: deploy
  script:
    - npm ci
    - git config user.name "GitLab CI"
    - git config user.email "ci@gitlab.com"
    - relizy release --yes
  only:
    - main
  except:
    changes:
      - '*.md'
      - 'docs/**'
```

### On Tag Push

Release when tags are pushed:

```yaml
publish:
  image: node:20
  stage: deploy
  script:
    - npm ci
    - relizy publish --yes
    - relizy provider-release --yes
  only:
    - tags
  except:
    - branches
```

### On Schedule

Automated periodic releases:

```yaml
scheduled_release:
  image: node:20
  stage: deploy
  script:
    - npm ci
    - relizy release --yes
  only:
    - schedules
```

Set up the schedule in GitLab: CI/CD → Schedules → New schedule

## Authentication

### GitLab Token

Use the predefined `CI_JOB_TOKEN`:

```yaml
variables:
  GITLAB_TOKEN: $CI_JOB_TOKEN
```

For wider permissions, use a Project Access Token:

1. Go to Settings → Access Tokens
2. Create token with `api` scope
3. Add as CI/CD variable: `GITLAB_TOKEN`

```yaml
variables:
  GITLAB_TOKEN: $GITLAB_PROJECT_TOKEN
```

### NPM Token

Add your NPM token as a protected variable:

1. Go to Settings → CI/CD → Variables
2. Add variable: `NPM_TOKEN`
3. Mark as Protected and Masked

```yaml
env:
  NODE_AUTH_TOKEN: $NPM_TOKEN
```

## Complete Pipelines

### Full Release Pipeline

```yaml
stages:
  - test
  - build
  - release

variables:
  NODE_VERSION: '20'

.node_base:
  image: node:$NODE_VERSION
  cache:
    key: $CI_COMMIT_REF_SLUG
    paths:
      - node_modules/
  before_script:
    - npm ci

test:
  extends: .node_base
  stage: test
  script:
    - npm run test
    - npm run lint

build:
  extends: .node_base
  stage: build
  script:
    - npm run build
  artifacts:
    paths:
      - dist/
    expire_in: 1 hour

release:
  extends: .node_base
  stage: release
  when: manual
  dependencies:
    - build
  script:
    - git config user.name "GitLab CI"
    - git config user.email "ci@gitlab.com"
    - relizy release --$RELEASE_TYPE --yes
  variables:
    GITLAB_TOKEN: $CI_JOB_TOKEN
    NODE_AUTH_TOKEN: $NPM_TOKEN
  only:
    - main
  environment:
    name: production
```

### Monorepo Pipeline

```yaml
stages:
  - prepare
  - test
  - build
  - release

.pnpm_base:
  image: node:20
  before_script:
    - npm install -g pnpm
    - pnpm install
  cache:
    key: $CI_COMMIT_REF_SLUG
    paths:
      - node_modules/
      - .pnpm-store/

test:
  extends: .pnpm_base
  stage: test
  script:
    - pnpm run test

build:
  extends: .pnpm_base
  stage: build
  script:
    - pnpm run build
  artifacts:
    paths:
      - packages/*/dist/

release:selective:
  extends: .pnpm_base
  stage: release
  when: manual
  dependencies:
    - build
  script:
    - git config user.name "GitLab CI"
    - git config user.email "ci@gitlab.com"
    - relizy release --selective --$RELEASE_TYPE --yes
  variables:
    GITLAB_TOKEN: $CI_JOB_TOKEN
    NODE_AUTH_TOKEN: $NPM_TOKEN
  only:
    - main
```

### Separate Bump and Publish

```yaml
stages:
  - bump
  - publish
  - release

bump_version:
  image: node:20
  stage: bump
  when: manual
  script:
    - npm ci
    - git config user.name "GitLab CI"
    - git config user.email "ci@gitlab.com"
    - relizy bump --$RELEASE_TYPE --yes
    - relizy changelog
    - git add .
    - git commit -m "chore(release):$(node -p "require('./package.json').version")"
    - git tag "v$(node -p "require('./package.json').version")"
    - git push origin main --follow-tags
  variables:
    GITLAB_TOKEN: $CI_JOB_TOKEN
  only:
    - main
  artifacts:
    reports:
      dotenv: version.env

publish_npm:
  image: node:20
  stage: publish
  dependencies:
    - bump_version
  script:
    - npm ci
    - npm run build
    - relizy publish --yes
  variables:
    NODE_AUTH_TOKEN: $NPM_TOKEN
  only:
    - tags

create_release:
  image: node:20
  stage: release
  dependencies:
    - publish_npm
  script:
    - relizy provider-release --yes
  variables:
    GITLAB_TOKEN: $GITLAB_PROJECT_TOKEN
  only:
    - tags
```

## Dynamic Variables

Pass release type dynamically:

```yaml
release:
  image: node:20
  stage: deploy
  when: manual
  script:
    - npm ci
    - relizy release --${RELEASE_TYPE:-patch} --yes
  variables:
    RELEASE_TYPE: patch # Default value
  only:
    - main
```

Override when running:

```bash
# In GitLab UI: Run Pipeline → Set variable
RELEASE_TYPE = minor
```

## Merge Request Integration

Release after MR is merged:

```yaml
release_on_merge:
  image: node:20
  stage: deploy
  script:
    - npm ci
    - relizy release --yes
  only:
    - merge_requests
  when: on_success
  rules:
    - if: $CI_MERGE_REQUEST_LABELS =~ /release/
```

## Parallel Package Publishing

For monorepos, publish packages in parallel:

```yaml
.publish_base:
  image: node:20
  stage: publish
  script:
    - npm ci
    - npm run build
    - relizy publish --yes
  variables:
    NODE_AUTH_TOKEN: $NPM_TOKEN
  only:
    - tags
```

## Environments

Use GitLab environments for release tracking:

```yaml
release:production:
  image: node:20
  stage: deploy
  when: manual
  script:
    - npm ci
    - relizy release --$RELEASE_TYPE --yes
  environment:
    name: production
    url: https://www.npmjs.com/package/my-package
  only:
    - main

release:staging:
  image: node:20
  stage: deploy
  when: manual
  script:
    - npm ci
    - relizy release --$RELEASE_TYPE --yes --tag beta
  environment:
    name: staging
    url: https://www.npmjs.com/package/my-package?activeTab=versions
  only:
    - develop
```

## Notifications

### Slack Notification

```yaml
notify:slack:
  image: curlimages/curl:latest
  stage: .post
  script:
    - |
      curl -X POST -H 'Content-Type: application/json' \
        -d '{"text": "🚀 New release deployed!"}' \
        $SLACK_WEBHOOK_URL
  when: on_success
  only:
    - main
```

### Email Notification

```yaml
release:
  image: node:20
  stage: deploy
  script:
    - relizy release --yes
  after_script:
    - echo "Release completed" | mail -s "Release Notification" team@example.com
  only:
    - main
```

## Best Practices

### 1. Use Protected Variables

Mark sensitive variables as protected:

- Settings → CI/CD → Variables
- Check "Protect variable"
- Check "Mask variable"

### 2. Cache Dependencies

Speed up pipelines:

```yaml
cache:
  key: ${CI_COMMIT_REF_SLUG}
  paths:
    - node_modules/
    - .pnpm-store/
```

### 3. Use Artifacts

Pass build outputs between jobs:

```yaml
build:
  script:
    - npm run build
  artifacts:
    paths:
      - dist/
    expire_in: 1 hour
```

### 4. Add Resource Group

Prevent concurrent releases:

```yaml
release:
  resource_group: release
  script:
    - relizy release --yes
```

### 5. Use Interruptible Jobs

Allow canceling redundant jobs:

```yaml
test:
  interruptible: true
  script:
    - npm test
```

## Troubleshooting

### Permission Denied on Git Push

Ensure `CI_JOB_TOKEN` has write access:

```yaml
variables:
  GIT_STRATEGY: clone
  GIT_DEPTH: 0
before_script:
  - git config user.name "GitLab CI"
  - git config user.email "ci@gitlab.com"
  - git remote set-url origin "https://gitlab-ci-token:${CI_JOB_TOKEN}@${CI_SERVER_HOST}/${CI_PROJECT_PATH}.git"
```

### NPM Publish Fails

Verify token:

```yaml
before_script:
  - echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > .npmrc
  - npm whoami
```

### No Git History

Fetch full history:

```yaml
variables:
  GIT_DEPTH: 0
```

### Protected Tags

Ensure CI can create tags:

- Settings → Repository → Protected tags
- Allow Maintainers to create

## Complete Example

```yaml
stages:
  - test
  - build
  - release

variables:
  NODE_VERSION: '20'
  GIT_DEPTH: 0

.node_base:
  image: node:$NODE_VERSION
  cache:
    key: $CI_COMMIT_REF_SLUG
    paths:
      - node_modules/
  before_script:
    - npm ci

# Test stage
test:unit:
  extends: .node_base
  stage: test
  script:
    - npm run test:unit
  coverage: '/Lines\s*:\s*(\d+\.\d+)%/'

test:lint:
  extends: .node_base
  stage: test
  script:
    - npm run lint

# Build stage
build:
  extends: .node_base
  stage: build
  script:
    - npm run build
  artifacts:
    paths:
      - dist/
    expire_in: 1 hour

# Release stage
.release_base:
  extends: .node_base
  stage: release
  dependencies:
    - build
  before_script:
    - npm ci
    - git config user.name "GitLab CI"
    - git config user.email "ci@gitlab.com"
  variables:
    GITLAB_TOKEN: $CI_JOB_TOKEN
    NODE_AUTH_TOKEN: $NPM_TOKEN
  only:
    - main
  resource_group: release

release:patch:
  extends: .release_base
  when: manual
  script:
    - relizy release --patch --yes

release:minor:
  extends: .release_base
  when: manual
  script:
    - relizy release --minor --yes

release:major:
  extends: .release_base
  when: manual
  script:
    - relizy release --major --yes
  environment:
    name: production
```

## Next Steps

- [GitHub Actions](github-actions.md) - GitHub Actions integration
- [CI/CD Setup](ci-cd.md) - General CI/CD best practices
- [CLI Reference](../cli/release.md) - Full command reference
