import { defineConfig } from '@playwright/test';

// The desktop app's end-to-end tests: Playwright's Electron driver launches the built main process
// (`dist/main.cjs`, which `pnpm e2e` builds first) with a fresh profile per test (e2e/helpers.ts).
// The global setup builds the web app for the desktop once and copies it to `web/`.
// Locally they run on the developer's OS; in CI on Linux under xvfb (Plan 6 Task 7).
export default defineConfig({
  testDir: 'e2e',
  // The packaged app's tests have their own config (playwright.packaged.config.ts).
  testIgnore: /packaged\.spec\.ts/,
  globalSetup: './e2e/global-setup.ts',
  // Each test starts its own Electron, a few hundred megabytes: a couple at once is plenty.
  workers: process.env.CI ? 1 : 2,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? 'github' : 'list',
  use: { trace: 'retain-on-failure' },
});
