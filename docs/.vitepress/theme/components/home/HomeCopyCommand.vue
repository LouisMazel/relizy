<script lang="ts" setup>
import { MazCheck } from '@maz-ui/icons/raw/MazCheck'
import { MazClipboardDocument } from '@maz-ui/icons/raw/MazClipboardDocument'
import MazBtn from 'maz-ui/components/MazBtn'
import { ref } from 'vue'

/**
 * A command to copy: `npx relizy init`
 */

const props = defineProps<{
  command: string
}>()

const copied = ref(false)

async function copy() {
  await navigator.clipboard.writeText(props.command)
  copied.value = true
  setTimeout(() => {
    copied.value = false
  }, 1800)
}
</script>

<template>
  <div class="inline-flex items-center gap-3 rounded-full border border-divider bg-container py-1.5 pr-1.5 pl-5 font-mono text-sm shadow-elevation">
    <span class="text-muted select-none">$</span>
    <span class="text-foreground">{{ command }}</span>
    <MazBtn
      size="sm"
      color="transparent"

      fab
      :icon="copied ? MazCheck : MazClipboardDocument"
      :aria-label="copied ? 'Copied' : `Copy ${command}`"
      @click="copy"
    />
  </div>
</template>
