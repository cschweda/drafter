import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { embeddedSource } from '@drafter/archive';
import { type Browser, expect, type Page, test } from '@playwright/test';
import { openExported } from './exported';
import { removePickers } from './fs-stub';
import {
  chooseExport,
  clickInSource,
  editor,
  runCommand,
  setText,
  settled,
  showSource,
  start,
  textOf,
} from './modules';

// Export → Story map (story-map design §1.1, §7; plan Task 8): the Make a story map dialog, the
// page it downloads (no script, no request), what it writes into the script, and Use in story map.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const NAME = 'The Call – story map.html';
const HOSTILE = readFileSync(
  new URL('../../../fixtures/trap/files/fountain/story-map-hostile.fountain', import.meta.url),
  'utf8',
);

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Make a story map' });
const makeButton = (page: Page) => dialog(page).getByRole('button', { name: 'Make story map' });
const toast = (page: Page) => page.locator('.toast [role="status"]');

/** The dialog's fades done, so axe and a measure see the dialog as it stays. */
const still = (page: Page) =>
  page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY)
        .filter((a) => !(a instanceof CSSAnimation && a.animationName.startsWith('cm-blink')))
        .map((a) => a.finished.catch(() => {})),
    ),
  );

async function violations(page: Page, include?: string) {
  const builder = new AxeBuilder({ page }).withTags(WCAG);
  const { violations: found } = await (include ? builder.include(include) : builder).analyze();
  return found.map(({ id, nodes }) => `${id}: ${nodes.map((n) => n.target).join(', ')}`);
}

/** Opens the dialog from the palette, and waits for its quick look to arrive. */
async function openDialog(page: Page) {
  await runCommand(page, 'Export as Story map…');
  await expect(dialog(page)).toBeVisible();
  await expect(makeButton(page)).toBeFocused();
}

/** Runs `make`, which starts the download, and answers the file's name and text. */
async function downloaded(page: Page, make: () => Promise<void>) {
  const download = page.waitForEvent('download');
  await make();
  const file = await download;
  return { name: file.suggestedFilename(), text: await readFile(await file.path(), 'utf8') };
}

/** Makes a story map with the dialog as it opens (Enter), and answers the file. */
async function makeWithEnter(page: Page) {
  await openDialog(page);
  return downloaded(page, async () => {
    await page.keyboard.press('Enter');
    await expect(dialog(page)).toBeHidden();
  });
}

/** Opens `html` as a reader would, at `width` × 900, and runs `check` on it. */
async function asReader(
  browser: Browser,
  html: string,
  width: number,
  check: (file: Page, opened: Awaited<ReturnType<typeof openExported>>) => Promise<void>,
) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    storageState: { cookies: [], origins: [] },
  });
  try {
    const opened = await openExported(context, html);
    await check(opened.page, opened);
  } finally {
    await context.close();
  }
}

test.beforeEach(async ({ page }) => {
  await removePickers(page);
});

test('Export → Story map from the toolbar, the app menu, and the palette', async ({ page }) => {
  await start(page);
  const fromToolbar = await downloaded(page, async () => {
    await chooseExport(page, 'Story map (.html)…');
    await expect(dialog(page)).toBeVisible();
    await makeButton(page).click();
  });
  expect(fromToolbar.name).toBe(NAME);
  expect(fromToolbar.text.toLowerCase().startsWith('<!doctype html>')).toBe(true);
  await expect(toast(page)).toHaveText(`Exported ${NAME}.`);

  const fromAppMenu = await downloaded(page, async () => {
    await page.getByRole('button', { name: 'Drafter menu' }).click();
    await page
      .getByRole('menu', { name: 'Drafter menu' })
      .getByRole('menuitem', { name: /^Export as Story map/ })
      .click();
    await expect(dialog(page)).toBeVisible();
    await makeButton(page).click();
  });
  expect(fromAppMenu.name).toBe(NAME);

  const fromPalette = await downloaded(page, async () => {
    await openDialog(page);
    await makeButton(page).click();
  });
  expect(fromPalette.name).toBe(NAME);
  // The same script makes the same page, but for nothing.
  expect(fromPalette.text).toBe(fromToolbar.text);
});

test('the dialog’s defaults make a page with Enter, holding no script and no notes', async ({
  page,
}) => {
  await start(page);
  const { name, text } = await makeWithEnter(page);
  expect(name).toBe(NAME);
  expect(text).not.toContain('<script');
  expect(text).toContain('<h1');
  expect(text).toContain('The Call');
  expect(text).toMatch(/What I(?:'|&#39;|&#x27;|&apos;)m writing/);
  // No note's words, no other title page line, and no source to reopen.
  expect(text).not.toContain('double brackets');
  expect(text).not.toContain('writer@example.com');
  expect(text).not.toContain('Draft date');
  expect(await embeddedSource(new TextEncoder().encode(text))).toBeNull();
  expect(await textOf(page)).not.toContain('[[Quote]]');
});

test('the file opens with every request blocked and asks for nothing', async ({
  page,
  browser,
}) => {
  await start(page);
  const { text } = await makeWithEnter(page);
  await asReader(browser, text, 390, async (file, opened) => {
    await expect(file.locator('h1')).toBeVisible();
    expect(opened.others()).toEqual([]);
    expect(await opened.refused()).toEqual([]);
    // Nothing on the page can run.
    expect(await file.locator('script').count()).toBe(0);
  });
});

test('a changed logline is written to the title page', async ({ page }) => {
  await start(page);
  await openDialog(page);
  const logline = dialog(page).getByLabel('Logline');
  await logline.fill('A mother waits for a call, and gets a knock instead.');
  const { text } = await downloaded(page, async () => {
    await makeButton(page).click();
  });
  expect(text).toContain('A mother waits for a call, and gets a knock instead.');
  await showSource(page);
  await expect(editor(page)).toContainText(
    'Logline: A mother waits for a call, and gets a knock instead.',
  );
  // One undo takes it back.
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(editor(page)).not.toContainText('Logline:');
});

test('dialog choices are kept for the script', async ({ page }) => {
  await start(page);
  await openDialog(page);
  await dialog(page).getByRole('button', { name: 'Finished' }).click();
  await dialog(page).getByLabel('Threads (your setups and payoffs)').uncheck();
  await dialog(page).getByLabel('The line under your name').fill('My first screenplay');
  const { text } = await downloaded(page, async () => {
    await makeButton(page).click();
  });
  expect(text).toContain('My first screenplay');
  expect(text).toContain('A finished screenplay');
  await page.reload();
  await expect(editor(page)).toContainText('The Call');
  await openDialog(page);
  await expect(dialog(page).getByRole('button', { name: 'Finished' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(dialog(page).getByLabel('Threads (your setups and payoffs)')).not.toBeChecked();
  await expect(dialog(page).getByLabel('The line under your name')).toHaveValue(
    'My first screenplay',
  ); // Back to the default: the gaps decide again, and that is kept too.
  await dialog(page).getByRole('button', { name: 'From the gaps' }).click();
  await downloaded(page, async () => {
    await makeButton(page).click();
  });
  await openDialog(page);
  await expect(dialog(page).getByRole('button', { name: 'From the gaps' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

/** A short script whose speeches are all on screen. */
const SHORT = [
  'Title: Short Fuse',
  '',
  'INT. GARAGE - NIGHT',
  '',
  'She scrapes the plate into the bin.',
  '',
  'MARGARET',
  'Of course you did.',
  '',
  'DANNY',
  'I called from a pay phone, twice, in the rain.',
  '',
].join('\n');

test('Use in story map from the palette writes [[Quote]]', async ({ page }) => {
  await start(page);
  await setText(page, SHORT);
  await settled(page);
  await clickInSource(page, editor(page).getByText('Of course you did.'));
  await runCommand(page, 'Use in story map');
  await expect(editor(page)).toContainText('Of course you did. [[Quote]]');
  await runCommand(page, 'Never use in story map');
  await expect(editor(page)).toContainText('Of course you did. [[No quote]]');
  await expect(editor(page)).not.toContainText('[[Quote]]');
  // Off where the cursor isn't in a speech: the palette doesn't offer it.
  await clickInSource(page, editor(page).getByText('She scrapes the plate'));
  await page.keyboard.press('ControlOrMeta+k');
  await page.keyboard.insertText('Use in story map');
  await expect(
    page
      .getByRole('dialog', { name: 'Command palette' })
      .getByRole('option', { name: 'Use in story map', exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press('Escape');
});

test('Pick another moves the line, and unticking says never', async ({ page }) => {
  await start(page);
  await setText(page, SHORT);
  await settled(page);
  await openDialog(page);
  await dialog(page).getByText('Check the lines and hooks').click();
  const picks = dialog(page).locator('.pick');
  await expect(picks.first()).toBeVisible();
  // Pick another: the scene's other line.
  await expect(picks).toHaveCount(1);
  const first = (await picks.first().textContent()) ?? '';
  await picks
    .first()
    .getByRole('button', { name: /^Pick another line/ })
    .click();
  await expect(picks.first()).not.toHaveText(first);
  await downloaded(page, async () => {
    await makeButton(page).click();
  });
  // The first pick is never used, and the other one is.
  await expect(editor(page)).toContainText('[[No quote]]');
  await expect(editor(page)).toContainText('[[Quote]]');
  // Unticking says never.
  await openDialog(page);
  await dialog(page).getByText('Check the lines and hooks').click();
  await picks.first().getByRole('checkbox').uncheck();
  await downloaded(page, async () => {
    await makeButton(page).click();
  });
  await expect(editor(page)).not.toContainText('[[Quote]]');
});

test('no sideways scroll at 390 px, with the hostile fixture too', async ({ page, browser }) => {
  await start(page);
  const sample = await makeWithEnter(page);
  await setText(page, HOSTILE);
  await settled(page);
  const hostile = await makeWithEnter(page);
  for (const { text } of [sample, hostile]) {
    await asReader(browser, text, 390, async (file, opened) => {
      expect(await file.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        390,
      );
      expect(opened.others()).toEqual([]);
    });
  }
  // The hostile title stays text.
  expect(hostile.text).not.toContain('<script');
  // Its words are there, escaped: never an element or an attribute of their own.
  expect(hostile.text).not.toMatch(/<svg[^>]*\sonload=/i);
  expect(hostile.text).not.toContain('<foreignObject');
});

test('axe has no violations at 390 and 1440 px, in progress and finished', async ({
  page,
  browser,
}) => {
  await start(page);
  // From the gaps by default: the sample has none, so it reads as finished.
  await openDialog(page);
  await expect(dialog(page).getByRole('button', { name: 'From the gaps' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(dialog(page)).toContainText('Nothing is still to write');
  await dialog(page).getByRole('button', { name: 'In progress' }).click();
  const inProgress = await downloaded(page, async () => {
    await makeButton(page).click();
  });
  expect(inProgress.text).toContain('A screenplay in progress');
  await openDialog(page);
  await dialog(page).getByRole('button', { name: 'Finished' }).click();
  const finished = await downloaded(page, async () => {
    await makeButton(page).click();
  });
  expect(inProgress.text).not.toBe(finished.text);
  for (const { text } of [inProgress, finished]) {
    for (const width of [390, 1440]) {
      await asReader(browser, text, width, async (file) => {
        expect(await violations(file), `${width}px`).toEqual([]);
      });
    }
  }
});

for (const theme of ['dark', 'light'] as const) {
  test(`the dialog passes axe and is reached from the keyboard (${theme})`, async ({
    page,
    browserName,
  }) => {
    await page.addInitScript((t) => localStorage.setItem('nuxt-color-mode', t), theme);
    await start(page);
    await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`));
    // From the keyboard: the palette, then the dialog's own fields, in order.
    await openDialog(page);
    await dialog(page).getByText('Check the lines and hooks').click();
    await expect(dialog(page).locator('.pick').first()).toBeVisible();
    await still(page);
    expect(await violations(page, '.story-map-dialog')).toEqual([]);
    // WebKit leaves buttons out of Tab unless the system's keyboard access is on.
    if (browserName !== 'webkit') {
      await makeButton(page).focus();
      await page.keyboard.press('Shift+Tab');
      await expect(dialog(page).getByRole('button', { name: 'Cancel' })).toBeFocused();
    }
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();
  });
}

test('on a phone the dialog is a sheet from the bottom', async ({ page }) => {
  await start(page);
  const viewport = page.viewportSize();
  test.skip(!viewport || viewport.width >= 640, 'a sheet below 640 px only');
  await openDialog(page);
  await still(page);
  const box = await dialog(page).boundingBox();
  expect(box).not.toBeNull();
  if (!box || !viewport) return;
  expect(Math.round(box.x)).toBe(0);
  expect(Math.round(box.width)).toBe(viewport.width);
  expect(Math.abs(box.y + box.height - viewport.height)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    viewport.width,
  );
});
