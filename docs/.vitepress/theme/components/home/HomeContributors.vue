<script setup lang="ts">
import { MazGithub } from '@maz-ui/icons/static/MazGithub'
import { MazLogoTwitter } from '@maz-ui/icons/static/MazLogoTwitter'
import MazAvatar from 'maz-ui/components/MazAvatar'
import MazCardSpotlight from 'maz-ui/components/MazCardSpotlight'

/**
 * The contributors of the repository, from ungh.cc
 */

const {
  repo,
  creators,
  maintainers,
  ignored = ['dependabot[bot]'],
  links,
} = defineProps<{
  repo: string
  creators?: string[]
  maintainers?: string[]
  ignored?: string[]
  links?: { username: string, link: string, type: 'github' | 'twitter' }[]
}>()

const ROLES = {
  creator: { label: 'Creator', color: 'primary', text: 'text-primary' },
  maintainer: { label: 'Maintainer', color: 'secondary', text: 'text-secondary' },
  contributor: { label: 'Contributor', color: 'info', text: 'text-info' },
} as const

async function fetchContributors() {
  try {
    const response = await fetch(`https://ungh.cc/repos/${repo}/contributors`)

    if (!response.ok) {
      throw new Error(`Error while fetching contributors: ${response.status}`)
    }

    const { contributors } = await response.json() as { contributors: { id: number, username: string, contributions: number }[] }

    return await Promise.all(contributors
      .filter(contributor => !ignored.includes(contributor.username))
      .map(async (contributor) => {
        const role = creators?.includes(contributor.username) ? ROLES.creator : maintainers?.includes(contributor.username) ? ROLES.maintainer : ROLES.contributor
        const twitterLink = links?.find(link => link.username === contributor.username && link.type === 'twitter')?.link
        const githubLink = links?.find(link => link.username === contributor.username && link.type === 'github')?.link || `https://github.com/${contributor.username}`
        const userResponse = await fetch(`https://ungh.cc/users/find/${contributor.username}`)
        const avatar = userResponse.ok ? (await userResponse.json() as { user: { avatar: string } }).user.avatar : undefined

        return { ...contributor, role, avatar, twitterLink, githubLink }
      }))
  }
  catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return []
  }
}

const contributors = await fetchContributors()
</script>

<template>
  <div class="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4">
    <MazCardSpotlight
      v-for="{ id, username, avatar, contributions, role, twitterLink, githubLink } in contributors"
      :key="id"
      :color="role.color"
      class="size-full"
      content-class="flex flex-col items-center gap-1 py-2"
    >
      <MazAvatar
        v-if="avatar"
        :src="avatar"
        :alt="username"
        :href="githubLink"
        target="_blank"
        size="2.5rem"
        bordered
      />

      <p class="pt-2 text-base font-semibold tracking-tight wrap-break-word text-foreground">
        {{ username }}
      </p>
      <p class="text-sm font-medium" :class="role.text">
        {{ role.label }}
      </p>
      <p class="text-xs font-medium text-muted">
        {{ contributions }} contributions
      </p>

      <div class="mt-2 flex items-center gap-2 text-muted">
        <a :href="githubLink" target="_blank" :aria-label="`${username} on GitHub`" class="flex size-6 items-center justify-center transition-colors duration-(--duration-fast) hover:text-primary">
          <MazGithub class="size-full" />
        </a>
        <a v-if="twitterLink" :href="twitterLink" target="_blank" :aria-label="`${username} on X`" class="flex size-6 items-center justify-center transition-colors duration-(--duration-fast) hover:text-primary">
          <MazLogoTwitter class="size-full" />
        </a>
      </div>
    </MazCardSpotlight>
  </div>
</template>
