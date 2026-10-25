import { fileURLToPath } from 'node:url';
import { OG_IMAGE, SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from './site';

export default defineNuxtConfig({
  compatibilityDate: '2026-10-25',
  // The sample scripts live at the repository root, in samples/.
  alias: { '#samples': fileURLToPath(new URL('../../samples', import.meta.url)) },
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  // Fonts are self-hosted (main.css), and icons are bundled into the build:
  // nothing is fetched from another site at runtime.
  ui: { fonts: false },
  colorMode: { preference: 'dark', fallback: 'dark' },
  icon: { provider: 'none', clientBundle: { scan: true } },
  // The editor runs in the browser; `/` is prerendered as a shell that
  // carries the metadata and the loading template's description.
  routeRules: { '/': { ssr: false } },
  devtools: { enabled: false },
  telemetry: false,
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: SITE_TITLE,
      meta: [
        { name: 'description', content: SITE_DESCRIPTION },
        { name: 'theme-color', content: '#0F1013' },
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: 'Drafter' },
        { property: 'og:title', content: SITE_TITLE },
        { property: 'og:description', content: SITE_DESCRIPTION },
        { property: 'og:url', content: `${SITE_URL}/` },
        { property: 'og:image', content: OG_IMAGE },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:image:alt', content: SITE_TITLE },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: SITE_TITLE },
        { name: 'twitter:description', content: SITE_DESCRIPTION },
        { name: 'twitter:image', content: OG_IMAGE },
      ],
      link: [
        { rel: 'canonical', href: `${SITE_URL}/` },
        { rel: 'icon', href: '/favicon.ico', sizes: '32x32' },
        { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
    },
  },
});
