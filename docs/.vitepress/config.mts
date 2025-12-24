import type { HeadConfig } from 'vitepress'
import { defineConfig, postcssIsolateStyles } from 'vitepress'
import packageJson from '../../package.json'
import typedocSidebar from '../src/typedoc/typedoc-sidebar.json'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  srcDir: 'src',
  lang: 'en-US',

  base: '/relizy/',

  title: 'Seamless and automated release manager',
  titleTemplate: ':title | Relizy',
  description: 'Seamless and automated release manager with elegant changelog generation based on Conventional Commits, supporting both monorepos and single packages. Handles version bumping, changelog generation, Git tagging, and publishing to npm, GitHub & GitLab effortlessly.',

  head: [
    ['meta', { name: 'author', content: 'Louis Mazel' }],
    ['meta', { property: 'og:image', content: 'https://louismazel.github.io/relizy/social.jpg' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:image', content: 'https://louismazel.github.io/relizy/social.jpg' }],
    ['link', { rel: 'icon', type: 'image/svg+xml', href: 'https://louismazel.github.io/relizy/logo.svg' }],
    ['meta', { name: 'twitter:creator', content: '@mazeel' }],
  ],

  appearance: true,
  lastUpdated: true,
  cleanUrls: true,
  ignoreDeadLinks: false,

  markdown: {
    theme: {
      light: 'github-light',
      dark: 'github-dark',
    },
    lineNumbers: false,
  },

  sitemap: {
    hostname: 'https://louismazel.github.io/relizy',
    transformItems: (items) => {
      // add new items or modify/filter existing items
      const modifyItems: typeof items = []

      for (const item of items) {
        if (item.url.includes('404')) {
          continue
        }

        const url = `relizy/${item.url}`

        modifyItems.push({
          ...item,
          url,
          changefreq: 'daily',
          priority: 1,
        })
      }

      return modifyItems
    },
  },

  // eslint-disable-next-line sonarjs/cognitive-complexity
  transformHead: ({ siteData, pageData, title, description, head }) => {
    const currentTitle = title ?? pageData.title ?? pageData.frontmatter.title ?? siteData.title
    const currentDescription = description ?? pageData.frontmatter.description ?? pageData.description ?? siteData.description

    const currentUrl = `https://louismazel.github.io/relizy/${pageData.relativePath.replace('.md', '') === 'index' ? '' : pageData.relativePath.replace('.md', '')}`

    const pageHead: HeadConfig[] = [
      ['meta', { name: 'og:site_name', content: 'Relizy' }],
      ['meta', { name: 'og:title', content: currentTitle }],
      ['link', { rel: 'canonical', href: currentUrl }],
      ['meta', { name: 'og:url', content: currentUrl }],
      ['meta', { name: 'og:type', content: pageData.relativePath === 'index.md' ? 'website' : 'article' }],
      ['meta', { name: 'description', content: currentDescription }],
      ['meta', { name: 'og:description', content: currentDescription }],
      ['meta', { name: 'twitter:title', content: currentTitle }],
      ['meta', { name: 'twitter:description', content: currentDescription }],
      ['meta', { name: 'twitter:image:alt', content: currentDescription }],
      ['meta', { name: 'og:image:alt', content: currentDescription }],
      ['meta', { name: 'og:updated_time', content: pageData.lastUpdated ? new Date(pageData.lastUpdated).toISOString() : new Date().toISOString() }],
      ['meta', { name: 'article:modified_time', content: pageData.lastUpdated ? new Date(pageData.lastUpdated).toISOString() : new Date().toISOString() }],
    ]

    // Add keywords from frontmatter
    if (pageData.frontmatter.keywords) {
      const keywords = typeof pageData.frontmatter.keywords === 'string'
        ? pageData.frontmatter.keywords
        // eslint-disable-next-line sonarjs/no-nested-conditional
        : Array.isArray(pageData.frontmatter.keywords)
          ? pageData.frontmatter.keywords.join(', ')
          : ''
      if (keywords) {
        pageHead.push(['meta', { name: 'keywords', content: keywords }])
      }
    }

    // Add article category
    if (pageData.frontmatter.category) {
      pageHead.push(['meta', { name: 'article:section', content: pageData.frontmatter.category }])
    }

    // Add article tags
    if (pageData.frontmatter.tags && Array.isArray(pageData.frontmatter.tags)) {
      for (const tag of pageData.frontmatter.tags) {
        pageHead.push(['meta', { property: 'article:tag', content: tag }])
      }
    }

    return [...head, ...pageHead]
  },

  themeConfig: {
    siteTitle: 'Relizy',
    logo: { src: 'https://raw.githubusercontent.com/LouisMazel/relizy/refs/heads/main/resources/logo.svg', alt: 'Relizy logo' },

    search: {
      provider: 'local',
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/LouisMazel/relizy' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/relizy' },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Made by LouisMazel with ❤️',
    },

    nav: [
      {
        text: 'Guide',
        items: [
          { text: 'What is Relizy?', link: '/guide/what-is-relizy' },
          { text: 'Getting Started', link: '/guide/getting-started' },
          { text: 'Installation', link: '/guide/installation' },
          { text: 'Version Modes', link: '/guide/version-modes' },
          { text: 'Dependency Management', link: '/guide/dependency-management' },
          { text: 'Changelog Generation', link: '/guide/changelog' },
          { text: 'Social Media Integration', link: '/guide/social-media' },
          { text: 'Twitter Integration', link: '/guide/twitter-integration' },
          { text: 'Slack Integration', link: '/guide/slack-integration' },
          { text: 'CI/CD Setup', link: '/guide/ci-cd' },
          { text: 'GitHub Actions', link: '/guide/github-actions' },
          { text: 'GitLab CI', link: '/guide/gitlab-ci' },
          { text: 'Migration', link: '/guide/migration-from-changelogen-monorepo' },
          { text: 'Contributing', link: '/guide/contributing' },
        ],
      },
      {
        text: 'Config',
        items: [
          { text: 'Overview', link: '/config/overview' },
          { text: 'Release Config', link: '/config/release' },
          { text: 'Monorepo Config', link: '/config/monorepo' },
          { text: 'Changelog Config', link: '/config/changelog' },
          { text: 'Bump Config', link: '/config/bump' },
          { text: 'Publish Config', link: '/config/publish' },
          { text: 'Social Config', link: '/config/social' },
          { text: 'Hooks Config', link: '/config/hooks' },
          { text: 'Multiple Configs', link: '/config/multiple-configs' },
        ],
      },
      {
        text: 'CLI',
        items: [
          { text: 'Overview', link: '/cli/commands' },
          { text: 'release', link: '/cli/release' },
          { text: 'bump', link: '/cli/bump' },
          { text: 'changelog', link: '/cli/changelog' },
          { text: 'publish', link: '/cli/publish' },
          { text: 'provider-release', link: '/cli/provider-release' },
          { text: 'social', link: '/cli/social' },
        ],
      },
      {
        text: 'API',
        items: [
          { text: 'Overview', link: '/api/usage' },
          { text: 'release()', link: '/api/release' },
          { text: 'loadRelizyConfig()', link: '/api/load-relizy-config' },
          { text: 'bump()', link: '/api/bump' },
          { text: 'changelog()', link: '/api/changelog' },
          { text: 'publish()', link: '/api/publish' },
          { text: 'providerRelease()', link: '/api/provider-release' },
          { text: 'createCommitAndTags()', link: '/api/create-commit-and-tags' },
          { text: 'social()', link: '/api/social' },
        ],
      },
      {
        text: `v${packageJson.version}`,
        items: [
          {
            text: 'Changelog',
            link: '/changelog',
          },
          {
            text: 'Migration from @maz-ui/changelogen-monorepo',
            link: '/guide/migration-from-changelogen-monorepo',
          },
          {
            text: 'Contributing',
            link: '/guide/contributing',
          },
        ],
      },
      {
        text: 'TypeDoc',
        items: typedocSidebar,
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'What is Relizy?', link: '/guide/what-is-relizy' },
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Installation', link: '/guide/installation' },
          ],
        },
        {
          text: 'Core Concepts',
          items: [
            { text: 'Version Modes', link: '/guide/version-modes' },
            { text: 'Dependency Management', link: '/guide/dependency-management' },
            { text: 'Changelog Generation', link: '/guide/changelog' },
          ],
        },
        {
          text: 'Social Media',
          items: [
            { text: 'Overview', link: '/guide/social-media' },
            { text: 'Twitter Integration', link: '/guide/twitter-integration' },
            { text: 'Slack Integration', link: '/guide/slack-integration' },
          ],
        },
        {
          text: 'Integration',
          items: [
            { text: 'CI/CD Setup', link: '/guide/ci-cd' },
            { text: 'GitHub Actions', link: '/guide/github-actions' },
            { text: 'GitLab CI', link: '/guide/gitlab-ci' },
          ],
        },
        {
          text: 'Migration',
          items: [
            { text: 'Migration from @maz-ui/changelogen-monorepo', link: '/guide/migration-from-changelogen-monorepo' },
          ],
        },
        {
          text: 'Contributing',
          items: [
            { text: 'Contributing Guide', link: '/guide/contributing' },
          ],
        },
      ],
      '/cli/': [
        {
          text: 'CLI Reference',
          items: [
            { text: 'Commands Overview', link: '/cli/commands' },
            { text: 'release', link: '/cli/release' },
            { text: 'bump', link: '/cli/bump' },
            { text: 'changelog', link: '/cli/changelog' },
            { text: 'publish', link: '/cli/publish' },
            { text: 'provider-release', link: '/cli/provider-release' },
            { text: 'social', link: '/cli/social' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'Programmatic API',
          items: [
            { text: 'API Usage', link: '/api/usage' },
            { text: 'release()', link: '/api/release' },
            { text: 'loadRelizyConfig()', link: '/api/load-relizy-config' },
            { text: 'bump()', link: '/api/bump' },
            { text: 'changelog()', link: '/api/changelog' },
            { text: 'publish()', link: '/api/publish' },
            { text: 'providerRelease()', link: '/api/provider-release' },
            { text: 'createCommitAndTags()', link: '/api/create-commit-and-tags' },
            { text: 'social()', link: '/api/social' },
          ],
        },
      ],
      '/config/': [
        {
          text: 'Configuration',
          items: [
            { text: 'Overview', link: '/config/overview' },
            { text: 'Release Config', link: '/config/release' },
            { text: 'Monorepo Config', link: '/config/monorepo' },
            { text: 'Changelog Config', link: '/config/changelog' },
            { text: 'Bump Config', link: '/config/bump' },
            { text: 'Publish Config', link: '/config/publish' },
            { text: 'Social Config', link: '/config/social' },
            { text: 'Hooks Config', link: '/config/hooks' },
            { text: 'Multiple Configs', link: '/config/multiple-configs' },
          ],
        },
      ],
    },

    editLink: {
      pattern: 'https://github.com/LouisMazel/relizy/edit/main/docs/src/:path',
      text: 'Edit this page on GitHub',
    },
  },

  vite: {
    build: {
      target: 'esnext',
      minify: 'esbuild',
    },
    css: {
      postcss: {
        plugins: [
          postcssIsolateStyles({
            includeFiles: [/vp-doc\.css/],
          }),
        ],
      },
    },
    ssr: {
      noExternal: ['maz-ui'],
    },
  },
})
