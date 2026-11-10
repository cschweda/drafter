import { expect, type Page, test } from '@playwright/test';
import { files, nextFileName, picks, removePickers, stubPickers } from './fs-stub';
import { pressToolbarButton } from './modules';

// The accessibility test for the open menu is in a11y.spec.ts; keyboard behavior is tested here.

const editor = (page: Page) => page.locator('.cm-content');
const mark = (page: Page) => page.getByRole('button', { name: 'Drafter menu' });
const menu = (page: Page) => page.getByRole('menu', { name: 'Drafter menu' });
const item = (page: Page, name: RegExp) => menu(page).getByRole('menuitem', { name });
const status = (page: Page) => page.locator('[data-tour="status"]');
const helpButton = (page: Page) => page.getByRole('banner').getByRole('button', { name: 'Help' });
const helpMenu = (page: Page) => page.getByRole('menu', { name: 'Help' });
const helpItem = (page: Page, name: RegExp) => helpMenu(page).getByRole('menuitem', { name });
const wide = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

/** A rotation's angle in degrees, from a computed `transform` (`none` or a matrix). */
const turned = (transform: string) => {
  const m = /^matrix\(([^,]+), ([^,]+)/.exec(transform);
  return m ? Math.round((Math.atan2(Number(m[2]), Number(m[1])) * 180) / Math.PI) : 0;
};

async function start(page: Page) {
  await page.goto('/');
  await expect(editor(page)).toContainText('The Call');
}

async function openMenu(page: Page) {
  await mark(page).click();
  await expect(menu(page)).toBeVisible();
}

/** The body of the text in the editor, even when a phone is showing another tab. */
const text = (page: Page) => editor(page).evaluate((el) => el.textContent ?? '');

test.describe('the app menu', () => {
  test('opens the app menu from the mark, with the keyboard too', async ({ page }) => {
    await start(page);
    await openMenu(page);

    // The script's own things (the fresh-eyes review, 2026-11-04): its template, its history and
    // drafts, its exports, Stats, and Settings. Starting, opening, and saving a script are the
    // toolbar's File menu and Save's arrow, which this menu no longer repeats.
    const names = await menu(page).getByRole('menuitem').allTextContents();
    const shown = names.map((n) => n.trim());
    const at = (label: string) => shown.findIndex((n) => n.startsWith(label));
    for (const label of ['History…', 'Start new draft…', 'Export as PDF', 'Settings…']) {
      expect(at(label), label).toBeGreaterThanOrEqual(0);
    }
    expect(at('History…')).toBeLessThan(at('Export as PDF'));
    // A Fountain script exports as Markdown too (the whole script), with the same command a
    // Markdown document's own text uses.
    expect(at('Export as Markdown file')).toBeGreaterThan(at('Export as PDF'));
    expect(at('Export as plain text')).toBeLessThan(at('Settings…'));
    for (const gone of ['New screenplay', 'Open…', 'Open sample:', 'Save', 'Revert to Saved']) {
      expect(at(gone), gone).toBe(-1);
    }
    await expect(menu(page).getByText('Recent scripts')).toHaveCount(0);

    // Escape closes it and returns focus to the mark.
    await page.keyboard.press('Escape');
    await expect(menu(page)).toBeHidden();
    await expect(mark(page)).toBeFocused();
  });

  test('opens and works from the keyboard alone', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'a phone has no keyboard');
    await start(page);
    await mark(page).focus();
    await page.keyboard.press('Enter');
    await expect(menu(page)).toBeVisible();
    // The first item has focus (the template section's, Screenplay, the one checked); the arrows
    // move through the items.
    const first = menu(page).locator('[role^="menuitem"]').first();
    const second = menu(page).locator('[role^="menuitem"]').nth(1);
    await expect(first).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(second).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(first).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu(page)).toBeHidden();
    await expect(mark(page)).toBeFocused();

    // ArrowDown opens it too, and Enter chooses an item: Settings….
    await page.keyboard.press('ArrowDown');
    await expect(menu(page)).toBeVisible();
    await page.keyboard.press('End');
    // Help has its own menu now (fresh-look Task 3b): the last item is Settings…, after Show stats.
    await expect(item(page, /^Settings…/)).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(item(page, /^Show stats/)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(item(page, /^Settings…/)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
    await expect(menu(page)).toBeHidden();
  });

  test('runs each item’s command', async ({ page }) => {
    await start(page);

    // Settings… opens the settings dialog.
    await openMenu(page);
    await item(page, /^Settings…/).click();
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await expect(settings).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(settings).toBeHidden();

    // History… opens History.
    await openMenu(page);
    await item(page, /^History…/).click();
    await expect(page.getByRole('dialog', { name: /History/ })).toBeVisible();
  });
});

test.describe('the File menu', () => {
  const fileButton = (page: Page) => page.getByRole('button', { name: 'File', exact: true });
  const scripts = (page: Page) => page.getByRole('group', { name: 'Scripts', exact: true });
  async function choose(page: Page, name: string | RegExp) {
    await fileButton(page).click();
    await scripts(page)
      .getByRole('button', { name, exact: typeof name === 'string' })
      .click();
  }

  test('starts, opens, and saves scripts: New, the guided starters, Open, Save As, and the samples', async ({
    page,
  }) => {
    await start(page);
    await fileButton(page).click();
    const names = (await scripts(page).locator(':scope > button').allTextContents()).map((n) =>
      n.trim(),
    );
    expect(names).toEqual([
      'New screenplay',
      'New stage play',
      'New novel',
      'New Markdown document',
      'New guided screenplay',
      'New guided stage play',
      'Open a file…',
      'Open as screenplay…',
      'Save As…',
      'Revert to Saved',
    ]);
    // A sample has no saved file to go back to.
    await expect(scripts(page).getByRole('button', { name: 'Revert to Saved' })).toBeDisabled();
    await page.keyboard.press('Escape');

    // A sample, and the New items, each make what they say.
    await choose(page, 'Stage play');
    await expect.poll(() => text(page)).toContain('# Act One');
    await expect(status(page)).toContainText('Stage play');
    await choose(page, 'New Markdown document');
    await expect.poll(() => text(page)).toContain('# Untitled');
    await choose(page, 'New screenplay');
    await expect.poll(() => text(page)).toContain('Title: Untitled Screenplay');
    await choose(page, 'New stage play');
    await expect.poll(() => text(page)).toContain('Title: Untitled Play');
    // A command that shows a script leaves the cursor in the editor, ready to type.
    await expect(editor(page)).toBeFocused();

    // This browser's scripts are in it; choosing one opens it.
    await fileButton(page).click();
    await scripts(page)
      .getByRole('button', { name: /^Untitled Screenplay/ })
      .click();
    await expect.poll(() => text(page)).toContain('Title: Untitled Screenplay');
  });
});

test.describe("Save's arrow", () => {
  const saveOptions = (page: Page) => page.getByRole('button', { name: 'Save options' });
  const saveMenu = (page: Page) => page.getByRole('menu', { name: 'Save options' });

  test('holds Save, Save As…, Revert to Saved, and History…, with their keys', async ({ page }) => {
    test.skip(!wide(page), 'a phone folds Save, and its arrow, into More actions');
    await start(page);
    await saveOptions(page).click();
    await expect(saveMenu(page).getByRole('menuitem')).toHaveText([
      /^Save(?! As)/,
      /^Save As…/,
      /^Revert to Saved/,
      /^History…/,
    ]);
    await expect(saveMenu(page).getByRole('menuitem', { name: /^Save As…/ })).toContainText(
      /Shift\+S|⇧S/,
    );
    // A sample has no saved file to go back to: Revert to Saved is off, and Save As isn't.
    await expect(
      saveMenu(page).getByRole('menuitem', { name: /^Revert to Saved/ }),
    ).toHaveAttribute('aria-disabled', 'true');
    await expect(saveMenu(page).getByRole('menuitem', { name: /^Save As…/ })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await page.keyboard.press('Escape');
    await expect(saveMenu(page)).toBeHidden();
    await expect(saveOptions(page)).toBeFocused();
  });

  test('Save and Save As… ask where, through the same commands the keys run', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'only Chromium saves in place');
    test.skip(!wide(page), 'a phone folds Save, and its arrow, into More actions');
    await stubPickers(page);
    await start(page);
    await nextFileName(page, 'from-menu.fountain');
    await saveOptions(page).click();
    await saveMenu(page)
      .getByRole('menuitem', { name: /^Save(?! As)/ })
      .click();
    await expect.poll(async () => await files(page)).toContain('from-menu.fountain');
    await nextFileName(page, 'again.fountain');
    await saveOptions(page).click();
    await saveMenu(page)
      .getByRole('menuitem', { name: /^Save As…/ })
      .click();
    await expect
      .poll(async () => await picks(page))
      .toEqual(['from-menu.fountain', 'again.fountain']);
  });
});

test.describe('the app menu: exports, and the rest', () => {
  test('exports with the same commands the toolbar’s Export menu runs', async ({ page }) => {
    await removePickers(page);
    await start(page);
    await openMenu(page);
    const download = page.waitForEvent('download');
    await item(page, /^Export as plain text/).click();
    expect((await download).suggestedFilename()).toBe('The Call.txt');
    await expect(page.locator('.toast [role="status"]')).toHaveText('Exported The Call.txt.');

    // The toolbar's menu runs the same commands: its PDF is the palette's and the menu's.
    // On a phone the mode switch keeps its place in the top bar, so Export may fold into More
    // actions, where it's a submenu of the same commands.
    await pressToolbarButton(page, 'Export', { focus: true });
    const folded = await page.evaluate(
      () => document.activeElement?.getAttribute('role') === 'menuitem',
    );
    const pdf = page.waitForEvent('download');
    if (folded) {
      await page.keyboard.press('ArrowRight');
      await page.getByRole('menuitem', { name: /PDF/ }).first().click();
    } else {
      await page.keyboard.press('Enter');
      await page
        .getByRole('group', { name: 'Export' })
        .getByRole('button', { name: 'PDF', exact: true })
        .click();
    }
    expect((await pdf).suggestedFilename()).toBe('The Call.pdf');
  });

  test('lists the export commands in the palette', async ({ page }) => {
    await start(page);
    await page.keyboard.press('ControlOrMeta+k');
    const palette = page.getByRole('dialog', { name: 'Command palette' });
    await palette.locator('input').fill('Export as');
    await expect(palette.getByRole('option', { name: /^Export as PDF/ })).toBeVisible();
    await expect(palette.getByRole('option', { name: /^Export as plain text/ })).toBeVisible();
    await expect(palette.getByRole('option', { name: /^Export as Markdown file/ })).toBeVisible();
  });

  test('offers a Markdown document the PDF, the HTML page, the Markdown file, and plain text', async ({
    page,
  }) => {
    await start(page);
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page
      .getByRole('group', { name: 'Scripts', exact: true })
      .getByRole('button', { name: 'New Markdown document' })
      .click();
    await expect.poll(() => text(page)).toContain('# Untitled');
    await openMenu(page);
    // The PDF first, as for a script.
    const exports = page.getByRole('menuitem', { name: /^Export as/ });
    await expect(exports).toHaveText([
      /^Export as PDF/,
      /^Export as HTML/,
      /^Export as EPUB/,
      /^Export as Markdown/,
      /^Export as plain text/,
    ]);
    await expect(item(page, /^Export as PDF/)).not.toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Escape');
    // The palette shows Export as PDF in one too.
    await page.keyboard.press('ControlOrMeta+k');
    const palette = page.getByRole('dialog', { name: 'Command palette' });
    await palette.locator('input').fill('Export as');
    await expect(palette.getByRole('option', { name: /^Export as PDF/ })).toBeVisible();
    await expect(palette.getByRole('option', { name: /^Export as Markdown/ })).toBeVisible();
    await expect(palette.getByRole('option', { name: /^Export as Final Draft/ })).toHaveCount(0);
  });

  test('keeps a sample’s exports on (Revert to Saved, off for a sample, is on Save’s arrow)', async ({
    page,
  }) => {
    await start(page);
    await openMenu(page);
    await expect(item(page, /^Export as PDF/)).not.toHaveAttribute('aria-disabled', 'true');
    await expect(item(page, /^Export options…/)).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('has no Help section: Help is its own menu', async ({ page }) => {
    await start(page);
    await openMenu(page);
    await expect(menu(page).getByText('Help', { exact: true })).toHaveCount(0);
    for (const name of [
      /^Take the tour/,
      /^Keyboard shortcuts/,
      /^Fountain cheat sheet/,
      /^Sample scripts/,
      /^Reset sample/,
      /^Report a problem…/,
      /^Suggest an idea…/,
      /^Check for updates…/,
      /^About Drafter/,
    ]) {
      await expect(item(page, name), String(name)).toHaveCount(0);
    }
  });

  test('shows it is a menu: a 14px chevron in the text colour, turned while open', async ({
    page,
  }) => {
    await start(page);
    await expect(mark(page)).toHaveAttribute('aria-haspopup', 'menu');
    await expect(mark(page)).toHaveAttribute('aria-expanded', 'false');
    const caret = mark(page).locator('.caret');
    await expect(caret).toBeVisible();
    const box = await caret.boundingBox();
    expect(Math.round(box?.width ?? 0)).toBe(14);
    expect(Math.round(box?.height ?? 0)).toBe(14);
    const text = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--text)';
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    });
    await expect(caret).toHaveCSS('color', text);
    expect(turned(await caret.evaluate((el) => getComputedStyle(el).transform))).toBe(0);
    await openMenu(page);
    await expect(mark(page)).toHaveAttribute('aria-expanded', 'true');
    await expect
      .poll(async () => turned(await caret.evaluate((el) => getComputedStyle(el).transform)))
      .toBe(180);
  });

  test('turns the chevron without motion when motion is reduced', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await start(page);
    const caret = mark(page).locator('.caret');
    const duration = await caret.evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(duration.split(',').every((d) => Number.parseFloat(d) === 0)).toBe(true);
  });
});

test.describe('the Help menu', () => {
  test('is always in the top bar, as a menu button named Help', async ({ page }) => {
    await start(page);
    await expect(helpButton(page)).toBeVisible();
    await expect(helpButton(page)).toHaveAttribute('aria-haspopup', 'menu');
    await expect(helpButton(page)).toHaveAttribute('aria-expanded', 'false');
    if (wide(page)) {
      // A text button with the same chevron as the Drafter menu's.
      await expect(helpButton(page)).toContainText('Help');
      await expect(helpButton(page).locator('.caret')).toBeVisible();
    } else {
      // A phone has the icon alone: a question mark, still named Help.
      await expect(helpButton(page).locator('.bar-menu-icon')).toBeVisible();
    }
    const box = await helpButton(page).boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(24);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(24);
  });

  test('holds the tour, the help pages, Download, and the samples, in order', async ({ page }) => {
    await start(page);
    await helpButton(page).click();
    await expect(helpMenu(page)).toBeVisible();
    await expect(helpButton(page)).toHaveAttribute('aria-expanded', 'true');
    const names = (await helpMenu(page).getByRole('menuitem').allTextContents()).map((n) =>
      n.trim(),
    );
    const expected = [
      /^Take the tour/,
      /^What is Drafter\?/,
      /^Why Drafter/,
      /^Fountain cheat sheet/,
      /^Classic Mode/,
      /^Novel/,
      /^Production/,
      /^Saving and your browser/,
      /^Drafts and cuts/,
      /^Story map/,
      /^Drafter for Claude/,
      /^Self-hosting/,
      /^Keyboard shortcuts/,
      /^Open formats/,
      /^Download the desktop app/,
      /^Sample scripts/,
      /^Reset sample/,
    ];
    expect(names).toHaveLength(expected.length);
    for (const [i, name] of expected.entries()) expect(names[i], String(name)).toMatch(name);
    await page.keyboard.press('Escape');
    await expect(helpMenu(page)).toBeHidden();
    await expect(helpButton(page)).toBeFocused();
  });

  test('works from the keyboard, and Tab closes it and gives focus back', async ({
    page,
    isMobile,
  }) => {
    test.skip(!!isMobile, 'a phone has no keyboard');
    await start(page);
    await helpButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(helpItem(page, /^Take the tour/)).toBeFocused();
    await page.keyboard.press('End');
    await expect(helpItem(page, /^Reset sample/)).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(helpItem(page, /^Sample scripts/)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(helpMenu(page)).toBeHidden();
    await expect(helpButton(page)).toBeFocused();
  });

  test('turns its chevron while open, as the Drafter menu does', async ({ page }) => {
    test.skip(!wide(page), 'a phone shows the icon alone');
    await start(page);
    const caret = helpButton(page).locator('.caret');
    const box = await caret.boundingBox();
    expect(Math.round(box?.width ?? 0)).toBe(14);
    await helpButton(page).click();
    await expect
      .poll(async () => turned(await caret.evaluate((el) => getComputedStyle(el).transform)))
      .toBe(180);
  });
});

// About, beside Help (2026-11-09): Drafter itself, and the reports.
const aboutButton = (page: Page) => page.getByRole('banner').getByRole('button', { name: 'About' });
const aboutMenu = (page: Page) => page.getByRole('menu', { name: 'About' });

test.describe('the About menu', () => {
  test('holds About Drafter, the About pages, the reports, and Check for updates, in order', async ({
    page,
  }) => {
    test.skip(!wide(page), 'a phone folds About into More actions');
    await start(page);
    await aboutButton(page).click();
    await expect(aboutMenu(page)).toBeVisible();
    const names = (await aboutMenu(page).getByRole('menuitem').allTextContents()).map((n) =>
      n.trim(),
    );
    const expected = [
      /^About Drafter/,
      /^What’s new/,
      /^Privacy/,
      /^Third-party licences/,
      /^Technical details/,
      /^Report a problem…/,
      /^Suggest an idea…/,
      /^Copy technical details/,
      /^Check for updates…/,
    ];
    expect(names).toHaveLength(expected.length);
    for (const [i, name] of expected.entries()) expect(names[i], String(name)).toMatch(name);
    await page.keyboard.press('Escape');
    await expect(aboutMenu(page)).toBeHidden();
    await expect(aboutButton(page)).toBeFocused();
  });

  test('opens About Drafter from the keyboard', async ({ page, isMobile }) => {
    test.skip(!!isMobile || !wide(page), 'a phone has no keyboard, and folds About');
    await start(page);
    await aboutButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(aboutMenu(page).getByRole('menuitem', { name: /^About Drafter/ })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Drafter', exact: true })).toBeVisible();
  });
});
