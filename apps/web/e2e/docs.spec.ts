import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { DICTIONARIES } from '../../../packages/spell/src/dictionaries';
import { DEPENDENCY_NOTES, TECH_SECTIONS } from '../app/about/tech';
import { COMMAND_DATA, DOWNLOAD_PAGE, HELP_PAGES, helpHref } from '../app/commands/data';
import { showView } from './modules';

// The help pages (Phase 1 design §4.5): Saving and your browser, Keyboard shortcuts, and Privacy.
// They are prerendered, so they read without JavaScript, and they share the app's theme.
// (Their accessibility checks are in a11y.spec.ts.)

/** The version the site is built from: the desktop app's, which the release files are named for. */
const VERSION = (
  JSON.parse(readFileSync(new URL('../../desktop/package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;

const editor = (page: Page) => page.locator('.cm-content');
// The help pages are in the Help menu, in the top bar (fresh-look Task 3b).
const helpButton = (page: Page) => page.getByRole('banner').getByRole('button', { name: 'Help' });
const menu = (page: Page) => page.getByRole('menu', { name: 'Help' });
const palette = (page: Page) => page.getByRole('dialog', { name: 'Command palette' });
const heading = (page: Page) => page.getByRole('heading', { level: 1 });

/** The text of the page's main part, with each run of white space as one space. */
async function mainText(page: Page): Promise<string> {
  return ((await page.locator('main').textContent()) ?? '').replace(/\s+/g, ' ');
}

async function start(page: Page) {
  await page.goto('/');
  await expect(editor(page)).toContainText('The Call');
}

/** The Source tab, which a phone doesn't show to begin with. */
async function showSource(page: Page) {
  if (!(await editor(page).isVisible())) await showView(page, 'Source');
  await expect(editor(page)).toBeVisible();
}

async function openMenu(page: Page) {
  await helpButton(page).click();
  await expect(menu(page)).toBeVisible();
}

/** The body's background, as the browser computes it. */
const background = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.describe('without JavaScript', () => {
  // No JavaScript, and so no stored state to set up first (the tour's "seen" flag is a script's to set).
  test.use({ javaScriptEnabled: false, storageState: { cookies: [], origins: [] } });

  test('prerenders each help page with its title and description', async ({ page }) => {
    const descriptions = new Set<string>();
    for (const { path, title } of HELP_PAGES) {
      await page.goto(path);
      await expect(page, path).toHaveTitle(`${title} — Drafter`);
      await expect(heading(page), path).toHaveText(title);
      const description = await page.locator('meta[name="description"]').getAttribute('content');
      expect(description, path).toBeTruthy();
      expect((description ?? '').length, path).toBeGreaterThan(40);
      expect((description ?? '').length, path).toBeLessThan(200);
      descriptions.add(description ?? '');
      // The link previews say the same, and the canonical address is this page's own.
      await expect(page.locator('meta[property="og:title"]'), path).toHaveAttribute(
        'content',
        `${title} — Drafter`,
      );
      await expect(page.locator('meta[property="og:description"]'), path).toHaveAttribute(
        'content',
        description ?? '',
      );
      await expect(page.locator('link[rel="canonical"]'), path).toHaveCount(1);
      await expect(page.locator('link[rel="canonical"]'), path).toHaveAttribute(
        'href',
        `https://drafter.dev${path}/`,
      );
      // Each is a page of its own, with a way back to the app.
      await expect(page.getByRole('link', { name: /Back to Drafter/ }), path).toHaveAttribute(
        'href',
        '/',
      );
    }
    expect(descriptions.size).toBe(HELP_PAGES.length);
  });

  test('ends every help page with who made Drafter, linked in a new tab', async ({ page }) => {
    for (const path of ['/docs', ...HELP_PAGES.map((p) => p.path)]) {
      await page.goto(path);
      const foot = page.getByRole('contentinfo');
      await expect(foot, path).toHaveText(
        'Made by Christopher Schweda (cschweda) · metaincognita.com',
      );
      for (const [name, href] of [
        ['cschweda', 'https://github.com/cschweda'],
        ['metaincognita.com', 'https://metaincognita.com'],
      ]) {
        const link = foot.getByRole('link', { name, exact: true });
        await expect(link, path).toHaveAttribute('href', href as string);
        await expect(link, path).toHaveAttribute('target', '_blank');
        await expect(link, path).toHaveAttribute('rel', 'noopener noreferrer');
      }
    }
  });

  test('prerenders a help index that links every help page', async ({ page }) => {
    for (const address of ['/docs', '/docs/']) {
      await page.goto(address);
      await expect(page, address).toHaveTitle('Help — Drafter');
      await expect(heading(page), address).toHaveText('Help');
      for (const help of HELP_PAGES) {
        await expect(
          page.locator('main').getByRole('link', { name: help.title }),
          address,
        ).toHaveAttribute('href', helpHref(help));
      }
    }
  });

  test('serves each page with and without a trailing slash', async ({ page }) => {
    for (const { path, title } of HELP_PAGES) {
      for (const address of [path, `${path}/`]) {
        await page.goto(address);
        await expect(heading(page), address).toHaveText(title);
      }
    }
  });

  test('lists every registered command on the shortcuts page', async ({ page }) => {
    await page.goto('/docs/shortcuts');
    const text = await mainText(page);
    for (const { title } of COMMAND_DATA) expect(text, title).toContain(title);
    // A script module’s commands are added at run time and are not on the page.
    expect(text).not.toContain('Fixture: add a note');
    // Grouped as the palette groups them.
    for (const group of ['File', 'Edit', 'View', 'Go', 'Help']) {
      await expect(page.getByRole('heading', { level: 2, name: group, exact: true })).toBeVisible();
    }
  });

  test('shows each shortcut in both notations, whatever the reader’s keyboard', async ({
    page,
  }) => {
    await page.goto('/docs/shortcuts');
    const row = (name: string | RegExp) => page.getByRole('row').filter({ hasText: name });
    const save = row('Save As…');
    await expect(save).toContainText('⌘⇧S');
    await expect(save).toContainText('Ctrl+Shift+S');
    const fold = row(/^Fold all/);
    await expect(fold).toContainText('⌃⌥[');
    await expect(fold).toContainText('Ctrl+Alt+[');
    const focus = row('Toggle focus mode');
    await expect(focus).toContainText('⌘⇧Enter');
    await expect(focus).toContainText('Ctrl+Shift+Enter');
  });

  test('the licences page lists every dependency and links its licence file', async ({ page }) => {
    // The versions installed: nspell's from @drafter/spell, is-buffer's from nspell.
    const spell = createRequire(new URL('../../../packages/spell/package.json', import.meta.url));
    const nspellDir = spell.resolve('nspell').replace(/[/\\]lib[/\\]index\.js$/, '');
    const version = (dir: string) =>
      (JSON.parse(readFileSync(`${dir}/package.json`, 'utf8')) as { version: string }).version;
    const isBufferDir = createRequire(`${nspellDir}/package.json`)
      .resolve('is-buffer')
      .replace(/[/\\]index\.js$/, '');
    // A package packages/mcp depends on, in the folder pnpm links it into there.
    const mcpDir = (name: string) =>
      fileURLToPath(new URL(`../../../packages/mcp/node_modules/${name}`, import.meta.url));
    const packages = [
      { name: 'nspell', version: version(nspellDir), licence: 'MIT', file: '/licenses/nspell.txt' },
      {
        name: 'is-buffer',
        version: version(isBufferDir),
        licence: 'MIT',
        file: '/licenses/is-buffer.txt',
      },
      ...Object.values(DICTIONARIES).map((d) => ({
        name: d.package,
        version: d.version,
        licence: d.licence,
        file: d.licenceFile,
      })),
      // Inside Drafter for Claude only, resolved from packages/mcp.
      ...(
        [
          ['@modelcontextprotocol/server', 'Apache', '/licenses/modelcontextprotocol-server.txt'],
          ['zod', 'MIT', '/licenses/zod.txt'],
        ] as const
      ).map(([name, licence, file]) => ({
        name,
        version: version(mcpDir(name)),
        licence,
        file,
      })),
    ];
    await page.goto('/docs/licences');
    await expect(heading(page)).toHaveText('Third-party licences');
    for (const { name, version, licence, file } of packages) {
      const entry = page.locator('main section').filter({
        has: page.getByRole('heading', { level: 3, name, exact: true }),
      });
      await expect(entry, name).toContainText(version);
      await expect(entry, name).toContainText(licence);
      const link = entry.getByRole('link', { name: /licence/i });
      await expect(link, name).toHaveAttribute('href', file);
      // The file is served, as the package ships it.
      const response = await page.request.get(file);
      expect(response.status(), file).toBe(200);
      expect((await response.text()).length, file).toBeGreaterThan(500);
    }
    // The copyright lines the dictionaries' notices carry, UKACD's shown as it asks.
    const text = await mainText(page);
    for (const line of [
      'Copyright 2000-2018 by Kevin Atkinson',
      'Copyright 1993, Geoff Kuenning, Granada Hills, CA',
      'Copyright (c) J Ross Beresford 1993-1999. All Rights Reserved.',
      'Copyright (c) 2016 Titus Wormer',
      'Copyright (c) Feross Aboukhadijeh',
      'Courier Prime',
      'Inter Tight',
      'Anton',
      'Archivo',
      'Copyright 2020 The Anton Project Authors',
      'Copyright 2020 The Archivo Project Authors',
      'SIL Open Font License',
    ]) {
      expect(text, line).toContain(line);
    }
    await expect(page.getByRole('link', { name: /Courier Prime.*licence/i })).toHaveAttribute(
      'href',
      '/fonts/courier-prime/OFL.txt',
    );
    // Inter Tight's own licence, linked and served verbatim (the OFL's second condition).
    await expect(page.getByRole('link', { name: /Inter Tight.*licence/i })).toHaveAttribute(
      'href',
      '/fonts/inter-tight/OFL.txt',
    );
    // The story map's Anton and Archivo, whose licences travel with every story map's fonts.
    for (const [name, file, from] of [
      ['Anton', '/fonts/anton/OFL.txt', 'OFL-Anton.txt'],
      ['Archivo', '/fonts/archivo/OFL.txt', 'OFL-Archivo.txt'],
    ] as const) {
      await expect(
        page.getByRole('link', { name: new RegExp(`^${name}.*licence`, 'i') }),
      ).toHaveAttribute('href', file);
      const served = await page.request.get(file);
      expect(served.ok(), file).toBe(true);
      expect(await served.text(), file).toBe(
        readFileSync(new URL(`../../../packages/story-map/fonts/${from}`, import.meta.url), 'utf8'),
      );
    }
    const ofl = await page.request.get('/fonts/inter-tight/OFL.txt');
    expect(ofl.ok()).toBe(true);
    expect(await ofl.text()).toBe(
      readFileSync(new URL('../app/assets/fonts/inter-tight/OFL.txt', import.meta.url), 'utf8'),
    );
  });

  test('points a newcomer to the guided screenplay from the cheat sheet and the help index', async ({
    page,
  }) => {
    await page.goto('/docs/fountain');
    expect(await mainText(page)).toContain(
      'New to Fountain? File → New guided screenplay and New guided stage play walk you through a first script.',
    );
    await page.goto('/docs');
    expect(await mainText(page)).toContain('a guided first screenplay and stage play');
  });

  test('the help index says what Stats and Scaffold count, and who is in a scene', async ({
    page,
  }) => {
    await page.goto('/docs');
    await expect(
      page.getByRole('heading', { level: 2, name: 'Stats and Scaffold', exact: true }),
    ).toBeVisible();
    const text = await mainText(page);
    expect(text).toContain('a mention counts as being there');
    expect(text).toContain('counts as speaking in the scene');
    expect(text).toContain('only in capitals (TOM)');
    expect(text).toContain('counts only as the whole name');
    expect(text).toContain('neither changes your script');
  });

  test('the Technical details page has its parts, its diagrams as lists, and every dependency', async ({
    page,
  }) => {
    await page.goto('/docs/technical');
    await expect(heading(page)).toHaveText('Technical details');
    // A contents list of the ten parts, each a link to its heading.
    const contents = page.getByRole('navigation', { name: 'Contents' });
    for (const { id, title } of TECH_SECTIONS) {
      await expect(contents.getByRole('link', { name: title, exact: true }), id).toHaveAttribute(
        'href',
        `#${id}`,
      );
      await expect(
        page.getByRole('heading', { level: 2, name: title, exact: true }),
        id,
      ).toHaveAttribute('id', id);
    }
    // Five diagrams, each a figure with a caption and its boxes as a list a screen reader reads.
    const figures = page.locator('main figure');
    await expect(figures).toHaveCount(5);
    for (const figure of await figures.all()) {
      await expect(figure.locator('figcaption')).not.toBeEmpty();
      expect(await figure.locator('ol > li').count()).toBeGreaterThanOrEqual(2);
      // The arrows are drawn, not read.
      for (const arrow of await figure.locator('.tech-arrow').all()) {
        await expect(arrow).toHaveAttribute('aria-hidden', 'true');
      }
    }
    // The package diagram says what each box uses directly, in words a reader can see.
    const packages = page.locator('figure[data-diagram="packages"]');
    await expect(packages).toContainText('@drafter/fountain');
    await expect(packages).toContainText('uses @drafter/fountain');
    await expect(
      packages.getByText('uses @drafter/fountain', { exact: true }).first(),
    ).toBeVisible();
    // Storage isn't a chain: the editor's text goes three ways, side by side after one arrow.
    const storage = page.locator('main figure').nth(2);
    await expect(storage.locator('ol > li')).toHaveCount(2);
    await expect(storage.locator('ul > li')).toHaveCount(3);
    // Every third-party runtime dependency, by name, with its line.
    const list = page.locator('main dl');
    for (const [name, line] of Object.entries(DEPENDENCY_NOTES)) {
      await expect(list.locator('dt').getByText(name, { exact: true }), name).toHaveCount(1);
      expect(await mainText(page), name).toContain(line);
    }
    await expect(page.getByRole('link', { name: /DEPENDENCIES\.md/ })).toHaveAttribute(
      'href',
      'https://github.com/cschweda/drafter/blob/main/docs/DEPENDENCIES.md',
    );
    await expect(
      page.locator('main').getByRole('link', { name: 'Third-party licences', exact: true }),
    ).toHaveAttribute('href', '/docs/licences/');
    await expect(page.getByRole('link', { name: /clean-room statement/i })).toHaveAttribute(
      'href',
      /^https:\/\/github\.com\/cschweda\/drafter\/blob\/main\//,
    );
    expect(await mainText(page)).not.toMatch(/ICJIA/i);
  });

  test('the Technical details page has no script or style from another origin', async ({
    page,
  }) => {
    await page.goto('/docs/technical');
    await expect(heading(page)).toHaveText('Technical details');
    const sources = await page.evaluate(() => [
      ...[...document.querySelectorAll('script[src]')].map((el) => (el as HTMLScriptElement).src),
      ...[...document.querySelectorAll('link[rel="stylesheet"], link[rel="modulepreload"]')].map(
        (el) => (el as HTMLLinkElement).href,
      ),
    ]);
    const origin = new URL(page.url()).origin;
    for (const source of sources) expect(new URL(source).origin, source).toBe(origin);
  });

  test('says on the Privacy page that nothing leaves the device', async ({ page }) => {
    await page.goto('/docs/privacy');
    const text = (await mainText(page)).toLowerCase();
    for (const phrase of [
      'no account',
      'no cookies',
      'no telemetry',
      'plausible',
      'google analytics',
      'never leaves',
      'service worker',
      'recovery copy',
      '/sw.js',
      'indexeddb',
      'localstorage',
      'writing stats',
      'drafter-cache',
    ]) {
      expect(text, phrase).toContain(phrase);
    }
  });

  test('the Why Drafter page has its parts and the comparison as a real table', async ({
    page,
  }) => {
    await page.goto('/docs/why');
    await expect(heading(page)).toHaveText('Why Drafter');
    await expect(page.locator('.docs-lead')).toContainText('Drafter™');
    for (const [id, name] of [
      ['free', 'Free, with no catch'],
      ['no-login', 'No login, ever'],
      ['big-features', 'The big features'],
      ['compares', 'How Drafter compares'],
      ['made-by', 'Made by'],
    ]) {
      await expect(
        page.getByRole('heading', { level: 2, name, exact: true }),
        name,
      ).toHaveAttribute('id', id);
    }
    // The table scrolls inside its own region, has a caption, and labels its columns and rows.
    const region = page.getByRole('region', { name: /How Drafter compares/ });
    const table = region.getByRole('table');
    await expect(table.locator('caption')).not.toBeEmpty();
    await expect(table.locator('thead th[scope="col"]')).toHaveCount(8);
    await expect(table.locator('tbody th[scope="row"]')).toHaveCount(25);
    const row = (name: string) => table.getByRole('row').filter({ hasText: name });
    await expect(row('Price')).toContainText('Free, forever');
    await expect(row('Price')).toContainText('$249.99 once, or $99.99/yr');
    // A planned feature shows its version, never a ✓.
    await expect(row('Revision colors and marks').locator('td').first()).toHaveText(
      'v0.27.0, free',
    );
    // ✓ and ✗ are read as words.
    const open = row('Open source');
    await expect(open.locator('td').first()).toContainText('yes');
    await expect(open.locator('td').nth(1)).toContainText('no');
    await expect(open.locator('[aria-hidden="true"]').first()).toHaveText('✓');
    // The credit and the trademark line, with outside links that open safely.
    for (const href of ['https://metaincognita.com', 'https://github.com/cschweda']) {
      const link = page.locator(`main a[href="${href}"]`);
      await expect(link, href).toHaveAttribute('rel', /noopener/);
    }
    expect(await mainText(page)).toContain(
      'Drafter™ and the Drafter logo are trademarks of Christopher Schweda.',
    );
  });

  test('the Download page has the three platforms and links the current release’s files', async ({
    page,
  }) => {
    await page.goto('/docs/download');
    await expect(page).toHaveTitle('Download Drafter — Drafter');
    await expect(heading(page)).toHaveText('Download Drafter');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://drafter.dev/docs/download/',
    );
    for (const [id, name] of [
      ['windows', 'Windows'],
      ['linux', 'Linux'],
      ['mac', 'Mac'],
    ]) {
      await expect(page.getByRole('region', { name, exact: true }), name).toHaveAttribute(
        'data-platform',
        id,
      );
    }
    const base = `https://github.com/cschweda/drafter/releases/download/v${VERSION}`;
    await expect(
      page.getByRole('link', { name: 'Download the Windows installer' }),
    ).toHaveAttribute('href', `${base}/Drafter-${VERSION}-windows-x64-setup.exe`);
    await expect(page.getByRole('link', { name: 'Download the .deb' })).toHaveAttribute(
      'href',
      `${base}/Drafter-${VERSION}-linux-amd64.deb`,
    );
    await expect(page.getByRole('link', { name: 'Download the AppImage' })).toHaveAttribute(
      'href',
      `${base}/Drafter-x86_64.AppImage`,
    );
    // The latest release too, for the minutes before a new release's files are up.
    expect(
      await page
        .locator('main a[href="https://github.com/cschweda/drafter/releases/latest"]')
        .count(),
    ).toBeGreaterThanOrEqual(2);
    const text = await mainText(page);
    for (const phrase of [
      `Drafter ${VERSION}`,
      'SmartScreen',
      'Run anyway',
      'Windows 11 on Arm',
      'Coming: a signed Mac download.',
      'pnpm desktop:mac',
      'Check for updates',
    ]) {
      expect(text, phrase).toContain(phrase);
    }
    // The Mac has no download yet, only the steps to build it.
    await expect(
      page
        .getByRole('region', { name: 'Mac', exact: true })
        .locator('a[href*="/releases/download/"]'),
    ).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'All releases on GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/cschweda/drafter/releases',
    );
    await expect(page.getByRole('link', { name: 'The changelog' })).toHaveAttribute(
      'href',
      'https://github.com/cschweda/drafter/blob/main/CHANGELOG.md',
    );
    // The help index lists it.
    await page.goto('/docs/');
    await expect(
      page.locator('main').getByRole('link', { name: DOWNLOAD_PAGE.title }),
    ).toHaveAttribute('href', '/docs/download/');
  });

  test('explains saving: the browser table, synced folders, the recovery copy, and installing', async ({
    page,
  }) => {
    await page.goto('/docs/saving');
    const table = page.getByRole('table', { name: /Browsers/ });
    await expect(table).toBeVisible();
    for (const browser of ['Chrome', 'Edge', 'Firefox', 'Safari', 'Brave']) {
      await expect(table, browser).toContainText(browser);
    }
    const text = await mainText(page);
    for (const phrase of [
      'Dropbox',
      'Google Drive',
      'iCloud Drive',
      'recovery copy',
      'Allow on every visit',
      'Add to Dock',
      'Add to Home Screen',
      'iPhone or iPad',
      'Android',
      'Install page as app',
      'Install this site as an app',
      'install',
    ]) {
      expect(text, phrase).toContain(phrase);
    }
  });

  test('Saving has Files from other apps, and #final-draft still lands', async ({ page }) => {
    await page.goto('/docs/saving#final-draft');
    await expect(
      page.getByRole('heading', { level: 2, name: 'Files from other apps' }),
    ).toHaveAttribute('id', 'other-apps');
    // The old address of the Final Draft section lands on its part of the new one.
    await expect(page.locator('#final-draft')).toHaveText('Final Draft');
    await expect(page.locator('#final-draft')).toBeInViewport();
    for (const name of [
      'Final Draft',
      'Highland and Fade In',
      'Markdown',
      'Files Drafter can’t open',
      'Export as Markdown',
    ]) {
      await expect(page.getByRole('heading', { level: 3, name, exact: true }), name).toBeVisible();
    }
    const text = await mainText(page);
    for (const phrase of [
      '.highland',
      '.fadein',
      '[[highland:',
      '[[osf: Cast List]]',
      '.markdown',
      'Open as screenplay…',
      'New screenplay from this outline',
      'Word document',
      'RTF',
      'PDF',
      'Markdown (.md)',
      'Include notes (Markdown, HTML, and EPUB)',
      'HTML (.html)',
      'EPUB (.epub)',
      'e-book',
      'a new export replaces the old one on most e-readers',
      'AI chat',
    ]) {
      expect(text, phrase).toContain(phrase);
    }
  });

  test('the description stays under 200 characters', async ({ page }) => {
    await page.goto('/docs/saving');
    const description =
      (await page.locator('meta[name="description"]').getAttribute('content')) ?? '';
    expect(description.length).toBeLessThan(200);
    for (const name of ['Final Draft', 'Highland', 'Fade In', 'Markdown']) {
      expect(description, name).toContain(name);
    }
  });

  test('links the Linux and Windows downloads from the Saving page, and the Mac build guide', async ({
    page,
  }) => {
    await page.goto('/docs/saving');
    await expect(
      page.getByRole('heading', { level: 2, name: 'Download the desktop app' }),
    ).toBeVisible();
    for (const name of ['Linux', 'Windows', 'Mac']) {
      await expect(page.getByRole('heading', { level: 3, name })).toBeVisible();
    }
    // The old address of the Linux section still lands on it.
    await expect(page.locator('#download-linux')).toHaveText('Linux');
    const releases = page.getByRole('link', { name: /latest release/i });
    await expect(releases.first()).toHaveAttribute(
      'href',
      'https://github.com/cschweda/drafter/releases/latest',
    );
    for (const [name, guide] of [
      [/Linux install guide/i, 'desktop-install-linux.md'],
      [/Windows install guide/i, 'desktop-install-windows.md'],
      [/build it on your Mac/i, 'desktop-install-macos.md'],
    ] as const) {
      await expect(page.getByRole('link', { name })).toHaveAttribute(
        'href',
        `https://github.com/cschweda/drafter/blob/main/docs/${guide}`,
      );
    }
    const text = await mainText(page);
    for (const phrase of [
      '.deb',
      'AppImage',
      'libfuse2',
      'drafterdev',
      'Ubuntu 24.04',
      'Windows',
      'SmartScreen',
      'More info',
      'Run anyway',
      'Arm',
      'macOS',
    ]) {
      expect(text, phrase).toContain(phrase);
    }
    expect(text).not.toMatch(/ICJIA/i);
  });
  test('the Drafter for Claude help page has its set-up, its privacy words, and no Copy button', async ({
    page,
  }) => {
    await page.goto('/docs/drafter-for-claude');
    await expect(heading(page)).toHaveText('Drafter for Claude');
    const text = await mainText(page);
    for (const phrase of [
      '"-y", "drafter-mcp@0.24.2",',
      'claude mcp add drafter --scope user -- npx -y drafter-mcp@0.24.2 --folder ~/Scripts --folder ~/Plays',
      'Node.js 22.12 or later',
      'shasum -a 256 drafter-mcp-0.24.2.js',
      'certutil -hashfile drafter-mcp-0.24.2.js SHA256',
      '"command": "node"',
      'When you ask Claude something, what Drafter hands Claude goes to Anthropic, the same as pasting it in.',
      'Text from a script can include words aimed at an AI. If someone sent you the script, read it with care.',
      'a hard link inside a folder is that file',
      'Not in a browser: claude.ai can’t start a program on your computer; Claude Desktop is the same account.',
      'It isn’t made by or connected with Anthropic.',
      'Each npm release is the same file as the one on the GitHub Release; you can check its SHA-256.',
      'except the setup and payoff names a story map shows',
    ]) {
      expect(text, phrase).toContain(phrase);
    }
    // The text reads and selects without a script; a button that couldn't work isn't shown.
    await expect(page.locator('main pre')).toHaveCount(6);
    await expect(page.getByRole('button', { name: /^Copy/ })).toHaveCount(0);
    // Each status line is in the page from the start, empty, so a screen reader hears a copy.
    await expect(page.locator('main [role="status"]')).toHaveCount(6);
    for (const status of await page.locator('main [role="status"]').all())
      await expect(status).toHaveText('');
    // Privacy links back with the table of what each tool returns.
    await page.goto('/docs/privacy');
    await expect(page.locator('#drafter-for-claude')).toBeVisible();
    await expect(page.locator('main table').last().locator('tbody tr')).toHaveCount(10);
  });
});

test.describe('with JavaScript', () => {
  test('the Drafter for Claude help page copies each configuration', async ({
    page,
    context,
    browserName,
  }) => {
    const chromium = browserName === 'chromium';
    if (chromium) await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/docs/drafter-for-claude');
    const copy = page.getByRole('button', { name: 'Copy the Claude Code command', exact: true });
    await expect(page.getByRole('button', { name: /^Copy/ })).toHaveCount(6);
    await copy.click();
    await expect(
      page.locator('main [role="status"]').filter({ hasText: /Copied\.|Couldn’t copy/ }),
    ).toHaveCount(1);
    if (chromium) {
      await expect(page.locator('main [role="status"]').filter({ hasText: 'Copied.' })).toHaveCount(
        1,
      );
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
        'claude mcp add drafter --scope user -- npx -y drafter-mcp@0.24.2 --folder ~/Scripts --folder ~/Plays',
      );
    }
  });

  test('the Download page asks nothing of another site, and marks the reader’s system without moving anything', async ({
    page,
  }) => {
    const elsewhere: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).host !== new URL(page.url() || 'http://localhost').host) {
        elsewhere.push(request.url());
      }
    });
    await page.goto('/docs/download');
    await expect(heading(page)).toHaveText('Download Drafter');
    await page.waitForLoadState('networkidle');
    expect(elsewhere.filter((url) => !url.startsWith('http://localhost'))).toEqual([]);
    // Every platform is there, whatever the system; at most one is marked as the reader’s.
    await expect(page.locator('section[data-platform]')).toHaveCount(3);
    expect(await page.locator('section[data-yours="true"]').count()).toBeLessThanOrEqual(1);
    const ua = await page.evaluate(() => navigator.userAgent);
    if (/Android|iPhone/.test(ua)) {
      await expect(page.locator('section[data-yours="true"]')).toHaveCount(0);
    } else {
      await expect(page.locator('section[data-yours="true"]')).toHaveCount(1);
    }
  });

  test('uses the app’s dark theme to begin with, and its light theme when that is chosen', async ({
    page,
  }) => {
    await page.goto('/docs/privacy');
    await expect(heading(page)).toBeVisible();
    expect(await background(page)).toBe('rgb(15, 16, 19)');
    await page.evaluate(() => localStorage.setItem('nuxt-color-mode', 'light'));
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/\blight\b/);
    expect(await background(page)).toBe('rgb(246, 245, 242)');
  });

  test('reads at 320px wide without scrolling sideways', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    for (const { path, title } of HELP_PAGES) {
      await page.goto(path);
      await expect(heading(page), path).toHaveText(title);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });

  test('goes back to the app from each page', async ({ context }) => {
    // A tab of its own for each page: Firefox refuses a tab's navigations past a rate ("Too many
    // attempts to navigate or modify history within a short timeframe"), and sixteen help pages and
    // the app, each loaded and left in one tab within seconds, went past it on the sixteenth Back.
    for (const { path } of HELP_PAGES) {
      const page = await context.newPage();
      await page.goto(path);
      await page.getByRole('link', { name: /Back to Drafter/ }).click();
      await expect(page, path).toHaveURL(/\/$/);
      await expect(editor(page)).toContainText('The Call');
      await page.close();
    }
  });
});

/** An action's error, unless the tab it was done in closed under it, which is what was wanted. */
// WebKit can report the press's "Page closed" a moment before `isClosed()` says so (a phone-webkit
// run did, on 2026-11-03), so that error counts as the tab going away too.
const gone = (tab: Page) => (error: unknown) => {
  if (!tab.isClosed() && !/page closed|target closed/i.test(String(error))) throw error;
};

test.describe('from the app', () => {
  /** Chooses `title` from Help in a new tab, which opens at the page. Returns that tab. */
  async function fromMenu(page: Page, title: string, how: 'click' | 'keyboard') {
    await openMenu(page);
    const opened = page.context().waitForEvent('page');
    if (how === 'click') {
      await menu(page).getByRole('menuitem', { name: title, exact: true }).click();
    } else {
      // Arrow down to the item.
      let found = false;
      for (let i = 0; i < 60 && !found; i += 1) {
        found = await page.evaluate(
          (name) => document.activeElement?.textContent?.trim().startsWith(name) ?? false,
          title,
        );
        if (!found) await page.keyboard.press('ArrowDown');
      }
      expect(found, title).toBe(true);
      await page.keyboard.press('Enter');
    }
    const tab = await opened;
    await tab.waitForLoadState();
    return tab;
  }

  test('Help has Download the desktop app, which opens the Download page', async ({ page }) => {
    await start(page);
    const tab = await fromMenu(page, 'Download the desktop app', 'click');
    await expect(tab).toHaveURL(/\/docs\/download\/?$/);
    await expect(heading(tab)).toHaveText('Download Drafter');
    await tab.close();
  });

  test('reaches the pages from Help, each in a new tab, and leaves the editor tab as it was', async ({
    page,
  }) => {
    let asked = false;
    page.on('dialog', (dialog) => {
      asked = true;
      void dialog.dismiss();
    });
    await start(page);
    for (const { title, path } of HELP_PAGES) {
      const tab = await fromMenu(page, title, 'click');
      await expect(tab, title).toHaveURL(new RegExp(`${path}/?$`));
      await expect(heading(tab), title).toHaveText(title);
      await tab.close();
      // The writer's tab is where it was: the app, its script, and no leave prompt.
      await expect(page).toHaveURL(/\/$/);
      // The sample's first scene: on a phone, which opens on Write at that scene (Task 9), the
      // title page's lines may be past the lines the editor draws.
      await expect(editor(page)).toContainText('INT. KITCHEN - NIGHT');
    }
    expect(asked).toBe(false);
  });

  test('reaches the pages from Help with the keyboard alone', async ({ page }) => {
    // A fresh start and a walk down the menu for each of the sixteen pages: over 30 s on CI.
    test.slow();
    for (const { title, path } of HELP_PAGES) {
      await start(page);
      await helpButton(page).focus();
      await page.keyboard.press('Enter');
      await expect(menu(page)).toBeVisible();
      const opened = page.context().waitForEvent('page');
      let found = false;
      for (let i = 0; i < 60 && !found; i += 1) {
        found = await page.evaluate(
          (name) => document.activeElement?.textContent?.trim().startsWith(name) ?? false,
          title,
        );
        if (!found) await page.keyboard.press('ArrowDown');
      }
      expect(found, title).toBe(true);
      await page.keyboard.press('Enter');
      const tab = await opened;
      await expect(tab, title).toHaveURL(new RegExp(`${path}/?$`));
      await expect(heading(tab), title).toHaveText(title);
      await tab.close();
    }
  });

  test('lists the pages in the command palette', async ({ page }) => {
    // Loaded once: the palette is opened again in the same tab for each page, as a writer would.
    await start(page);
    for (const { title, path } of HELP_PAGES) {
      await page.keyboard.press('ControlOrMeta+k');
      await expect(palette(page)).toBeVisible();
      // The command's own words: "Story map" alone finds Export as Story map… first.
      await page.keyboard.insertText(`Open the page: ${title}`);
      // The page is the first match, and the highlighted one.
      await expect(palette(page).getByRole('option').first()).toContainText(
        `Open the page: ${title}`,
      );
      const opened = page.context().waitForEvent('page');
      await page.keyboard.press('Enter');
      const tab = await opened;
      await expect(tab, title).toHaveURL(new RegExp(`${path}/?$`));
      await expect(heading(tab), title).toHaveText(title);
      await tab.close();
    }
  });

  test('Back to Drafter closes a help tab the app opened, after reading another page in it too', async ({
    page,
  }) => {
    await start(page);
    const tab = await fromMenu(page, 'Keyboard shortcuts', 'keyboard');
    await expect(heading(tab)).toHaveText('Keyboard shortcuts');
    // Another help page in the same tab: its Back still goes to the editor it came from.
    await tab
      .getByRole('navigation', { name: 'Help pages' })
      .getByRole('link', { name: 'Privacy' })
      .click();
    await expect(heading(tab)).toHaveText('Privacy');
    const closed = tab.waitForEvent('close');
    await tab.getByRole('link', { name: /Back to Drafter/ }).focus();
    // The tab goes away under the key, which Playwright reports as an error of the press.
    await tab.keyboard.press('Enter').catch(gone(tab));
    await closed;
    // One tab, the editor, as it was.
    expect(page.context().pages()).toEqual([page]);
    await expect(page).toHaveURL(/\/$/);
    // The sample's first scene: on a phone, which opens on Write at that scene (Task 9), the
    // title page's lines may be past the lines the editor draws.
    await expect(editor(page)).toContainText('INT. KITCHEN - NIGHT');
  });

  test('keeps what was being written, unsaved, when a page is read', async ({ page }) => {
    let asked = false;
    page.on('dialog', (dialog) => {
      asked = true;
      void dialog.dismiss();
    });
    await start(page);
    await showSource(page);
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.insertText('\n\nA line written before reading the help.');

    const tab = await fromMenu(page, 'Privacy', 'click');
    await expect(heading(tab)).toHaveText('Privacy');
    // The tab's link back closes it, rather than open a second editor that can't edit the script.
    const closed = tab.waitForEvent('close');
    await tab
      .getByRole('link', { name: /Back to Drafter/ })
      .click()
      .catch(gone(tab));
    await closed;
    expect(tab.isClosed()).toBe(true);

    // The writer's tab is untouched: no leave prompt, and the line is there.
    expect(asked).toBe(false);
    await showSource(page);
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+End');
    await expect(editor(page)).toContainText('A line written before reading the help.');
  });
});
