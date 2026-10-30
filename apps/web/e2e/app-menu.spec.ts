import { expect, type Page, test } from '@playwright/test';
import { files, nextFileName, picks, removePickers, stubPickers } from './fs-stub';

// The accessibility test for the open menu is in a11y.spec.ts; keyboard behavior is tested here.

const editor = (page: Page) => page.locator('.cm-content');
const mark = (page: Page) => page.getByRole('button', { name: 'Drafter menu' });
const menu = (page: Page) => page.getByRole('menu', { name: 'Drafter menu' });
const item = (page: Page, name: RegExp) => menu(page).getByRole('menuitem', { name });
const status = (page: Page) => page.locator('[data-tour="status"]');

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

    // The New items are the document types, in the Scripts menu's order, then the guided starters;
    // then the rest.
    const names = await menu(page).getByRole('menuitem').allTextContents();
    const shown = names.map((n) => n.trim());
    const at = (label: string) => shown.findIndex((n) => n.startsWith(label));
    expect(at('New screenplay')).toBe(0);
    expect(at('New stage play')).toBe(1);
    expect(at('New Markdown document')).toBe(2);
    expect(at('New guided screenplay')).toBe(3);
    expect(at('New guided stage play')).toBe(4);
    expect(at('Open…')).toBe(5);
    for (const label of [
      'Save',
      'Save As…',
      'Revert to Saved',
      'Export as PDF',
      'Export as plain text',
      'Settings…',
    ]) {
      expect(at(label), label).toBeGreaterThan(5);
    }
    // A Fountain script exports as PDF or text; the Markdown file is a Markdown document's.
    expect(at('Export as Markdown')).toBe(-1);
    expect(at('Save')).toBeLessThan(at('Save As…'));
    expect(at('Save')).toBe(shown.findIndex((n) => /^Save(?! As)/.test(n)));
    expect(at('Save As…')).toBeLessThan(at('Revert to Saved'));
    expect(at('Revert to Saved')).toBeLessThan(at('Export as PDF'));
    expect(at('Export as plain text')).toBeLessThan(at('Settings…'));

    // The samples are in it, and so are the keys.
    await expect(item(page, /^Open sample: Screenplay/)).toBeVisible();
    await expect(item(page, /^Open sample: Stage play/)).toBeVisible();
    await expect(item(page, /^Save As…/)).toContainText(/Shift\+S|⇧S/);

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
    // The first item has focus; the arrows move through the items.
    await expect(item(page, /^New screenplay/)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(item(page, /^New stage play/)).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(item(page, /^New screenplay/)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu(page)).toBeHidden();
    await expect(mark(page)).toBeFocused();

    // ArrowDown opens it too, and Enter chooses an item: Settings….
    await page.keyboard.press('ArrowDown');
    await expect(menu(page)).toBeVisible();
    await page.keyboard.press('End');
    // The last item is Help's About Drafter; above it Check for updates…, Reset sample (a sample is
    // open), the Sample scripts submenu, the six help pages, then Take the tour, and above that
    // Settings….
    await expect(item(page, /^About Drafter/)).toBeFocused();
    for (const name of [
      /^Check for updates…/,
      /^Reset sample/,
      /^Sample scripts/,
      /^Technical details/,
      /^Third-party licences/,
      /^Privacy/,
      /^Keyboard shortcuts/,
      /^Saving and your browser/,
      /^Fountain cheat sheet/,
    ]) {
      await page.keyboard.press('ArrowUp');
      await expect(item(page, name)).toBeFocused();
    }
    await page.keyboard.press('ArrowUp');
    await expect(item(page, /^Take the tour/)).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(item(page, /^Settings…/)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
    await expect(menu(page)).toBeHidden();
  });

  test('runs each item’s command', async ({ page, browserName }) => {
    await start(page);

    // Settings… opens the settings dialog.
    await openMenu(page);
    await item(page, /^Settings…/).click();
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await expect(settings).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(settings).toBeHidden();

    // A sample.
    await openMenu(page);
    await item(page, /^Open sample: Stage play/).click();
    await expect.poll(() => text(page)).toContain('# Act One');
    await expect(status(page)).toContainText('Stage play');

    // New stage play and New Markdown document make a script of their kind.
    await openMenu(page);
    await item(page, /^New Markdown document/).click();
    await expect.poll(() => text(page)).toContain('# Untitled');
    await openMenu(page);
    await item(page, /^New screenplay/).click();
    await expect.poll(() => text(page)).toContain('Title: Untitled Screenplay');
    await openMenu(page);
    await item(page, /^New stage play/).click();
    await expect.poll(() => text(page)).toContain('Title: Untitled Play');
    // A command that shows a script leaves the cursor in the editor, ready to type.
    await expect(editor(page)).toBeFocused();

    // The recent scripts are in it, newest first; choosing one opens it.
    await openMenu(page);
    await expect(menu(page).getByText('Recent scripts')).toBeVisible();
    await item(page, /^Untitled Screenplay/).click();
    await expect.poll(() => text(page)).toContain('Title: Untitled Screenplay');

    // Save and Save As… ask where, through the same commands the keys run.
    if (browserName === 'chromium') {
      await stubPickers(page);
      await page.reload();
      await expect(editor(page)).toContainText('Title: Untitled');
      await nextFileName(page, 'from-menu.fountain');
      await openMenu(page);
      await item(page, /^Save(?! As)/).click();
      await expect.poll(async () => await files(page)).toContain('from-menu.fountain');
      // Save leaves nothing else to do: focus is back on the mark.
      await expect(mark(page)).toBeFocused();
      await nextFileName(page, 'again.fountain');
      await openMenu(page);
      await item(page, /^Save As…/).click();
      await expect
        .poll(async () => await picks(page))
        .toEqual(['from-menu.fountain', 'again.fountain']);
    }
  });

  test('exports with the same commands the toolbar’s Export menu runs', async ({ page }) => {
    await removePickers(page);
    await start(page);
    await openMenu(page);
    const download = page.waitForEvent('download');
    await item(page, /^Export as plain text/).click();
    expect((await download).suggestedFilename()).toBe('The Call.txt');
    await expect(page.locator('.toast [role="status"]')).toHaveText('Exported The Call.txt.');

    // The toolbar's menu runs the same commands: its PDF is the palette's and the menu's.
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const pdf = page.waitForEvent('download');
    await page.getByRole('group', { name: 'Export' }).getByRole('button', { name: 'PDF' }).click();
    expect((await pdf).suggestedFilename()).toBe('The Call.pdf');
  });

  test('lists the export commands in the palette', async ({ page }) => {
    await start(page);
    await page.keyboard.press('ControlOrMeta+k');
    const palette = page.getByRole('dialog', { name: 'Command palette' });
    await palette.locator('input').fill('Export as');
    await expect(palette.getByRole('option', { name: /^Export as PDF/ })).toBeVisible();
    await expect(palette.getByRole('option', { name: /^Export as plain text/ })).toBeVisible();
    await expect(palette.getByRole('option', { name: /^Export as Markdown/ })).toHaveCount(0);
  });

  test('offers a Markdown document the PDF, the Markdown file, and plain text', async ({
    page,
  }) => {
    await start(page);
    await openMenu(page);
    await item(page, /^New Markdown document/).click();
    await expect.poll(() => text(page)).toContain('# Untitled');
    await openMenu(page);
    // The PDF first, as for a script.
    const exports = page.getByRole('menuitem', { name: /^Export as/ });
    await expect(exports).toHaveText([
      /^Export as PDF/,
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

  test('shows an item disabled when its command is off', async ({ page }) => {
    await start(page);
    // A sample has no saved file to go back to.
    await openMenu(page);
    await expect(item(page, /^Revert to Saved/)).toHaveAttribute('aria-disabled', 'true');
    await expect(item(page, /^New screenplay/)).not.toHaveAttribute('aria-disabled', 'true');
  });
});
