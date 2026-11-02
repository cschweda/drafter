import { defineConfig, devices } from '@playwright/test';
import { WHATS_NEW_SEEN } from './app/whats-new/banner';
import { WHATS_NEW } from './app/whats-new/entries';
import { drafterDatabase, sampleSeenRows } from './e2e/seed';

// The tests run against the generated site (`pnpm e2e` builds it first),
// served with its `_headers`, so they see what drafter.dev serves.
// E2E_PORT lets two worktrees run their suites at once without sharing a server.
const port = Number(process.env.E2E_PORT ?? 4173);

export default defineConfig({
  // The accessibility tests run with the rest (decided 2026-10-28, docs/DECISIONS.md);
  // `pnpm e2e:a11y` runs them alone.
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // On CI: annotations in the run, and an HTML report the workflow keeps when something fails.
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    // The build has a service worker (Phase 1 design §11). Most tests are about something else and
    // would only share a page with a worker that is installing, precaching 3.5 MB, and answering
    // from its cache, so contexts block it; e2e/offline.spec.ts allows it for its own tests, and
    // `E2E_SERVICE_WORKERS=allow` allows it everywhere (security.spec.ts is run that way too).
    serviceWorkers: process.env.E2E_SERVICE_WORKERS === 'allow' ? 'allow' : 'block',
    // Every test begins as a first visit, which the guided tour would greet with a dialog over the
    // page. The tour's "seen" key (nuxt-guided-tour: `drafter-tour-v1`, see app/tour/tour.config.ts)
    // is set in advance; e2e/tour.spec.ts starts with an empty storage instead.
    //
    // The "recovery copy may be cleared" toast shows until it is dismissed once, and no test
    // browser keeps storage for good, so it would sit over every test's page: its key
    // (`drafter-storage-toast-v1`, app/storage/storage-notice.ts) is set too; e2e/recovery.spec.ts
    // takes it away for its own tests.
    //
    // In the same way, the writer's first New stage play or Markdown document opens with that
    // kind's sample (decided 2026-10-27), which most tests don't expect, so the database starts
    // holding the settings rows that say the samples were met (`sampleSeenRows`);
    // e2e/first-samples.spec.ts starts without them.
    //
    // What's new's banner (app/whats-new/banner.ts) shows on a returning visit until it is dismissed,
    // and a test that stores a script before the page opens is a returning visit: every entry is
    // stored as seen, as the tour is; e2e/whats-new.spec.ts starts without it.
    //
    // A fresh visit follows the system's appearance (fresh-look design §9), and every test is a
    // first visit, so the theme is stored as Drafter's default, dark, as a returning writer's
    // would be; e2e/settings.spec.ts's "a fresh visit" tests start without it. The system is dark
    // too, so a test that starts with empty storage still opens dark, except in Firefox, which
    // ignores this setting (and `emulateMedia` before the first load): a test there that needs dark
    // stores the theme instead (tour.spec.ts).
    colorScheme: 'dark',
    storageState: {
      cookies: [],
      origins: [
        {
          origin: `http://localhost:${port}`,
          localStorage: [
            { name: 'drafter-tour-v1', value: 'true' },
            { name: 'drafter-storage-toast-v1', value: 'true' },
            { name: 'nuxt-color-mode', value: 'dark' },
            {
              name: WHATS_NEW_SEEN,
              value: JSON.stringify(WHATS_NEW.filter((e) => e.banner).map((e) => e.id)),
            },
          ],
          indexedDB: [drafterDatabase(sampleSeenRows)],
        },
      ],
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    // iPhones run WebKit whatever the browser, so phone sizes get it too.
    { name: 'phone-webkit', use: { ...devices['iPhone SE'] } },
  ],
  webServer: {
    command: `node scripts/serve.mjs .output/public ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
  },
});
