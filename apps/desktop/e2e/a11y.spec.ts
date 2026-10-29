import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { chooseTab, editor, expect, type Profile, test } from './helpers';

// axe on what only the desktop app draws (Phase 1 design §1 item 5; the web app's states are
// apps/web/e2e/a11y.spec.ts): the modules folder in Settings, with a folder module's question about
// the network, a module that couldn't start, and a folder Drafter skipped; a folder module's button
// and tab; and the update prompt. Each in both themes. The native dialogs (Open, Save, close, About)
// are the OS's own.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
const TIDY = fileURLToPath(new URL('../../../modules/from-a-folder/tidy/', import.meta.url));
const FIXTURES = fileURLToPath(new URL('./modules/', import.meta.url));

async function clean(page: Page, state: string) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY)
        .map((a) => a.finished.catch(() => {})),
    ),
  );
  // Legacy mode: axe's usual run opens a page of its own to put the frames' results together, which
  // Electron's driver can't do.
  const { violations } = await new AxeBuilder({ page })
    .withTags(WCAG)
    .setLegacyMode(true)
    .analyze();
  expect(
    violations.map(({ id, nodes }) => `${id}: ${nodes.map((n) => n.target).join(', ')}`),
    state,
  ).toEqual([]);
}

/** Switches the window to `theme` with the toolbar's button, as a writer does (dark is the default). */
async function useTheme(page: Page, theme: 'dark' | 'light') {
  if (theme === 'light') await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`));
}

const modulesDir = (profile: Profile) => join(profile.userData, 'modules');

function addFolders(profile: Profile) {
  mkdirSync(modulesDir(profile), { recursive: true });
  cpSync(TIDY, join(modulesDir(profile), 'tidy'), { recursive: true });
  cpSync(join(FIXTURES, 'broken-code'), join(modulesDir(profile), 'broken-code'), {
    recursive: true,
  });
  // A module that asks for the network, so turning it on asks first.
  const probe = join(modulesDir(profile), 'probe');
  cpSync(join(FIXTURES, 'probe'), probe, { recursive: true });
  writeFileSync(
    join(probe, 'module.json'),
    JSON.stringify({
      id: 'probe',
      name: 'Probe',
      description: 'Tries what a module must not be able to do.',
      permissions: { network: ['https://example.invalid'] },
    }),
  );
  writeFileSync(join(probe, 'config.json'), JSON.stringify({ urls: {} }));
  // A folder that isn't a module, which Settings lists as skipped.
  mkdirSync(join(modulesDir(profile), 'not-a-module'), { recursive: true });
  writeFileSync(join(modulesDir(profile), 'not-a-module', 'notes.txt'), 'nothing here\n');
}

const settings = (page: Page) => page.getByRole('dialog', { name: 'Settings' });

for (const theme of ['dark', 'light'] as const) {
  test(`has no accessibility violations in the modules folder's settings, question, button, and tab (${theme})`, async ({
    desktop,
    profile,
  }) => {
    addFolders(profile);
    const { page } = await desktop();
    await useTheme(page, theme);

    await page.keyboard.press(`${MOD}+,`);
    await expect(settings(page)).toBeVisible();
    await expect(
      settings(page).getByRole('heading', { name: 'From your modules folder' }),
    ).toBeVisible();
    await expect(settings(page).locator('[data-folder-problems]')).toBeVisible();
    await clean(page, 'the modules folder in Settings');

    // The question a module that asks for the network gets before it's turned on.
    await settings(page).getByRole('switch', { name: 'Probe' }).click();
    const ask = page.getByRole('dialog', { name: 'Turn on Probe?' });
    await expect(ask).toBeVisible();
    await clean(page, "a folder module's question");
    await ask.getByRole('button', { name: 'Cancel' }).click();
    await expect(ask).toBeHidden();

    // A module that couldn't start says so.
    await settings(page).getByRole('switch', { name: 'Broken code' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Broken code couldn’t start' }),
    ).toBeVisible();
    await clean(page, 'a folder module that couldn’t start');

    // Tidy on: its button and its tab.
    await settings(page).getByRole('switch', { name: 'Tidy' }).click();
    await expect(settings(page).getByRole('switch', { name: 'Tidy' })).toBeChecked();
    await settings(page).getByRole('button', { name: 'Done' }).click();
    await expect(settings(page)).toBeHidden();
    await editor(page).click();
    await page.keyboard.press(`${MOD}+A`);
    await page.keyboard.insertText('INT. HALL - DAY  \n\nRain.  \n');
    await page.getByRole('button', { name: 'Tidy' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: '2 lines end in spaces.' }),
    ).toBeVisible();
    await chooseTab(page, 'Tidy');
    await expect(page.getByRole('tabpanel', { name: 'Tidy' })).toBeVisible();
    await clean(page, "a folder module's button and tab");
  });

  test(`has no accessibility violations with the update prompt showing (${theme})`, async ({
    desktop,
    profile,
  }) => {
    // A version and bytes of its own: on Windows electron-updater keeps its download outside the
    // test's profile (%LOCALAPPDATA%\drafter-updater), where updates.spec.ts's 9.9.9 must not find
    // one already there.
    const bytes = Buffer.from('an update for the accessibility test, only bytes\n'.repeat(40));
    const sha = createHash('sha512').update(bytes).digest('base64');
    const yml = `version: 9.9.7
files:
  - url: Drafter-9.9.7.AppImage
    sha512: ${sha}
    size: ${bytes.length}
  - url: Drafter-9.9.7-windows-x64-setup.exe
    sha512: ${sha}
    size: ${bytes.length}
  - url: Drafter-9.9.7-windows-arm64-setup.exe
    sha512: ${sha}
    size: ${bytes.length}
path: Drafter-9.9.7.AppImage
sha512: ${sha}
releaseDate: '2026-10-27T00:00:00.000Z'
`;
    const server: Server = createServer((request, response) => {
      const path = (request.url ?? '').split('?')[0] ?? '';
      if (/\/latest.*\.yml$/.test(path)) {
        response.writeHead(200, { 'content-type': 'text/yaml' }).end(yml);
      } else if (/\.(AppImage|exe)$/.test(path)) {
        response.writeHead(200, { 'content-type': 'application/octet-stream' }).end(bytes);
      } else {
        response.writeHead(404).end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const { page } = await desktop({
        env: {
          DRAFTER_UPDATE_FEED: `http://127.0.0.1:${port}`,
          DRAFTER_E2E_UPDATE_DELAY_MS: '100',
          DRAFTER_E2E_UPDATE_INSTALL: join(profile.dir, 'install.log'),
          APPIMAGE: join(profile.dir, 'Drafter.AppImage'),
        },
      });
      await useTheme(page, theme);
      const prompt = page.locator('[data-update]');
      await expect(prompt).toContainText('A new version of Drafter is ready', { timeout: 30_000 });
      await clean(page, 'the update prompt');
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
}
