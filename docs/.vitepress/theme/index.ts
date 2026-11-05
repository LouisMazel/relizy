import type { MazUiOptions } from 'maz-ui/plugins'
import type { Theme } from 'vitepress'
import { MazUi } from 'maz-ui/plugins'
import DefaultTheme from 'vitepress/theme'
// https://vitepress.dev/guide/custom-theme
import { h } from 'vue'
import Layout from './components/Layout.vue'
import { relizyPreset } from './preset'
import 'maz-ui/style.css'
import './style.css'
import './tailwind.css'

export default {
  extends: DefaultTheme,
  Layout: () => h(Layout),
  enhanceApp({ app }) {
    app.use(MazUi, {
      theme: {
        preset: relizyPreset,
        // The `.dark` class of VitePress drives the color mode
        darkModeStrategy: 'class',
        strategy: 'runtime',
        persistPreset: false,
      },
      // The props shared by the components of the custom pages, set once
      defaults: {
        global: { roundedSize: 'lg' },
        MazBtn: { roundedSize: 'full' },
        MazBadge: { roundedSize: 'full', size: 'sm' },
        MazTabsBar: { roundedSize: 'full', size: 'sm' },
      },
    } satisfies MazUiOptions)
  },
} satisfies Theme
