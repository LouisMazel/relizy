<script lang="ts" setup>
import MazTabsBar from 'maz-ui/components/MazTabsBar'
import { computed, ref } from 'vue'

/**
 * The version modes of a monorepo, on the same commits: which packages are
 * released, with which version
 */

type Mode = 'unified' | 'selective' | 'independent'

const modes = [
  { label: 'Unified', value: 'unified' },
  { label: 'Selective', value: 'selective' },
  { label: 'Independent', value: 'independent' },
] as const

const mode = ref<Mode>('selective')

const DESCRIPTIONS: Record<Mode, string> = {
  unified: 'Every package gets the version of the repository, changed or not.',
  selective: 'One version for the repository, only the packages with commits are released.',
  independent: 'Each package has its own version, bumped from its own commits.',
}

interface Package {
  name: string
  commit?: string
  from: Record<Mode, string>
  to: Record<Mode, string | undefined>
}

const packages: Package[] = [
  { name: '@acme/core', commit: 'feat', from: { unified: '2.3.1', selective: '2.3.1', independent: '1.8.0' }, to: { unified: '2.4.0', selective: '2.4.0', independent: '1.9.0' } },
  { name: '@acme/ui', commit: 'fix', from: { unified: '2.3.1', selective: '2.3.1', independent: '3.2.4' }, to: { unified: '2.4.0', selective: '2.4.0', independent: '3.2.5' } },
  { name: '@acme/cli', from: { unified: '2.3.1', selective: '2.3.1', independent: '0.6.1' }, to: { unified: '2.4.0', selective: undefined, independent: undefined } },
  { name: '@acme/icons', from: { unified: '2.3.1', selective: '2.2.0', independent: '1.1.0' }, to: { unified: '2.4.0', selective: undefined, independent: undefined } },
]

const rows = computed(() => packages.map(pkg => ({
  name: pkg.name,
  commit: pkg.commit,
  from: pkg.from[mode.value],
  to: pkg.to[mode.value],
})))
</script>

<template>
  <div class="flex h-full flex-col gap-5">
    <MazTabsBar v-model="mode" :items="modes" standalone />

    <p class="min-h-10 text-sm text-muted">
      {{ DESCRIPTIONS[mode] }}
    </p>

    <ul class="grid gap-2">
      <li
        v-for="row in rows"
        :key="row.name"
        class="flex items-center gap-3 rounded-lg border px-3 py-2.5 font-mono text-xs transition-colors duration-(--duration-normal)"
        :class="row.to ? 'border-primary/40 bg-primary/5' : 'border-divider'"
      >
        <span class="font-semibold text-foreground">{{ row.name }}</span>
        <span v-if="row.commit" class="rounded-full bg-divider px-2 py-0.5 text-[0.6875rem] text-muted">{{ row.commit }}</span>
        <span class="ml-auto text-muted">{{ row.from }}</span>
        <template v-if="row.to">
          <span class="text-muted">→</span>
          <span class="font-semibold text-primary">{{ row.to }}</span>
        </template>
        <span v-else class="text-muted/60">unchanged</span>
      </li>
    </ul>
  </div>
</template>
