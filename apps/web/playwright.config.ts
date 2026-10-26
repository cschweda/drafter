import { defineConfig, devices } from '@playwright/test';

// The tests run against the generated site (`pnpm e2e` builds it first),
// served with its `_headers`, so they see what drafter.dev serves.
// E2E_PORT lets two worktrees run their suites at once without sharing a server.
const port = Number(process.env.E2E_PORT ?? 4173);

export default defineConfig({
  testDir: 'e2e',
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
