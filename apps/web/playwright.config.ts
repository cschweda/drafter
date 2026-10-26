import { defineConfig, devices } from '@playwright/test';

// The tests run against the generated site (`pnpm e2e` builds it first),
// served with its `_headers`, so they see what drafter.dev serves.
// E2E_PORT lets two worktrees run their suites at once without sharing a server.
const port = Number(process.env.E2E_PORT ?? 4173);

// Accessibility checks wait for the project's final stage (decided 2026-10-26): tests named for
// accessibility violations run only with A11Y=1 (`pnpm e2e:a11y`).
const a11y = !!process.env.A11Y;

export default defineConfig({
  testDir: 'e2e',
  ...(a11y ? {} : { grepInvert: /accessibility violations/ }),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
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
    storageState: {
      cookies: [],
      origins: [
        {
          origin: `http://localhost:${port}`,
          localStorage: [{ name: 'drafter-tour-v1', value: 'true' }],
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
