import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { removePickers } from './fs-stub';
import { showView } from './modules';

// A first visit (Phase 1 design §4): the screenplay sample, with the cursor on its first scene
// heading and a bar offering the writer's own start. The welcome dialog is Task 6's; the
// accessibility check of a first visit is in a11y.spec.ts, and the sample bar's keyboard use is
// tested here.

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
/** The sample chip in the top bar (a wide screen), whose menu is the sample bar of old. */
const chip = (page: Page) =>
  page.getByRole('banner').getByRole('button', { name: 'Sample: start your own' });
const chipItems = (page: Page) => page.getByRole('menu').getByRole('menuitem');
/** Where a sample offers the ways to start one's own: the chip, or a phone's sample bar. */
const sample = (page: Page) => chip(page).or(bar(page));
const palette = (page: Page) => page.getByRole('dialog', { name: 'Command palette' });
const script = (page: Page) => page.getByRole('region', { name: 'Script' });
const mark = (page: Page) => page.getByRole('button', { name: 'Drafter menu' });
const menu = (page: Page) => page.getByRole('menu', { name: 'Drafter menu' });
// Help is its own menu in the top bar (fresh-look Task 3b).
const helpButton = (page: Page) => page.getByRole('banner').getByRole('button', { name: 'Help' });
const helpMenu = (page: Page) => page.getByRole('menu', { name: 'Help' });
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
  if (!(await editor(page).isVisible())) await showView(page, 'Source');
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

    // Ctrl+Home goes back to the very top: the title page. (The status bar no longer says which
    // page the cursor is on; the Script's header does, fresh-look Task 6.)
    await page.keyboard.press('ControlOrMeta+Home');
    await expect(page.locator('.cm-line', { hasText: 'Title: The Call' })).toBeInViewport();
  });

  test('offers new scripts and Open from the sample chip, or a phone’s sample bar', async ({
    page,
  }) => {
    // Browsers without a picker read a file through an input, which every browser can do here.
    await removePickers(page);
    await start(page);

    // It is above the panes, so it is there whichever tab is showing.
    await expect(sample(page)).toBeVisible();
    if (wide(page)) {
      // No bar: the top bar's chip, whose menu is the document types' New, in their order, then Open.
      await expect(bar(page)).toHaveCount(0);
      await chip(page).click();
      await expect(chipItems(page)).toHaveText([
        'New screenplay',
        'New stage play',
        'New Markdown document',
        'Open a file…',
      ]);
      await chipItems(page).nth(1).click();
    } else {
      // A phone: one row, "Sample", the first button, and a menu with the rest.
      await expect(bar(page)).not.toContainText('Start your own');
      await expect(barButtons(page)).toHaveText(['New screenplay', 'More']);
      await barButtons(page).last().click();
      const items = page.getByRole('menu').getByRole('menuitem');
      await expect(items).toHaveText(['New stage play', 'New Markdown document', 'Open a file…']);
      await items.first().click();
    }
    // The new script first: while the menu closes, the page behind it is hidden from the
    // accessibility tree (the bar is "gone" to a role query though it is still there), so the bar
    // alone doesn't say the new script has come, and a tap on the Source tab then would take focus
    // from the editor.
    await expect.poll(() => text(page)).toContain('Title: Untitled Play');
    await expect(sample(page)).toHaveCount(0);
    await showSource(page);
    await expect(editor(page)).toBeFocused();
    // The sample stays where it was, and the new play is a script of the writer's own.
    expect((await stored(page)).filter((p) => !p.sample)).toHaveLength(1);

    // From the sample again: Open a file… reads a file as a script of its own.
    await page.getByRole('button', { name: 'Drafter menu' }).click();
    await menu(page)
      .getByRole('menuitem', { name: /^Open sample: Screenplay/ })
      .click();
    await expect(sample(page)).toBeVisible();
    const chooser = page.waitForEvent('filechooser');
    if (wide(page)) {
      await chip(page).click();
      await page.getByRole('menuitem', { name: 'Open a file…' }).click();
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
    await expect(sample(page)).toHaveCount(0);
  });

  test('shows a new script’s editor in the same step that replaces the sample', async ({
    page,
  }) => {
    // The sample's chip (or bar) going away and the editor appearing are one change to the page.
    // Between two changes a quick tap on the Source tab lands in the gap, and the tab then keeps
    // the focus that the new script put in the editor (a phone shows one tab at a time).
    await removePickers(page);
    await start(page);
    await expect(sample(page)).toBeVisible();
    await page.evaluate(() => {
      const seen: string[] = [];
      (window as unknown as { __states: string[] }).__states = seen;
      new MutationObserver(() => {
        const barShown = !!document.querySelector(
          'section[aria-label="Sample"], [aria-label="Sample: start your own"]',
        );
        const editorShown = !document.querySelector('.cm-content')?.closest('[data-editor-holder]');
        if (!barShown && !editorShown)
          seen.push('the sample is gone and the editor is not showing');
      }).observe(document, {
        subtree: true,
        childList: true,
        attributes: true,
      });
    });
    if (wide(page)) {
      await chip(page).click();
      await page.getByRole('menuitem', { name: 'New stage play' }).click();
    } else {
      await barButtons(page).last().click();
      await page.getByRole('menuitem', { name: 'New stage play' }).click();
    }
    await expect(sample(page)).toHaveCount(0);
    await expect(editor(page)).toBeFocused();
    expect(
      await page.evaluate(() => (window as unknown as { __states: string[] }).__states),
    ).toEqual([]);
  });

  test('leaves the cursor in the editor after New from the app menu and the Scripts menu', async ({
    page,
  }) => {
    await removePickers(page);
    await start(page);
    // The app menu, then the toolbar's Open menu: on a phone each is chosen with another tab
    // showing, and the editor takes the focus when the new script appears.
    await mark(page).click();
    await menu(page)
      .getByRole('menuitem', { name: /^New stage play/ })
      .click();
    await expect.poll(() => text(page)).toContain('Title: Untitled Play');
    await expect(editor(page)).toBeFocused();
    if (!wide(page)) await page.getByRole('tab', { name: 'Script' }).first().click();
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await page
      .getByRole('group', { name: 'Scripts', exact: true })
      .getByRole('button', { name: 'New screenplay' })
      .click();
    await expect.poll(() => text(page)).toContain('Title: Untitled Screenplay');
    await expect(editor(page)).toBeFocused();
  });

  test('shows the sample chip (or bar) on every tab', async ({ page }) => {
    await start(page);
    await expect(sample(page)).toBeVisible();
    for (const name of ['Source', 'Script', 'Problems']) {
      await showView(page, name);
      await expect(sample(page)).toBeVisible();
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

  test('reaches the sample chip’s menu from the keyboard', async ({ page, browserName }) => {
    test.skip(!wide(page), 'a phone has no keyboard');
    await start(page);
    // In the top bar's order, the chip follows the Drafter menu. (Safari leaves buttons out of the
    // Tab order unless the user asks for it, so the chip is focused directly there.)
    if (browserName === 'webkit') await chip(page).focus();
    else {
      await page.getByRole('button', { name: 'Drafter menu' }).focus();
      await page.keyboard.press('Tab');
    }
    await expect(chip(page)).toBeFocused();
    // Enter opens the menu on its first item; the arrows move through it, in order.
    await page.keyboard.press('Enter');
    const reached: string[] = [];
    for (let i = 0; i < 4; i++) {
      if (i > 0) await page.keyboard.press('ArrowDown');
      reached.push(await page.evaluate(() => document.activeElement?.textContent?.trim() ?? ''));
    }
    expect(reached).toEqual([
      'New screenplay',
      'New stage play',
      'New Markdown document',
      'Open a file…',
    ]);
    // Enter chooses the focused one.
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await expect.poll(() => text(page)).toContain('Title: Untitled Play');
    await expect(chip(page)).toHaveCount(0);
    await expect(editor(page)).toBeFocused();
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
    await helpButton(page).click();
    await expect(helpMenu(page)).toBeVisible();
    const reset = helpMenu(page).getByRole('menuitem', { name: /^Reset sample/ });
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
    await helpButton(page).click();
    await expect(helpMenu(page).getByRole('menuitem', { name: /^Reset sample/ })).toBeDisabled();
  });

  test('resets from the Help menu and keeps the writer on the editor', async ({ page }) => {
    await start(page);
    await showSource(page);
    await editor(page).click();
    await page.keyboard.insertText('ZZ');
    await expect.poll(() => text(page)).toContain('ZZ');
    await helpButton(page).click();
    await helpMenu(page)
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
    await expect(sample(page)).toBeVisible();

    // The sample is the most recent script: it opens again, with its chip (or bar).
    await page.reload();
    await showSource(page);
    await expect(editor(page)).toContainText('The Call');
    await expect(sample(page)).toBeVisible();

    // A script of the writer's own: no chip or bar.
    if (wide(page)) {
      await chip(page).click();
      await chipItems(page).first().click();
    } else await barButtons(page).first().click();
    await expect.poll(() => text(page)).toContain('Title: Untitled Screenplay');
    await page.reload();
    await showSource(page);
    await expect(editor(page)).toContainText('Title: Untitled Screenplay');
    await expect(sample(page)).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

// The "may be cleared" toast on a first visit at a phone's size (fresh-look design §3.5): the
// welcome sits above it, and it leaves the bottom row (the status bar) to be tapped.
test.describe('a first visit on a phone, with the storage toast', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('the welcome sits above the toast, and the bottom row stays clickable', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'storage', {
        configurable: true,
        value: { persisted: async () => false, persist: async () => false },
      });
    });
    await page.goto('/');
    const welcome = page.getByRole('alertdialog', { name: 'Welcome to Drafter' });
    const toast = page.locator('[data-warning="not-persistent"]');
    await expect(welcome).toBeVisible();
    await expect(toast).toBeVisible();
    // Where the toast is, the welcome (or its backdrop) is on top.
    const covered = await toast.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return !!top && !el.contains(top);
    });
    expect(covered).toBe(true);
    await page.keyboard.press('Escape');
    await expect(welcome).toBeHidden();
    await expect(toast).toBeVisible();
    // Every button in the status bar is the element at its own centre: nothing lies over it.
    const blocked = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-tour="status"] button'))
        .filter((b) => b.offsetParent !== null)
        .filter((b) => {
          const r = b.getBoundingClientRect();
          const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return !top || !b.contains(top);
        })
        .map((b) => b.textContent?.trim()),
    );
    expect(blocked).toEqual([]);
    // And the status bar's recovery item opens with a tap.
    await page.getByRole('button', { name: 'Recovery copy: may be cleared' }).click();
    await expect(page.locator('#recovery-why')).toBeVisible();
  });
});
