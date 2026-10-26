import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { removePickers } from './fs-stub';

// A first visit (Phase 1 design §4): the screenplay sample, with the cursor on its first scene
// heading and a bar offering the writer's own start. The welcome dialog is Task 6's; the
// accessibility check of a first visit waits for the project's final stage (decided 2026-10-26),
// and the sample bar's keyboard use is tested here.

const SAMPLE = readFileSync(
  new URL('../../../samples/screenplay.fountain', import.meta.url),
  'utf8',
);
const HEADING = 'INT. KITCHEN - NIGHT';
/** The first scene heading's line in the sample file (1-based): derived, not assumed. */
const HEADING_LINE = SAMPLE.split('\n').findIndex((l) => l.startsWith('INT.')) + 1;

const editor = (page: Page) => page.locator('.cm-content');
const bar = (page: Page) => page.getByRole('region', { name: 'Sample' });
const barButtons = (page: Page) => bar(page).getByRole('button');
const palette = (page: Page) => page.getByRole('dialog', { name: 'Command palette' });
const script = (page: Page) => page.getByRole('region', { name: 'Script' });
const mark = (page: Page) => page.getByRole('button', { name: 'Drafter menu' });
const menu = (page: Page) => page.getByRole('menu', { name: 'Drafter menu' });
const status = (page: Page) => page.locator('[data-tour="status"]');
/** Two panes, the full bar; below 1024px one pane and the bar's compact row. */
const wide = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

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

/** The text in the editor, even while a phone shows another tab. */
const text = (page: Page) => editor(page).evaluate((el) => el.textContent ?? '');

async function openPalette(page: Page) {
  await page.keyboard.press('ControlOrMeta+k');
  await expect(palette(page)).toBeVisible();
  await expect(palette(page).locator('[role="option"][data-highlighted]')).toHaveCount(1);
}

test.describe('a first visit', () => {
  test('opens a first visit on the sample’s first scene heading', async ({ page }) => {
    expect(HEADING_LINE).toBeGreaterThan(1);
    await start(page);

    // The Script pane (the tab a phone starts on) shows the heading.
    // (The heading's block has no box of its own; its line does.)
    const heading = script(page).locator('.drafter-line', { hasText: HEADING }).first();
    await expect(heading).toBeInViewport();

    await showSource(page);
    // The heading line is near the top of the Source pane, with the lines before it scrolled away.
    const scroller = page.locator('.cm-scroller');
    const line = page.locator('.cm-line', { hasText: HEADING });
    await expect(line).toBeInViewport();
    await expect
      .poll(async () => {
        const top = (await scroller.boundingBox())?.y ?? 0;
        const at = (await line.boundingBox())?.y ?? Number.POSITIVE_INFINITY;
        return at - top;
      })
      .toBeLessThan(80);
    await expect(page.locator('.cm-line', { hasText: 'Title: The Call' })).not.toBeInViewport();

    // The cursor is at the start of that line: what is typed lands there.
    await editor(page).focus();
    await page.keyboard.insertText('ZZ');
    await expect(page.locator('.cm-line', { hasText: `ZZ${HEADING}` })).toBeVisible();
    expect(await text(page)).toContain(`ZZ${HEADING}`);

    // Ctrl+Home goes back to the very top: the title page.
    await page.keyboard.press('ControlOrMeta+Home');
    await expect(status(page)).toContainText('Title page');
  });

  test('offers new scripts and Open from the sample bar', async ({ page }) => {
    // Browsers without a picker read a file through an input, which every browser can do here.
    await removePickers(page);
    await start(page);

    // The bar is above the panes, so it is there whichever tab is showing.
    await expect(bar(page)).toBeVisible();
    if (wide(page)) {
      await expect(bar(page)).toContainText('This is a sample. Start your own:');
      // The New buttons are the document types, in their order, then Open.
      await expect(barButtons(page)).toHaveText([
        'New screenplay',
        'New stage play',
        'New Markdown document',
        'Open a file…',
      ]);
      await barButtons(page).nth(1).click();
    } else {
      // A phone: one row, "Sample", the first button, and a menu with the rest.
      await expect(bar(page)).not.toContainText('Start your own');
      await expect(barButtons(page)).toHaveText(['New screenplay', 'More']);
      await barButtons(page).last().click();
      const items = page.getByRole('menu').getByRole('menuitem');
      await expect(items).toHaveText(['New stage play', 'New Markdown document', 'Open a file…']);
      await items.first().click();
    }
    await expect(bar(page)).toHaveCount(0);
    await showSource(page);
    await expect.poll(() => text(page)).toContain('Title: Untitled Play');
    await expect(editor(page)).toBeFocused();
    // The sample stays where it was, and the new play is a script of the writer's own.
    expect((await stored(page)).filter((p) => !p.sample)).toHaveLength(1);

    // From the sample again: Open a file… reads a file as a script of its own.
    await page.getByRole('button', { name: 'Drafter menu' }).click();
    await menu(page)
      .getByRole('menuitem', { name: /^Open sample: Screenplay/ })
      .click();
    await expect(bar(page)).toBeVisible();
    const chooser = page.waitForEvent('filechooser');
    if (wide(page)) {
      await bar(page).getByRole('button', { name: 'Open a file…' }).click();
    } else {
      await bar(page).getByRole('button', { name: 'More' }).click();
      await page.getByRole('menuitem', { name: 'Open a file…' }).click();
    }
    await (await chooser).setFiles({
      name: 'Door.fountain',
      mimeType: 'text/plain',
      buffer: Buffer.from('Title: The Open Door\n\nINT. HALL - DAY\n\nA door opens.\n'),
    });
    await expect.poll(() => text(page)).toContain('A door opens.');
    await expect(bar(page)).toHaveCount(0);
  });

  test('shows the sample bar on every tab', async ({ page }) => {
    await start(page);
    await expect(bar(page)).toBeVisible();
    for (const name of ['Source', 'Script', 'Problems']) {
      await page.getByRole('tab', { name }).first().click();
      await expect(page.getByRole('tab', { name, selected: true })).toBeVisible();
      await expect(bar(page)).toBeVisible();
    }
  });

  test('keeps the sample bar to one row on a small phone', async ({ page }) => {
    test.skip(wide(page), 'a phone-width screen only');
    await page.setViewportSize({ width: 320, height: 640 });
    await start(page);
    const box = await bar(page).boundingBox();
    expect(box?.height ?? 999).toBeLessThan(52);
    // Nothing runs past the edge of the screen (WCAG 1.4.10).
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    );
    await expect(barButtons(page).last()).toBeInViewport();
  });

  test('reaches the sample bar from the keyboard', async ({ page, browserName }) => {
    test.skip(!wide(page), 'a phone has no keyboard');
    await start(page);
    if (browserName === 'webkit') {
      // Safari leaves buttons out of the Tab order unless the user asks for it, so the bar's
      // buttons are focused directly and chosen with Enter.
      await barButtons(page).nth(1).focus();
      await expect(barButtons(page).nth(1)).toBeFocused();
      await page.keyboard.press('Enter');
      await expect.poll(() => text(page)).toContain('Title: Untitled Play');
      await expect(bar(page)).toHaveCount(0);
      return;
    }
    // From the toolbar's last control, Tab goes on to the sample bar, in order.
    await page.getByRole('button', { name: /Switch to (light|dark) theme/ }).focus();
    const reached: string[] = [];
    for (let i = 0; i < 8 && reached.length < 4; i++) {
      await page.keyboard.press('Tab');
      const name = await page.evaluate(() => {
        const el = document.activeElement;
        return el?.closest('[aria-label="Sample"]') ? (el.textContent?.trim() ?? '') : '';
      });
      if (name) reached.push(name);
    }
    expect(reached).toEqual([
      'New screenplay',
      'New stage play',
      'New Markdown document',
      'Open a file…',
    ]);
    // Enter chooses the focused one.
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(barButtons(page).nth(1)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect.poll(() => text(page)).toContain('Title: Untitled Play');
    await expect(bar(page)).toHaveCount(0);
  });

  test('resets the sample, and undo brings the edits back', async ({ page }) => {
    await start(page);
    await showSource(page);
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.insertText('\nMY OWN EDIT.\n');
    await expect.poll(() => text(page)).toContain('MY OWN EDIT.');
    await page.keyboard.insertText('MORE.');

    // The palette lists it while a sample is open.
    await openPalette(page);
    await palette(page).locator('input').fill('Reset sample');
    const option = palette(page).getByRole('option', { name: /^Reset sample/ });
    await expect(option).toBeVisible();
    await expect(palette(page).locator('[role="option"][data-highlighted]')).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(palette(page)).toBeHidden();

    await expect.poll(() => text(page)).not.toContain('MY OWN EDIT.');
    // The recovery copy has the sample's text again (the editor draws only the lines in view).
    await expect
      .poll(async () => (await stored(page)).find((p) => p.sample === 'screenplay')?.source)
      .toBe(SAMPLE);

    // One Undo brings back everything the reset replaced: all the edits, in one step.
    await editor(page).focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => text(page)).toContain('MY OWN EDIT.');
    expect(await text(page)).toContain('MORE.');
  });

  test('lists Reset sample in the Help menu while a sample is open, and not otherwise', async ({
    page,
  }) => {
    await start(page);
    await mark(page).click();
    await expect(menu(page)).toBeVisible();
    await expect(menu(page).getByText('Help', { exact: true })).toBeVisible();
    const reset = menu(page).getByRole('menuitem', { name: /^Reset sample/ });
    await expect(reset).toBeEnabled();
    await page.keyboard.press('Escape');

    // In a script of the writer's own it is not on offer: the palette leaves it out, the menu shows it off.
    await showSource(page);
    await page.keyboard.press('ControlOrMeta+Alt+n');
    await expect.poll(() => text(page)).toContain('Title: Untitled Screenplay');
    await openPalette(page);
    await palette(page).locator('input').fill('Reset sample');
    await expect(palette(page).getByRole('option', { name: /^Reset sample/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await mark(page).click();
    await expect(menu(page).getByRole('menuitem', { name: /^Reset sample/ })).toBeDisabled();
  });

  test('resets from the Help menu and keeps the writer on the editor', async ({ page }) => {
    await start(page);
    await showSource(page);
    await editor(page).click();
    await page.keyboard.insertText('ZZ');
    await expect.poll(() => text(page)).toContain('ZZ');
    await mark(page).click();
    await menu(page)
      .getByRole('menuitem', { name: /^Reset sample/ })
      .click();
    await expect.poll(() => text(page)).not.toContain('ZZ');
    await expect(editor(page)).toBeFocused();
  });
});

test.describe('a returning visit', () => {
  test('opens the most recent script, with no sample bar unless it is a sample', async ({
    page,
  }) => {
    await start(page);
    await expect(bar(page)).toBeVisible();

    // The sample is the most recent script: it opens again, with its bar.
    await page.reload();
    await showSource(page);
    await expect(editor(page)).toContainText('The Call');
    await expect(bar(page)).toBeVisible();

    // A script of the writer's own: no bar.
    await barButtons(page).first().click();
    await expect.poll(() => text(page)).toContain('Title: Untitled Screenplay');
    await page.reload();
    await showSource(page);
    await expect(editor(page)).toContainText('Title: Untitled Screenplay');
    await expect(bar(page)).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
