import { fileURLToPath } from 'node:url';
import { findDuplicateIds, moduleFolders, moduleIconNames } from './scripts/modules.mjs';
import { OG_IMAGE, SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from './site';

/** The workspace packages, at the repository root. */
const PACKAGES = fileURLToPath(new URL('../../packages', import.meta.url));
/** The script modules, at the repository root: a folder each, with an `index.ts` (modules/README.md). */
const MODULES = fileURLToPath(new URL('../../modules', import.meta.url));
// The icons the modules name: the icon bundle is built from the app's own files, and the modules
// are outside them. (A build has no network to fetch an icon from, and the CSP forbids it.)
const TEST_MODULES = process.env.DRAFTER_TEST_MODULES === '1';
const moduleIcons = [
  ...(await moduleIconNames(MODULES)),
  // The test module's, which is in the app's own `.ts` files.
  ...(TEST_MODULES ? ['lucide:list-checks'] : []),
];

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
  icon: { provider: 'none', clientBundle: { scan: true, icons: moduleIcons } },
  // The Drafter packages resolve to their TypeScript, so the build compiles it and never reads a
  // stale `dist/`. This is an alias for those packages alone: a global `source` export condition
  // would reach every dependency, and some (`@internationalized/date`, from Nuxt UI) list it first.
  // A subpath such as `@drafter/render-html/style.css` isn't matched, and resolves as usual.
  vite: {
    // `DRAFTER_TEST_MODULES=1` (set by `pnpm e2e`) puts the test module in the build. Without it the
    // constant is false, the module is dead code, and no production bundle has it.
    define: { __DRAFTER_TEST_MODULES__: JSON.stringify(TEST_MODULES) },
    plugins: [
      {
        // Two modules with one id are a build error, naming both folders. (A module that builds
        // its id some other way is caught when the app starts instead.)
        name: 'drafter-modules',
        async buildStart() {
          await findDuplicateIds(await moduleFolders(MODULES), MODULES);
        },
      },
    ],
    resolve: {
      alias: [
        {
          find: /^@drafter\/(cm-fountain|fountain|layout|lint|render-html|render-pdf|render-text|templates)$/,
          replacement: `${PACKAGES}/$1/src/index.ts`,
        },
      ],
    },
  },
  // The editor runs in the browser; `/` is prerendered as a shell that
  // carries the metadata and the loading template's description.
  routeRules: { '/': { ssr: false } },
  // Always plain static files in .output/public. On Netlify, Nitro would
  // otherwise pick its netlify-static preset and write dist/ instead, which
  // netlify.toml's publish directory and scripts/csp.mjs don't read.
  nitro: { preset: 'static' },
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
