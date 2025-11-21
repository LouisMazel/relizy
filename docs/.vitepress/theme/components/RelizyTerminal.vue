<script lang="ts" setup>
import { VTermynal } from '@lehoczky/vue-termynal'

const terminalOptions = {
  startDelay: 400,
  typeDelay: 50,
  lineDelay: 500,
}

const terminal = [
  {
    type: 'input',
    content: 'relizy release',
  },
  {
    type: 'text',
    prefix: {
      content: '◐',
      class: 'step',
    },
    content: `Start bumping versions`,
  },
  {
    type: 'text',
    prefix: {
      content: 'ℹ',
      class: 'info',
    },
    content: `The following packages will be updated:
Root package.json: 4.3.1-alpha.2 → 4.3.1
7 package(s) with commits:
  • maz-ui: 4.3.1-alpha.0 → 4.3.1
  • @maz-ui/mcp: 4.3.1-alpha.0 → 4.3.1
  • @maz-ui/themes: 4.3.1-alpha.0 → 4.3.1
  • @maz-ui/nuxt: 4.3.1-alpha.0 → 4.3.1`,
  },
  {
    type: 'text',
    prefix: {
      content: '?',
      class: 'confirm',
    },
    content: `Do you want to proceed with these version updates? (Y/n)`,
  },
  {
    type: 'input',
    content: 'Y',
  },
  {
    type: 'text',
    prefix: {
      content: 'ℹ',
      class: 'info',
    },
    content: `Updated root: 4.3.1-alpha.2 → 4.3.1`,
  },
  {
    type: 'text',
    prefix: {
      content: 'ℹ',
      class: 'info',
    },
    content: `Updated @maz-ui/mcp: 4.3.1-alpha.2 → 4.3.1`,
  },
  {
    type: 'text',
    prefix: {
      content: 'ℹ',
      class: 'info',
    },
    content: `Updated @maz-ui/themes: 4.3.1-alpha.2 → 4.3.1`,
  },
  {
    type: 'text',
    prefix: {
      content: 'ℹ',
      class: 'info',
    },
    content: `Updated @maz-ui/nuxt: 4.3.1-alpha.2 → 4.3.1`,
  },
  {
    type: 'text',
    prefix: {
      content: '✔',
      class: 'success',
    },
    content: `Version bump completed (3 package(s) bumped)`,
  },
  {
    type: 'text',
    prefix: {
      content: '◐',
      class: 'step',
    },
    content: `Start generating changelogs`,
  },
  {
    type: 'text',
    prefix: {
      content: 'ℹ',
      class: 'info',
    },
    content: `Changelog updated for root`,
  },
  {
    type: 'text',
    prefix: {
      content: 'ℹ',
      class: 'info',
    },
    content: `Changelog updated for @maz-ui/mcp`,
  },
  {
    type: 'text',
    prefix: {
      content: 'ℹ',
      class: 'info',
    },
    content: `Changelog updated for @maz-ui/themes`,
  },
  {
    type: 'text',
    prefix: {
      content: 'ℹ',
      class: 'info',
    },
    content: `Changelog updated for @maz-ui/nuxt`,
  },
  {
    type: 'text',
    prefix: {
      content: '✔',
      class: 'success',
    },
    content: `Changelog generation completed!`,
  },
  {
    type: 'text',
    prefix: {
      content: '◐',
      class: 'step',
    },
    content: `Start commit and tag`,
  },
  {
    type: 'text',
    prefix: {
      content: '✔',
      class: 'success',
    },
    content: `Commit and tag completed!`,
  },
  {
    type: 'text',
    prefix: {
      content: '◐',
      class: 'step',
    },
    content: `Start push changes and tags`,
  },
  {
    type: 'text',
    prefix: {
      content: '✔',
      class: 'success',
    },
    content: `Pushing changes and tags completed!`,
  },
  {
    type: 'text',
    prefix: {
      content: '◐',
      class: 'step',
    },
    content: `Start publishing packages`,
  },
  {
    type: 'text',
    prefix: {
      content: '✔',
      class: 'success',
    },
    content: `Publishing packages completed!`,
  },
  {
    type: 'text',
    prefix: {
      content: '◐',
      class: 'step',
    },
    content: `Start provider release`,
  },
  {
    type: 'text',
    prefix: {
      content: 'ℹ',
      class: 'info',
    },
    content: `Using Git provider: github`,
  },
  {
    type: 'text',
    prefix: {
      content: '✔',
      class: 'success',
    },
    content: `Provider release completed!`,
  },
  {
    type: 'text',
    prefix: {
      content: '✔',
      class: 'success',
    },
    content: `Release v4.3.1 published to GitHub!`,
  },
]
</script>

<template>
  <VTermynal restart-button class="relizy-terminal" v-bind="terminalOptions">
    <template v-for="(item, i) in terminal">
      <VtInput v-if="item.type === 'input'" :key="`input-${i}`">
        {{ item.content }}
      </VtInput>
      <VtText v-else-if="item.type === 'text'" :key="`text-${i}`">
        <span v-if="item.prefix?.content" :class="item.prefix.class">{{ item.prefix.content }}</span> {{ item.content }}
      </VtText>
    </template>
  </VTermynal>
</template>

<style lang="css" scoped>
.relizy-terminal {
  --vt-color-info: #1acaff;
  --vt-color-step: #ff15f3;
  --vt-color-confirm: #d9515d;
  --vt-color-success: #40ff00;

  font-size: 0.75rem;
  padding: 3.125rem 1.875rem 1.25rem;
  border-radius: 0.625rem;
}

.relizy-terminal::before {
  top: 12px;
  left: 12px;
  width: 12px;
  height: 12px;
}

.relizy-terminal .info {
  color: var(--vt-color-info);
  font-weight: bold;
}

.relizy-terminal .step {
  color: var(--vt-color-step);
  font-weight: bold;
}

.relizy-terminal .confirm {
  color: var(--vt-color-confirm);
  font-weight: bold;
}

.relizy-terminal .success {
  color: var(--vt-color-success);
  font-weight: bold;
}
</style>
