import type { MazUiOptions } from 'maz-ui/plugins'
import type { Theme } from 'vitepress'
import VueTermynalPlugin from '@lehoczky/vue-termynal'
import { MazUi } from 'maz-ui/plugins'
import DefaultTheme from 'vitepress/theme'
// https://vitepress.dev/guide/custom-theme
import { h } from 'vue'
import Layout from './components/Layout.vue'
import 'maz-ui/styles'
import './style.css'

export default {
  extends: DefaultTheme,
  Layout: () => h(Layout),
  enhanceApp({ app }) {
    app.use(VueTermynalPlugin)

    app.use(MazUi, {
      theme: {
        darkModeStrategy: 'class',
        strategy: 'hybrid',
        overrides: {
          foundation: {
            'border-width': '1px',
          },
          colors: {
            light: {
              primary: '272 99% 54%',
              secondary: '210 100% 56%',
            },
            dark: {
              primary: '272 99% 54%',
              secondary: '210 100% 56%',
            },
          },
        },
      },
    } satisfies MazUiOptions)
  },
} satisfies Theme
