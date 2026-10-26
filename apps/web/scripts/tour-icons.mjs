// The Heroicons the guided tour draws (`nuxt-guided-tour`'s components and `app/tour/tour.config.ts`).
// The icon scan reads the app's files, not the module's, so the names are listed here: the Nuxt
// config bundles them (a build has no network to fetch an icon from, and the CSP forbids it), and
// `check-build.mjs` checks that the build has them.
export const TOUR_ICONS = [
  'heroicons:arrow-left',
  'heroicons:arrow-right',
  'heroicons:check',
  'heroicons:pencil-square',
  'heroicons:play',
];
