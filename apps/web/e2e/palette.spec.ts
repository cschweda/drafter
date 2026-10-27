import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { files, nextFileName, picks, removePickers, stubPickers } from './fs-stub';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const SAMPLE = readFileSync(
  new URL('../../../samples/screenplay.fountain', import.meta.url),
  'utf8',
);
const SAMPLE_LINES = SAMPLE.split('\n');

async function violations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return violations.map(({ id, nodes }) => `${id}: ${nodes.map((n) => n.target).join(', ')}`);
}

const editor = (page: Page) => page.locator('.cm-content');
const palette = (page: Page) => page.getByRole('dialog', { name: 'Command palette' });
const query = (page: Page) => palette(page).locator('input');
const toolbarField = (page: Page) => page.getByRole('button', { name: 'Go to scene or command' });
const option = (page: Page, name: string | RegExp) => palette(page).getByRole('option', { name });

interface Row {
  id: string;
  title: string;
  source: string;
  sample?: string;
}

function stored(page: Page): Promise<Row[]> {
  return page.evaluate(
    () =>
      new Promise<Row[]>((resolve) => {
        const open = indexedDB.open('drafter');
        open.onerror = () => resolve([]);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('projects')) {
            db.close();
            resolve([]);
            return;
          }
          const request = db.transaction('projects').objectStore('projects').getAll();
          request.onsuccess = () => {
            db.close();
            resolve(request.result as Row[]);
          };
          request.onerror = () => {
            db.close();
            resolve([]);
          };
        };
      }),
  );
}

async function start(page: Page) {
  await page.goto('/');
  await expect.poll(async () => (await stored(page)).length).toBeGreaterThan(0);
  await expect(editor(page)).toBeAttached();
}

/** The Source tab, which a phone doesn't show to begin with. */
async function showSource(page: Page) {
  if (!(await editor(page).isVisible())) {
    await page.getByRole('tab', { name: 'Source' }).first().click();
  }
  await expect(editor(page)).toBeVisible();
}

async function openPalette(page: Page) {
  await page.keyboard.press('ControlOrMeta+k');
  await expect(palette(page)).toBeVisible();
  await expect(query(page)).toBeFocused();
  // The list highlights its first row a moment after it opens, and a search typed before then
  // leaves nothing highlighted for Enter to choose.
  await expect(palette(page).locator('[role="option"][data-highlighted]')).toHaveCount(1);
}

/**
 * Types `text` in the palette and chooses the first match with Enter, once it is the highlighted
 * one: the list is filtered a moment after the typing, and Enter before that chooses what was
 * highlighted before.
 */
async function choose(page: Page, text: string, name: string | RegExp = text) {
  await query(page).fill(text);
  // The list is filtered a moment after the typing; the first row is the one asked for only then.
  const pattern =
    typeof name === 'string' ? new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) : name;
  await expect(palette(page).getByRole('option').first()).toHaveAccessibleName(pattern);
  await expect(palette(page).locator('[role="option"][data-highlighted]')).toHaveCount(1);
  await page.keyboard.press('Enter');
}

/** The text of the line the cursor is in. */
const cursorLine = (page: Page) =>
  page.evaluate(() => {
    const node = getSelection()?.anchorNode;
    const element = node instanceof Element ? node : node?.parentElement;
    return element?.closest('.cm-line')?.textContent ?? null;
  });

/** Replaces the text with `text`, typed in one go. */
async function setText(page: Page, text: string) {
  await showSource(page);
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(text);
}

async function useLightTheme(page: Page) {
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).toHaveClass(/\blight\b/);
}

test.describe('the command palette', () => {
  test.beforeEach(async ({ page }) => {
    await start(page);
  });

  test('opens with Mod+K and from the toolbar', async ({ page }) => {
    await expect(palette(page)).toBeHidden();
    await openPalette(page);
    // The same key closes it.
    await page.keyboard.press('ControlOrMeta+k');
    await expect(palette(page)).toBeHidden();

    await toolbarField(page).click();
    await expect(palette(page)).toBeVisible();
    await expect(query(page)).toBeFocused();
  });

  test('opens from inside the editor without typing into it', async ({ page }) => {
    await showSource(page);
    await editor(page).click();
    const before = await editor(page).textContent();
    await openPalette(page);
    await page.keyboard.type('kitchen');
    await expect(query(page)).toHaveValue('kitchen');
    await expect(editor(page)).toHaveText(before ?? '');
  });

  test('goes to a scene by name', async ({ page }) => {
    await openPalette(page);
    await query(page).fill('back porch');
    const scene = option(page, /EXT\. BACK PORCH - LATER/);
    await expect(scene).toBeVisible();
    // Its source line is shown beside it.
    const line = SAMPLE_LINES.findIndex((l) => l.startsWith('EXT. BACK PORCH')) + 1;
    await expect(scene).toContainText(`line ${line}`);
    await expect(scene).toHaveAttribute('data-highlighted', '');
    await page.keyboard.press('Enter');
    await expect(palette(page)).toBeHidden();
    await expect(editor(page)).toBeFocused();
    await expect.poll(() => cursorLine(page)).toBe('EXT. BACK PORCH - LATER');
  });

  test('lists every scene when nothing is typed', async ({ page }) => {
    await openPalette(page);
    await expect(palette(page).getByText('Scenes', { exact: true })).toBeVisible();
    await expect(option(page, /INT\. KITCHEN - NIGHT/)).toBeVisible();
    await expect(option(page, /EXT\. BACK PORCH - LATER/)).toBeVisible();
  });

  test('goes to a line by number', async ({ page }) => {
    const n = SAMPLE_LINES.findIndex((l, i) => i > 30 && l.trim().length > 10) + 1;
    await openPalette(page);
    await query(page).fill(String(n));
    await choose(page, String(n), `Go to line ${n}`);
    await expect(palette(page)).toBeHidden();
    await expect.poll(() => cursorLine(page)).toBe(SAMPLE_LINES[n - 1]);
  });

  test('goes to the last line for a number past the end, and the first for zero', async ({
    page,
  }) => {
    const last = SAMPLE_LINES.length;
    await openPalette(page);
    await choose(page, '99999', `Go to line ${last}`);
    await expect(palette(page)).toBeHidden();
    await expect.poll(() => cursorLine(page)).toBe(SAMPLE_LINES[last - 1]);

    await openPalette(page);
    await choose(page, '0', 'Go to line 1');
    await expect(palette(page)).toBeHidden();
    await expect.poll(() => cursorLine(page)).toBe(SAMPLE_LINES[0]);
  });

  test('offers only scenes for "Go to scene…", and a prompt for "Go to line…"', async ({
    page,
  }) => {
    await openPalette(page);
    await query(page).fill('go to scene');
    await option(page, 'Go to scene…').click();
    // The palette stays open, listing scenes alone.
    await expect(palette(page)).toBeVisible();
    await expect(query(page)).toHaveValue('');
    await expect(option(page, /INT\. KITCHEN - NIGHT/)).toBeVisible();
    await expect(option(page, 'Save')).toHaveCount(0);

    await page.keyboard.press('Escape');
    await expect(palette(page)).toBeHidden();

    await openPalette(page);
    await query(page).fill('go to line');
    await option(page, 'Go to line…').click();
    await expect(palette(page)).toBeVisible();
    await expect(palette(page)).toContainText('Type a line number');
    await query(page).fill('3');
    await expect(option(page, 'Go to line 3')).toBeVisible();
    await expect(option(page, /INT\. KITCHEN - NIGHT/)).toHaveCount(0);
  });

  test('starts from everything each time it opens', async ({ page }) => {
    await openPalette(page);
    await query(page).fill('go to line');
    await option(page, 'Go to line…').click();
    await page.keyboard.press('Escape');
    await expect(palette(page)).toBeHidden();
    await openPalette(page);
    await expect(query(page)).toHaveValue('');
    await expect(option(page, /^Save\s+\S+$/)).toBeVisible();
  });

  test('runs a command', async ({ page }) => {
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    await openPalette(page);
    await choose(page, 'switch theme', 'Switch theme');
    await expect(palette(page)).toBeHidden();
    await expect(page.locator('html')).toHaveClass(/\blight\b/);

    await openPalette(page);
    await query(page).fill('switch theme');
    await option(page, 'Switch theme').click();
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  });

  test('shows each command with its keys', async ({ page }) => {
    await openPalette(page);
    await query(page).fill('save');
    await expect(option(page, /^Save\b(?!\s*As)/)).toContainText(/⌘S|Ctrl\+S/);
    await expect(option(page, /Save As/)).toContainText(/⌘⇧S|Ctrl\+Shift\+S/);
  });

  test('changes the text through a Fountain command and returns to the editor', async ({
    page,
  }) => {
    await setText(page, 'The rain stops.');
    await page.keyboard.press('ControlOrMeta+Home');
    await toolbarField(page).click();
    await choose(page, 'force scene heading', 'Force scene heading (.)');
    await expect(palette(page)).toBeHidden();
    await expect(editor(page)).toHaveText('.The rain stops.');
    await expect(editor(page)).toBeFocused();
  });

  test('shows the Source tab for a command that works on the text', async ({ page }) => {
    await page.getByRole('tab', { name: 'Script' }).first().click();
    await openPalette(page);
    await choose(page, 'force action', 'Force action (!)');
    await expect(palette(page)).toBeHidden();
    await expect(editor(page)).toBeVisible();
  });

  test('shows the Problems tab', async ({ page }) => {
    await openPalette(page);
    await choose(page, 'show problems', 'Show Problems');
    await expect(palette(page)).toBeHidden();
    await expect(page.getByRole('tabpanel', { name: 'Problems' })).toBeVisible();
  });

  test('says when nothing matches', async ({ page }) => {
    await openPalette(page);
    await query(page).fill('zzzzzz');
    await expect(palette(page)).toContainText('Nothing matches');
  });

  test('closes with Escape and returns focus to the editor', async ({ page }) => {
    await showSource(page);
    await editor(page).click();
    await openPalette(page);
    await page.keyboard.press('Escape');
    await expect(palette(page)).toBeHidden();
    await expect(editor(page)).toBeFocused();
  });

  test('closes with Escape and returns focus to the toolbar field', async ({ page }) => {
    await toolbarField(page).click();
    await expect(palette(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(palette(page)).toBeHidden();
    await expect(toolbarField(page)).toBeFocused();
  });

  test('closes from its close button', async ({ page }) => {
    await openPalette(page);
    await palette(page).getByRole('button', { name: /close/i }).click();
    await expect(palette(page)).toBeHidden();
  });

  test('moves through the list with the arrow keys', async ({ page }) => {
    await openPalette(page);
    await query(page).fill('force');
    const rows = palette(page).getByRole('option');
    await expect(rows.first()).toHaveAccessibleName(/^Force/);
    await expect(rows.first()).toHaveAttribute('data-highlighted', '');
    await page.keyboard.press('ArrowDown');
    await expect(rows.first()).not.toHaveAttribute('data-highlighted', '');
    await expect(rows.nth(1)).toHaveAttribute('data-highlighted', '');
    await page.keyboard.press('ArrowUp');
    await expect(rows.first()).toHaveAttribute('data-highlighted', '');
  });

  test('shows a scene named like HTML as text', async ({ page }) => {
    const alerts: string[] = [];
    page.on('dialog', (dialog) => {
      alerts.push(dialog.message());
      void dialog.dismiss();
    });
    await setText(page, 'INT. <img src=x onerror=alert(1)> - DAY\n\nSomeone waits.');
    await openPalette(page);
    await query(page).fill('img');
    const scene = option(page, /<img src=x onerror=alert\(1\)>/);
    await expect(scene).toBeVisible();
    await expect(scene).toContainText('line 1');
    expect(await page.locator('img[src="x"]').count()).toBe(0);
    expect(await palette(page).locator('img').count()).toBe(0);
    // The label is text, whatever was typed to find it.
    await expect(scene.locator('mark')).toHaveCount(0);
    expect(alerts).toEqual([]);
    await expect(palette(page).locator('[role="option"][data-highlighted]')).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect.poll(() => cursorLine(page)).toBe('INT. <img src=x onerror=alert(1)> - DAY');
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`has no accessibility violations with the palette open, in the ${theme} theme`, async ({
      page,
    }) => {
      if (theme === 'light') await useLightTheme(page);
      await openPalette(page);
      expect(await violations(page), 'listing everything').toEqual([]);
      await query(page).fill('kitchen');
      await expect(option(page, /KITCHEN/)).toBeVisible();
      expect(await violations(page), 'with a query').toEqual([]);
      await query(page).fill('zzzz');
      await expect(palette(page)).toContainText('Nothing matches');
      expect(await violations(page), 'with nothing found').toEqual([]);
    });
  }
});

test.describe('the keys of the commands', () => {
  test('Mod+Alt+N starts a new screenplay', async ({ page, isMobile }) => {
    await start(page);
    await page.keyboard.press('ControlOrMeta+Alt+n');
    await expect(editor(page)).toContainText('Untitled Screenplay');
    // The editor takes focus where it is showing; a phone shows the Script tab to begin with.
    if (!isMobile) await expect(editor(page)).toBeFocused();
    expect((await stored(page)).filter((p) => !p.sample)).toHaveLength(1);
  });

  test('Mod+O asks for a file, once', async ({ page }) => {
    await removePickers(page);
    await start(page);
    const chooser = page.waitForEvent('filechooser');
    await page.keyboard.press('ControlOrMeta+o');
    await chooser;
  });

  test('Mod+S saves once for each press', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the stand-in file pickers are Chromium’s');
    await stubPickers(page);
    await start(page);
    await nextFileName(page, 'Once.fountain');
    await page.keyboard.press('ControlOrMeta+s');
    await expect.poll(async () => await files(page)).toContain('Once.fountain');
    expect(await picks(page)).toEqual(['Once.fountain']);
  });

  test('Mod+K does nothing to the text when held down', async ({ page }) => {
    await start(page);
    await showSource(page);
    await editor(page).click();
    const before = await editor(page).textContent();
    await page.keyboard.down('ControlOrMeta');
    await page.keyboard.down('k');
    await page.keyboard.down('k');
    await page.keyboard.up('k');
    await page.keyboard.up('ControlOrMeta');
    await expect(palette(page)).toBeVisible();
    expect(await editor(page).textContent()).toBe(before);
  });
});

test.describe('removing the open script', () => {
  test('asks first, and removes it from this browser', async ({ page }) => {
    await start(page);
    await page.keyboard.press('ControlOrMeta+Alt+n');
    await showSource(page);
    await expect(editor(page)).toContainText('Untitled Screenplay');
    await expect.poll(async () => (await stored(page)).filter((p) => !p.sample).length).toBe(1);

    await openPalette(page);
    await choose(page, 'remove from', 'Remove from this browser');
    const ask = page.getByRole('dialog', { name: /Remove “Untitled Screenplay”/ });
    await expect(ask).toBeVisible();
    await ask.getByRole('button', { name: 'Cancel' }).click();
    await expect(ask).toBeHidden();
    expect((await stored(page)).filter((p) => !p.sample)).toHaveLength(1);

    await openPalette(page);
    await choose(page, 'remove from', 'Remove from this browser');
    await expect(ask).toBeVisible();
    await ask.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(ask).toBeHidden();
    await expect.poll(async () => (await stored(page)).filter((p) => !p.sample).length).toBe(0);
    await expect(editor(page)).not.toContainText('Untitled Screenplay');
  });

  test('is not offered for a sample', async ({ page }) => {
    await start(page);
    await openPalette(page);
    await query(page).fill('remove from');
    await expect(option(page, 'Remove from this browser')).toHaveCount(0);
  });

  test('has no accessibility violations with the question open', async ({ page }) => {
    await start(page);
    await page.keyboard.press('ControlOrMeta+Alt+n');
    await expect(page.locator('html')).toBeVisible();
    await expect.poll(async () => (await stored(page)).filter((p) => !p.sample).length).toBe(1);
    await openPalette(page);
    await choose(page, 'remove from', 'Remove from this browser');
    await expect(page.getByRole('dialog', { name: /Remove/ })).toBeVisible();
    expect(await violations(page), 'dark').toEqual([]);
  });
});

test.describe('in a tab that only shows a script', () => {
  test.skip(({ isMobile }) => !!isMobile, 'two tabs are the same on a phone');

  async function openTab(context: BrowserContext): Promise<Page> {
    const page = await context.newPage();
    await start(page);
    return page;
  }

  test('hides the commands that would change the text', async ({ context }) => {
    await openTab(context);
    const b = await openTab(context);
    await expect(b.getByText('This script is open for editing in another tab')).toBeVisible();
    await openPalette(b);
    await query(b).fill('make');
    await expect(palette(b)).toContainText('Nothing matches');
    await query(b).fill('undo');
    await expect(option(b, 'Undo')).toHaveCount(0);
    await query(b).fill('new');
    await expect(option(b, 'New screenplay')).toHaveCount(0);
    // Finding and going to a scene still work.
    await query(b).fill('find');
    await expect(option(b, 'Find')).toBeVisible();
    await choose(b, 'back porch', /BACK PORCH/);
    await expect.poll(() => cursorLine(b)).toBe('EXT. BACK PORCH - LATER');
  });
});
