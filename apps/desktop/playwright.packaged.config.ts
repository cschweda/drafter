import { defineConfig } from '@playwright/test';

// The packaged app's tests (e2e/packaged.spec.ts): they launch an installed binary, an AppImage, or
// the unpacked build named by DRAFTER_PACKAGED, so there is no global setup (nothing to build here).
// `pnpm e2e:packaged`; CI runs it for the AppImage and for the installed .deb (.github/workflows/desktop.yml).
export default defineConfig({
  testDir: 'e2e',
  testMatch: /packaged\.spec\.ts/,
  // One app at a time: the sandbox test reads the process tree, and each test launches its own.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
});
