import { fileURLToPath } from 'node:url';
import { HELP_PAGES } from './app/commands/data';
import { findDuplicateIds, moduleFolders, moduleIconNames } from './scripts/modules.mjs';
import { TOUR_ICONS } from './scripts/tour-icons.mjs';
import { OG_IMAGE, SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from './site';

/** The workspace packages, at the repository root. */
const PACKAGES = fileURLToPath(new URL('../../packages', import.meta.url));
/** The script modules, at the repository root: a folder each, with an `index.ts` (modules/README.md). */
const MODULES = fileURLToPath(new URL('../../modules', import.meta.url));
// The icons the modules name: the icon bundle is built from the app's own files, and the modules
// are outside them. (A build has no network to fetch an icon from, and the CSP forbids it.)
const TEST_MODULES = process.env.DRAFTER_TEST_MODULES === '1';
// `DRAFTER_DESKTOP=1` builds the web app for the desktop app (apps/desktop), which serves these
// same files from inside itself: no service worker or web app manifest (its files are local, and
// updates come from its own updater), and `__DRAFTER_DESKTOP__` true, so `app/desktop.ts` honours
// the desktop app's bridge. drafter.dev's build is unchanged.
const DESKTOP = process.env.DRAFTER_DESKTOP === '1';
const moduleIcons = await moduleIconNames(MODULES);

export default defineNuxtConfig({
  compatibilityDate: '2026-10-25',
  // The sample scripts live at the repository root, in samples/.
  alias: { '#samples': fileURLToPath(new URL('../../samples', import.meta.url)) },
  modules: ['@nuxt/ui', 'nuxt-guided-tour', ...(DESKTOP ? [] : ['@vite-pwa/nuxt'])],
  // The guided tour (app/tour/tour.config.ts). The highlight is the brand's goldenrod. The module's inline
  // `<style>` for it is fixed text at build time, which `style-src 'unsafe-inline'` allows (Plan 1).
  guidedTour: { highlightColor: '#E5B04A', highlightColorBright: '#F2CB7A' },
  // Offline use and updates (Phase 1 design §11; docs/DECISIONS.md, `apps/web`). The worker
  // precaches the app's own files and nothing else: no runtime caching, so nothing is fetched or
  // stored on the writer's behalf after the first visit. A new version waits ('prompt') until the
  // writer chooses Reload (components/UpdatePrompt.vue); the module's own client plugin is off,
  // and plugins/service-worker.client.ts registers the worker instead.
  pwa: {
    registerType: 'prompt',
    client: { registerPlugin: false, installPrompt: false, periodicSyncForUpdates: 0 },
    devOptions: { enabled: false },
    manifest: {
      name: 'Drafter',
      short_name: 'Drafter',
      description: SITE_DESCRIPTION,
      lang: 'en',
      id: '/',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#0F1013',
      theme_color: '#0F1013',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      // Every file the app needs, by extension: the shell (HTML), scripts and styles (the lazy and
      // worker chunks are in `_nuxt/` with the rest), Inter Tight and Courier Prime, the icons,
      // and the spelling dictionaries (`dictionaries/<language>/index.{aff,dic}`, about 1.1 MB,
      // each well under Workbox's 2 MiB limit) (the manifest is added by the plugin itself, once).
      // The licence files (`.txt`) are not the app, and are left out. A page added under /docs/
      // is matched by `**/*.html`.
      globPatterns: ['**/*.{js,css,html,woff2,ttf,png,svg,ico,aff,dic}'],
      // Not part of the app: the social-sharing image, and the hosting fallbacks (200.html is the
      // shell again; 404.html is for a link that matches nothing).
      globIgnores: ['og-image.png', '200.html', '404.html'],
      // A navigation the worker has no page for gets the app's shell, so a reload works offline at
      // any address the app is used at. Not for a path that names a file (`/og-image.png`,
      // `/fonts/courier-prime/OFL.txt`, `/404.html`): those are files, not the app. The
      // documentation pages are their own pages (`/docs/...`, precached by `**/*.html`), not the app.
      navigateFallback: '/',
      navigateFallbackDenylist: [/\/[^/?]+\.[^/]+$/, /^\/docs(\/|$)/],
      // A prerendered page fetches its payload with a build id in the query (`_payload.json?_b=...`):
      // the cached file answers it, so the page doesn't fail to hydrate offline (Workbox's
      // defaults, `utm_*` and `fbclid`, are kept).
      ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^_b$/],
      runtimeCaching: [],
      cleanupOutdatedCaches: true,
      // The first visit's page is controlled by the worker once it is active, so its lazy chunks
      // (the Markdown mode) come from the cache. A later update waits for the writer ('prompt').
      clientsClaim: true,
      skipWaiting: false,
    },
  },
  // The module's components use `ref`, `computed`, and the like without importing them, as Nuxt's
  // auto-imports allow in an app's own files; Nuxt leaves `node_modules` out of that unless told.
  imports: { transform: { include: [/nuxt-guided-tour/] } },
  css: ['~/assets/css/main.css'],
  // Fonts are self-hosted (main.css), and icons are bundled into the build:
  // nothing is fetched from another site at runtime.
  ui: { fonts: false },
  colorMode: { preference: 'dark', fallback: 'dark' },
  // The scan reads `.vue`, `.md`, and the like by default, and not `.ts`: an icon named only in a
  // `.ts` file (the document types' `newIcon`s in `editor/template.ts`) was left out of the bundle,
  // and drew nothing. `scripts/check-build.mjs` checks the bundle after a build.
  icon: {
    provider: 'none',
    clientBundle: {
      scan: { globInclude: ['**/*.{vue,jsx,tsx,md,mdc,mdx,yml,yaml,ts}'] },
      // The modules' icons, and the tour's Heroicons (scripts/tour-icons.mjs).
      icons: [...moduleIcons, ...TOUR_ICONS],
    },
  },
  // The Drafter packages resolve to their TypeScript, so the build compiles it and never reads a
  // stale `dist/`. This is an alias for those packages alone: a global `source` export condition
  // would reach every dependency, and some (`@internationalized/date`, from Nuxt UI) list it first.
  // A subpath such as `@drafter/render-html/style.css` isn't matched, and resolves as usual.
  vite: {
    // `DRAFTER_TEST_MODULES=1` (set by `pnpm e2e`) puts the test module in the build. Without it the
    // constant is false, the module is dead code, and no production bundle has it.
    // `__DRAFTER_DESKTOP__` the same way, from `DRAFTER_DESKTOP=1`.
    define: {
      __DRAFTER_TEST_MODULES__: JSON.stringify(TEST_MODULES),
      __DRAFTER_DESKTOP__: JSON.stringify(DESKTOP),
    },
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
          find: /^@drafter\/(cm-fountain|compare|fdx|fountain|layout|lint|notes|outline|render-html|render-pdf|render-text|spell|templates)$/,
          replacement: `${PACKAGES}/$1/src/index.ts`,
        },
      ],
    },
  },
  // The editor runs in the browser; `/` is prerendered as a shell that
  // carries the metadata and the loading template's description. The help pages (`/docs/...`,
  // Phase 1 design §4.5) are prerendered with their content, so they read without JavaScript.
  routeRules: { '/': { ssr: false }, '/docs/**': { prerender: true, ssr: true } },
  // Always plain static files in .output/public. On Netlify, Nitro would
  // otherwise pick its netlify-static preset and write dist/ instead, which
  // netlify.toml's publish directory and scripts/csp.mjs don't read.
  nitro: {
    preset: 'static',
    prerender: { routes: ['/docs', ...HELP_PAGES.map((page) => page.path)] },
  },
  hooks: {
    // The desktop build has no PWA module, so the plugin that registers its worker (and imports
    // the module's `virtual:pwa-register`) is left out.
    'app:resolve'(app) {
      if (DESKTOP) {
        app.plugins = app.plugins.filter(
          (plugin) => !plugin.src.endsWith('/plugins/service-worker.client.ts'),
        );
      }
    },
    // The module turns each prerendered `docs/x/index.html` into the precache entry `docs/x`, which
    // answers `/docs/x` and not `/docs/x/`; the worker's page fallback leaves `/docs` alone, so the
    // address with the slash would be a network error offline. Each page is listed under both
    // (same revision). scripts/check-build.mjs checks that they are.
    'pwa:beforeBuildServiceWorker'(options) {
      const workbox = options.workbox as {
        manifestTransforms?: Array<
          (entries: Array<{ url: string; revision?: string | null; size?: number }>) => unknown
        >;
      };
      workbox.manifestTransforms = [
        ...(workbox.manifestTransforms ?? []),
        async (entries) => ({
          manifest: [
            ...entries,
            ...entries
              .filter((entry) => /^docs(\/[^/.]+)?$/.test(entry.url))
              .map((entry) => ({ ...entry, url: `${entry.url}/` })),
          ],
          warnings: [],
        }),
      ];
    },
  },
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
        ...(DESKTOP ? [] : [{ rel: 'manifest' as const, href: '/manifest.webmanifest' }]),
      ],
    },
  },
});
