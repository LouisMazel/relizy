<script lang="ts" setup>
/**
 * The window of the terminals and editors of the homepage: always dark, in
 * both color modes
 */

defineProps<{
  /** In the title bar: `~/acme`, `relizy.config.ts` */
  title: string
}>()
</script>

<template>
  <div class="overflow-hidden rounded-2xl border border-terminal-line bg-terminal shadow-2xl">
    <div class="relative flex h-10 items-center gap-2 border-b border-terminal-line bg-terminal-bar px-4">
      <span class="size-3 rounded-full bg-terminal-red/90" />
      <span class="size-3 rounded-full bg-terminal-yellow/90" />
      <span class="size-3 rounded-full bg-terminal-green/90" />
      <!-- Clear of the three dots, cut when too long -->
      <span class="absolute inset-x-20 truncate text-center font-mono text-xs text-terminal-dim">{{ title }}</span>
    </div>
    <slot />
  </div>
</template>
