<script lang="ts" setup>
import type { Component } from 'vue'
import MazCardSpotlight from 'maz-ui/components/MazCardSpotlight'

/**
 * A feature of the homepage: what it does, a visual, and the page of the docs
 */

defineProps<{
  icon: Component
  title: string
  /** The page of the docs */
  href: string
  /** The link to the page: `Version modes` */
  link: string
  /** The visual next to the text, on two columns */
  wide?: boolean
}>()
</script>

<template>
  <MazCardSpotlight color="primary" class="size-full" :content-class="wide ? 'grid h-full items-center gap-8 tab-m:grid-cols-2' : 'flex h-full flex-col'">
    <div class="flex h-full flex-col">
      <span class="feature-icon"><component :is="icon" class="size-5" /></span>
      <h3 class="text-lg font-semibold tracking-tight text-foreground">
        {{ title }}
      </h3>
      <div class="mt-1.5 text-sm leading-relaxed text-muted">
        <slot />
      </div>
      <div v-if="$slots.visual && !wide" class="mt-5">
        <slot name="visual" />
      </div>
      <a :href="href" class="group mt-auto inline-flex items-center gap-1 pt-6 text-sm font-semibold text-primary">
        {{ link }}
        <span aria-hidden="true" class="transition-transform duration-(--duration-fast) group-hover:translate-x-1">→</span>
      </a>
    </div>
    <div v-if="$slots.visual && wide">
      <slot name="visual" />
    </div>
  </MazCardSpotlight>
</template>
