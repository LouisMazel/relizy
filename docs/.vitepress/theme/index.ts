import type { Theme } from 'vitepress'
import VueTermynalPlugin from '@lehoczky/vue-termynal'
import DefaultTheme from 'vitepress/theme'
// https://vitepress.dev/guide/custom-theme
import { h } from 'vue'
import RelizyTerminal from './components/RelizyTerminal.vue'
import './style.css'

export default {
  extends: DefaultTheme,
  Layout: () => {
    return h(DefaultTheme.Layout, null, {
      // https://vitepress.dev/guide/extending-default-theme#layout-slots
    })
  },
  enhanceApp({ app }) {
    app.use(VueTermynalPlugin)
    app.component('RelizyTerminal', RelizyTerminal)
  },
} satisfies Theme
