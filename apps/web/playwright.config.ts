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
  use: { baseURL: `http://localhost:${port}`, trace: 'retain-on-failure' },
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
