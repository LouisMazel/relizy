import type { HeadConfig, UserConfig } from 'vitepress'
import { unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, postcssIsolateStyles } from 'vitepress'
import packageJson from '../../package.json'
import typedocSidebar from '../src/typedoc/typedoc-sidebar.json'

const SITE_URL = 'https://relizy.pages.dev'
const isProduction = process.env.CF_PAGES_BRANCH === 'main' || !process.env.CF_PAGES

// https://vitepress.dev/reference/site-config
export default defineConfig({
  srcDir: 'src',
  lang: 'en-US',

  title: 'Seamless and automated release manager',
  titleTemplate: ':title | Relizy',
  description: 'Seamless and automated release manager with elegant changelog generation based on Conventional Commits, supporting both monorepos and single packages. Handles version bumping, changelog generation, Git tagging, and publishing to npm, GitHub & GitLab effortlessly.',

  head: [
    ['meta', { name: 'author', content: 'Louis Mazel' }],
    ['meta', { name: 'robots', content: isProduction ? 'index, follow' : 'noindex, nofollow' }],
    ['meta', { name: 'theme-color', content: '#8b5cf6' }],
    ['meta', { property: 'og:image', content: `${SITE_URL}/social.jpg` }],
    ['meta', { property: 'og:image:width', content: '1200' }],
    ['meta', { property: 'og:image:height', content: '630' }],
    ['meta', { property: 'og:locale', content: 'en_US' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:image', content: `${SITE_URL}/social.jpg` }],
    ['meta', { name: 'twitter:site', content: '@mazeel' }],
    ['meta', { name: 'twitter:creator', content: '@mazeel' }],
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${SITE_URL}/logo.svg` }],
    ['script', { type: 'application/ld+json' }, JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      'name': 'Relizy',
      'url': SITE_URL,
      'description': 'Seamless and automated release manager for monorepos and single packages',
      'author': {
        '@type': 'Person',
        'name': 'Louis Mazel',
        'url': 'https://github.com/LouisMazel',
      },
    })],
    ['script', { type: 'application/ld+json' }, JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      'name': 'Relizy',
      'applicationCategory': 'DeveloperApplication',
      'operatingSystem': 'Cross-platform',
      'url': SITE_URL,
      'downloadUrl': 'https://www.npmjs.com/package/relizy',
      'offers': {
        '@type': 'Offer',
        'price': '0',
        'priceCurrency': 'USD',
      },
      'author': {
        '@type': 'Person',
        'name': 'Louis Mazel',
      },
    })],
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
    hostname: 'https://relizy.pages.dev',
    transformItems: (items) => {
      // add new items or modify/filter existing items
      const modifyItems: typeof items = []

      for (const item of items) {
        if (item.url.includes('404') || item.url.startsWith('typedoc')) {
          continue
        }

        const url = item.url === 'index' ? '' : item.url

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

  transformHead: ({ siteData, pageData, title, description, head }) => {
    const currentTitle = title ?? pageData.title ?? pageData.frontmatter.title ?? siteData.title
    const currentDescription = description ?? pageData.frontmatter.description ?? pageData.description ?? siteData.description

    const slug = pageData.relativePath.replace('.md', '')
    const currentUrl = `${SITE_URL}/${slug === 'index' ? '' : slug}`
    const isArticle = pageData.relativePath !== 'index.md'
    const lastUpdatedISO = pageData.lastUpdated ? new Date(pageData.lastUpdated).toISOString() : new Date().toISOString()

    const pageHead: HeadConfig[] = [
      ['meta', { property: 'og:site_name', content: 'Relizy' }],
      ['meta', { property: 'og:title', content: currentTitle }],
      ['link', { rel: 'canonical', href: currentUrl }],
      ['meta', { property: 'og:url', content: currentUrl }],
      ['meta', { property: 'og:type', content: isArticle ? 'article' : 'website' }],
      ['meta', { name: 'description', content: currentDescription }],
      ['meta', { property: 'og:description', content: currentDescription }],
      ['meta', { property: 'og:image', content: `${SITE_URL}/social.jpg` }],
      ['meta', { property: 'og:image:alt', content: currentDescription }],
      ['meta', { name: 'twitter:title', content: currentTitle }],
      ['meta', { name: 'twitter:description', content: currentDescription }],
      ['meta', { name: 'twitter:image', content: `${SITE_URL}/social.jpg` }],
      ['meta', { name: 'twitter:image:alt', content: currentDescription }],
    ]

    if (isArticle) {
      pageHead.push(
        ['meta', { property: 'article:modified_time', content: lastUpdatedISO }],
        ['meta', { property: 'article:published_time', content: lastUpdatedISO }],
        ['meta', { property: 'article:author', content: 'Louis Mazel' }],
      )
    }

    // Add keywords from frontmatter
    if (pageData.frontmatter.keywords) {
      const keywords = typeof pageData.frontmatter.keywords === 'string'
        ? pageData.frontmatter.keywords
        : Array.isArray(pageData.frontmatter.keywords)
          ? pageData.frontmatter.keywords.join(', ')
          : ''
      if (keywords) {
        pageHead.push(['meta', { name: 'keywords', content: keywords }])
      }
    }

    // Add article category
    if (pageData.frontmatter.category) {
      pageHead.push(['meta', { property: 'article:section', content: pageData.frontmatter.category }])
    }

    // Add article tags
    if (pageData.frontmatter.tags && Array.isArray(pageData.frontmatter.tags)) {
      for (const tag of pageData.frontmatter.tags) {
        pageHead.push(['meta', { property: 'article:tag', content: tag }])
      }
    }

    // Add JSON-LD BreadcrumbList for article pages
    if (isArticle) {
      const parts = slug.split('/')
      const breadcrumbs = [
        { name: 'Home', url: SITE_URL },
        ...parts.map((part, i) => ({
          name: part.charAt(0).toUpperCase() + part.slice(1).replace(/-/g, ' '),
          url: `${SITE_URL}/${parts.slice(0, i + 1).join('/')}`,
        })),
      ]

      pageHead.push(['script', { type: 'application/ld+json' }, JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        'itemListElement': breadcrumbs.map((crumb, i) => ({
          '@type': 'ListItem',
          'position': i + 1,
          'name': crumb.name,
          'item': crumb.url,
        })),
      })])
    }

    return [...head, ...pageHead]
  },

  themeConfig: {
    siteTitle: 'Relizy',
    logo: { src: 'https://raw.githubusercontent.com/LouisMazel/relizy/refs/heads/main/resources/logo.svg', alt: 'Relizy logo' },

    search: {
      provider: 'local' as const,
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
          { text: 'Canary Releases', link: '/guide/canary-releases' },
          { text: 'Prerelease Versioning', link: '/guide/prerelease-versioning' },
          { text: 'Semver Convention', link: '/guide/semver-convention' },
          { text: 'AI-Enhanced Changelogs', link: '/guide/ai-changelog' },
          { text: 'Social Media Integration', link: '/guide/social-media' },
          { text: 'Twitter Integration', link: '/guide/twitter-integration' },
          { text: 'Slack Integration', link: '/guide/slack-integration' },
          { text: 'PR Comments', link: '/guide/pr-comment' },
          { text: 'CI/CD Setup', link: '/guide/ci-cd' },
          { text: 'GitHub Actions', link: '/guide/github-actions' },
          { text: 'GitLab CI', link: '/guide/gitlab-ci' },
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
          { text: 'AI Config', link: '/config/ai' },
          { text: 'Social Config', link: '/config/social' },
          { text: 'PR Comment Config', link: '/config/pr-comment' },
          { text: 'Commit Templates', link: '/config/commit-templates' },
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
          { text: 'pr-comment', link: '/cli/pr-comment' },
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
          { text: 'prComment()', link: '/api/pr-comment' },
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
            { text: 'Canary Releases', link: '/guide/canary-releases' },
            { text: 'Prerelease Versioning', link: '/guide/prerelease-versioning' },
            { text: 'Semver Convention', link: '/guide/semver-convention' },
          ],
        },
        {
          text: 'AI',
          items: [
            { text: 'AI-Enhanced Changelogs', link: '/guide/ai-changelog' },
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
          text: 'PR Comments',
          items: [
            { text: 'PR Comments', link: '/guide/pr-comment' },
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
            { text: 'pr-comment', link: '/cli/pr-comment' },
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
            { text: 'prComment()', link: '/api/pr-comment' },
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
            { text: 'AI Config', link: '/config/ai' },
            { text: 'Social Config', link: '/config/social' },
            { text: 'PR Comment Config', link: '/config/pr-comment' },
            { text: 'Commit Templates', link: '/config/commit-templates' },
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

  buildEnd: ({ outDir }) => {
    if (!isProduction) {
      // Overwrite robots.txt to block all crawlers on preview deployments
      writeFileSync(resolve(outDir, 'robots.txt'), 'User-agent: *\nDisallow: /\n')

      // Remove sitemap to avoid indexing preview URLs
      try {
        unlinkSync(resolve(outDir, 'sitemap.xml'))
      }
      catch {}
    }
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
          }) as any,
        ],
      },
    },
    ssr: {
      noExternal: ['maz-ui'],
    },
  },
} satisfies UserConfig<NoInfer<any>>)
