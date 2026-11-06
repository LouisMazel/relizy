import type { ReleaseLine } from '../release-overview'
import type { TeamsCardSection, TeamsVersion } from '../teams'
import { Buffer } from 'node:buffer'
import { createMockConfig } from '../../../tests/mocks'
import { getAnnouncementVariables } from '../announcements'
import { buildTeamsMessage, checkTeamsWebhookUrl, getTeamsWebhookUrl, postReleaseToTeams, resolveTeamsAnnouncements, toTeamsMarkdown } from '../teams'

vi.mock('node:timers/promises', () => ({ setTimeout: vi.fn().mockResolvedValue(undefined) }))

const WEBHOOK_URL = 'https://example.logic.azure.com/workflows/1/triggers/manual/paths/invoke?sig=secret'

const mainGroup = { name: 'main', title: 'Maz UI', versionMode: 'selective' as const, version: '7.0.0', tag: 'v7.0.0', packages: [] }
const sharedGroup = { name: 'shared', title: 'Shared', versionMode: 'independent' as const, packages: [] }

function version(line: Omit<ReleaseLine, 'tag'> & { tag?: string }): TeamsVersion {
  return { line: { tag: `${line.name}@${line.version}`, ...line }, name: line.name, changelog: '' }
}

const rootVersion = version({ name: 'Maz UI', version: '7.0.0', tag: 'v7.0.0', group: mainGroup })
const navVersion = version({ name: '@scope/nav', version: '1.3.0', group: sharedGroup })
const menuVersion = version({ name: '@scope/menu', version: '2.0.0', group: sharedGroup })

const section: TeamsCardSection = {
  title: 'Maz UI 7.0.0',
  message: 'A new version of **Maz UI** is available.',
  version: '7.0.0',
  changelog: '',
  links: [{ title: '📖 Release notes', url: 'https://github.com/owner/repo/releases/tag/v7.0.0' }],
  prerelease: false,
}

describe('Given the Teams cards', () => {
  describe('When the URL of the workflow is read', () => {
    it('Then takes the config first, then the environment, then its base64', () => {
      expect(getTeamsWebhookUrl({ socialWebhookUrl: WEBHOOK_URL, env: { RELIZY_TEAMS_WEBHOOK_URL: 'https://other' } })).toBe(WEBHOOK_URL)
      expect(getTeamsWebhookUrl({ env: { TEAMS_WEBHOOK_URL: WEBHOOK_URL } })).toBe(WEBHOOK_URL)
      expect(getTeamsWebhookUrl({ env: { TEAMS_WEBHOOK_URL_B64: Buffer.from(`${WEBHOOK_URL}\n`).toString('base64') } })).toBe(WEBHOOK_URL)
      expect(getTeamsWebhookUrl({ env: {} })).toBeUndefined()
    })

    it('Then refuses a retired Office 365 connector and a URL without https', () => {
      expect(checkTeamsWebhookUrl(WEBHOOK_URL)).toBeUndefined()
      expect(checkTeamsWebhookUrl('https://contoso.webhook.office.com/webhookb2/abc')).toMatch(/Office 365 connector/)
      expect(checkTeamsWebhookUrl('http://example.com/hook')).toMatch(/https/)
      expect(checkTeamsWebhookUrl('aHR0cHM6Ly9leGFtcGxl')).toMatch(/not a valid URL/)
    })
  })

  describe('When the announcements are resolved', () => {
    it('Then announces every version without announcements', () => {
      expect(resolveTeamsAnnouncements({ title: '{{name}}' }, [rootVersion, navVersion])).toEqual([
        { version: rootVersion, content: { title: '{{name}}' } },
        { version: navVersion, content: { title: '{{name}}' } },
      ])
    })

    it('Then announces the matching versions only, a package entry over its group entry over the defaults', () => {
      const announced = resolveTeamsAnnouncements({
        message: 'Default message',
        links: [{ title: 'Docs', url: 'https://docs' }],
        announcements: [
          { group: 'shared', title: 'Shared {{name}}', links: [{ title: 'Storybook', url: 'https://{{shortName}}.example.com' }] },
          { package: '@scope/n*', title: 'Navigation' },
        ],
      }, [rootVersion, navVersion, menuVersion])

      expect(announced).toEqual([
        { version: navVersion, content: { message: 'Default message', title: 'Navigation', links: [{ title: 'Storybook', url: 'https://{{shortName}}.example.com' }] } },
        { version: menuVersion, content: { message: 'Default message', title: 'Shared {{name}}', links: [{ title: 'Storybook', url: 'https://{{shortName}}.example.com' }] } },
      ])
    })

    it('Then never announces the excluded groups and packages', () => {
      expect(resolveTeamsAnnouncements({ exclude: { groups: ['main'], packages: ['@scope/menu'] } }, [rootVersion, navVersion, menuVersion]).map(({ version }) => version)).toEqual([navVersion])
    })
  })

  describe('When the variables of a version are built', () => {
    const config = createMockConfig({ bump: { type: 'patch' }, repo: { provider: 'gitlab', domain: 'gitlab.com', repo: 'group/project' } })

    it('Then links the CHANGELOG.md of the version at its tag', () => {
      const variables = getAnnouncementVariables({ config, version: { ...navVersion, changelogDir: 'shared/nav' }, content: {}, projectName: 'maz-ui', releaseUrl: undefined })

      expect(variables).toEqual({
        name: '@scope/nav',
        shortName: 'nav',
        newVersion: '1.3.0',
        tag: '@scope/nav@1.3.0',
        projectName: 'maz-ui',
        groupTitle: 'Shared',
        releaseUrl: '',
        changelogUrl: 'https://gitlab.com/group/project/-/blob/%40scope/nav%401.3.0/shared/nav/CHANGELOG.md',
      })
    })

    it('Then takes the changelog URL of the announcement, then social.changelogUrl, and none with false', () => {
      const withChangelog = { ...rootVersion, changelogDir: '' }
      const getUrl = (content: { changelogUrl?: string | false }, changelogUrl?: string) => getAnnouncementVariables({ config: { ...config, social: { ...config.social, changelogUrl } }, version: withChangelog, content, projectName: 'maz-ui', releaseUrl: undefined }).changelogUrl

      expect(getUrl({ changelogUrl: 'https://docs/{{shortName}}/changelog' })).toBe('https://docs/Maz UI/changelog')
      expect(getUrl({}, 'https://maz-ui.com/changelog')).toBe('https://maz-ui.com/changelog')
      expect(getUrl({})).toBe('https://gitlab.com/group/project/-/blob/v7.0.0/CHANGELOG.md')
      expect(getUrl({ changelogUrl: false })).toBe('')
    })
  })

  describe('When a changelog is converted', () => {
    it('Then turns the headings into bold lines and removes the HTML and the code fences', () => {
      expect(toTeamsMarkdown('### 🚀 Features\n\n- **menu:** Add a <b>menu</b>\n\n\n\n```ts\nconst a = 1\n```')).toBe('**🚀 Features**\n\n- **menu:** Add a menu\n\nconst a = 1')
    })
  })

  describe('When a card is built', () => {
    const date = new Date('2026-11-06T12:00:00Z')

    it('Then announces a version with its badge, its facts and its buttons', () => {
      const message = buildTeamsMessage({ sections: [section], locale: 'fr-FR', date }) as any
      const card = message.attachments[0].content

      expect(message.attachments[0].contentType).toBe('application/vnd.microsoft.card.adaptive')
      expect(card).toMatchObject({ type: 'AdaptiveCard', version: '1.5', msteams: { width: 'Full' } })
      expect(card.body[0]).toMatchObject({ type: 'Badge', text: 'New release', style: 'Good', fallback: { type: 'TextBlock', text: '**New release**' } })
      expect(card.body[1].items).toEqual([
        expect.objectContaining({ type: 'TextBlock', text: 'Maz UI 7.0.0', size: 'ExtraLarge' }),
        expect.objectContaining({ type: 'TextBlock', text: 'A new version of **Maz UI** is available.' }),
        { type: 'FactSet', facts: [{ title: 'Version', value: '7.0.0' }, { title: 'Date', value: '6 novembre 2026' }] },
        { type: 'ActionSet', actions: [{ type: 'Action.OpenUrl', title: '📖 Release notes', url: 'https://github.com/owner/repo/releases/tag/v7.0.0', style: 'positive' }] },
      ])
    })

    it('Then shows a prerelease badge, or no badge with false', () => {
      const prerelease = buildTeamsMessage({ sections: [{ ...section, prerelease: true }], date }) as any
      const noBadge = buildTeamsMessage({ sections: [section], badge: false, date }) as any

      expect(prerelease.attachments[0].content.body[0]).toMatchObject({ type: 'Badge', text: 'Prerelease', style: 'Warning' })
      expect(noBadge.attachments[0].content.body[0].type).toBe('Container')
    })

    it('Then announces the release with a section per version under the title of its group', () => {
      const card = (buildTeamsMessage({
        sections: [{ ...section, groupTitle: 'Maz UI' }, { ...section, title: '@scope/nav 1.3.0', groupTitle: 'Shared' }, { ...section, title: '@scope/menu 2.0.0', groupTitle: 'Shared' }],
        title: 'New releases of maz-ui',
        date,
      }) as any).attachments[0].content

      expect(card.body.map((element: any) => element.text ?? element.items?.[0].text)).toEqual(['New release', 'New releases of maz-ui', 'November 6, 2026', 'Maz UI', 'Maz UI 7.0.0', 'Shared', '@scope/nav 1.3.0', '@scope/menu 2.0.0'])
    })
  })

  describe('When the cards are posted', () => {
    const fetchMock = vi.fn()

    beforeEach(() => {
      fetchMock.mockReset()
      vi.stubGlobal('fetch', fetchMock)
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('Then posts each card to the workflow', async () => {
      fetchMock.mockResolvedValue(new Response('', { status: 202 }))

      await expect(postReleaseToTeams({ cards: [{ sections: [section] }, { sections: [section] }], webhookUrl: WEBHOOK_URL })).resolves.toEqual({ posted: 2 })

      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(fetchMock).toHaveBeenCalledWith(WEBHOOK_URL, expect.objectContaining({ method: 'POST', headers: { 'Content-Type': 'application/json' } }))
      expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toMatchObject({ type: 'message', attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive' }] })
    })

    it('Then tries again when the workflow is throttled', async () => {
      fetchMock
        .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '1' } }))
        .mockResolvedValueOnce(new Response('', { status: 202 }))

      await postReleaseToTeams({ cards: [{ sections: [section] }], webhookUrl: WEBHOOK_URL })

      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('Then throws with the fix when the workflow refuses the card', async () => {
      fetchMock.mockResolvedValue(new Response('flow not found', { status: 404, statusText: 'Not Found' }))

      await expect(postReleaseToTeams({ cards: [{ sections: [section] }], webhookUrl: WEBHOOK_URL })).rejects.toThrow(/404 Not Found - flow not found[\s\S]*add co-owners/)
    })

    it('Then throws before posting a card over 28 KB', async () => {
      await expect(postReleaseToTeams({ cards: [{ sections: [{ ...section, changelog: 'x'.repeat(30_000) }] }], webhookUrl: WEBHOOK_URL })).rejects.toThrow(/over the 28 KB/)

      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('Then only shows the cards in dry-run', async () => {
      await postReleaseToTeams({ cards: [{ sections: [section] }], webhookUrl: WEBHOOK_URL, dryRun: true })

      expect(fetchMock).not.toHaveBeenCalled()
    })
  })
})
