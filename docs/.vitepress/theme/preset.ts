import { definePreset } from '@maz-ui/themes'
import { nova } from '@maz-ui/themes/presets/nova'

/**
 * The theme of the docs: the Nova preset of maz-ui with the colors of Relizy
 * (violet to blue) and the surfaces, texts and fonts of VitePress, so that the
 * maz-ui components and the Tailwind utilities blend in the pages of the docs.
 */
export const relizyPreset = definePreset({
  base: nova,
  overrides: {
    name: 'relizy',
    foundation: {
      'font-family': 'var(--vp-font-family-base)',
      'font-display-stack': 'var(--vp-font-family-base)',
      'font-mono-stack': 'var(--vp-font-family-mono)',
    },
    scales: {
      rounded: {
        'sm': '0.375rem',
        'md': '0.625rem',
        'lg': '0.875rem',
        'xl': '1rem',
        '2xl': '1.25rem',
        '3xl': '1.75rem',
      },
      shadow: {
        elevation: '0 1px 2px oklch(0.3 0.05 290 / 0.06), 0 16px 40px -16px oklch(0.35 0.12 290 / 0.28)',
      },
    },
    components: {
      btn: { 'font-weight': '600' },
      // Cards: the page in light mode, a tier above it in dark mode (VitePress bg-soft)
      container: { bg: { light: 'oklch(1 0 0)', dark: 'oklch(0.249 0.011 278)' } },
    },
    colors: {
      light: {
        'primary': 'oklch(0.555 0.288 299.4)',
        'primary-foreground': 'oklch(1 0 0)',
        'secondary': 'oklch(0.65 0.191 253.6)',
        'secondary-foreground': 'oklch(1 0 0)',
        'surface': 'oklch(1 0 0)',
        'foreground': 'oklch(0.359 0.012 285.8)',
        'muted': 'oklch(0.515 0.008 286.1)',
        'divider': 'oklch(0.913 0.001 286.4)',
        'contrast': 'oklch(0.24 0.012 285.8)',
      },
      dark: {
        'primary': 'oklch(0.66 0.24 299.4)',
        'primary-foreground': 'oklch(1 0 0)',
        'secondary': 'oklch(0.72 0.17 253.6)',
        'secondary-foreground': 'oklch(0.2 0.01 285.8)',
        'surface': 'oklch(0.224 0.008 285.8)',
        'foreground': 'oklch(0.901 0.012 106.6)',
        'muted': 'oklch(0.682 0.01 286.1)',
        'divider': 'oklch(0.303 0.007 286)',
        'contrast': 'oklch(0.96 0.005 285.8)',
      },
    },
  },
})
