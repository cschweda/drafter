import { expect, type Page, test } from '@playwright/test';
import { failWrites, nextFileName, putFile, stubPickers } from './fs-stub';
import { showSource } from './modules';

const editor = (page: Page) => page.locator('.cm-content');
const focusButton = (page: Page) => page.getByRole('button', { name: 'Focus', exact: true });
const toolbar = (page: Page) => page.getByRole('banner');
const marker = (page: Page) => page.getByRole('group', { name: 'Focus mode' });
const leaveButton = (page: Page) => page.getByRole('button', { name: 'Leave focus mode' });
const state = (page: Page) => page.locator('[data-focus-state]');
const layout = (page: Page) => page.locator('[data-focus-layout]');
const palette = (page: Page) => page.getByRole('dialog', { name: 'Command palette' });

/** Replaces the text with `text`, typed in one go. */
async function setText(page: Page, text: string) {
  await showSource(page);
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(text);
}

async function start(page: Page) {
  await page.goto('/');
  await expect(focusButton(page)).toBeVisible();
  await expect(editor(page)).toBeAttached();
}

const on = (page: Page) => expect(marker(page)).toBeVisible();
const off = async (page: Page) => {
  await expect(marker(page)).toBeHidden();
  await expect(toolbar(page)).toBeVisible();
};

test.describe('focus mode', () => {
  test('enters and leaves focus mode from the toolbar, the shortcut, and Esc', async ({ page }) => {
    await start(page);

    // The toolbar's Focus button, left by Esc.
    await focusButton(page).click();
    await on(page);
    await expect(editor(page)).toBeVisible();
    await expect(editor(page)).toBeFocused();
    await page.keyboard.press('Escape');
    await off(page);

    // The shortcut enters, and the same shortcut leaves; it works with the editor focused.
    await showSource(page);
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+Shift+Enter');
    await on(page);
    await expect(editor(page)).toBeFocused();
    await page.keyboard.press('ControlOrMeta+Shift+Enter');
    await off(page);

    // The button enters, and the shortcut leaves.
    await focusButton(page).click();
    await on(page);
    await page.keyboard.press('ControlOrMeta+Shift+Enter');
    await off(page);

    // The command is in the palette, and the marker's button leaves (a phone has no Esc).
    await page.keyboard.press('ControlOrMeta+k');
    await palette(page).locator('input').fill('focus mode');
    await palette(page)
      .getByRole('option', { name: /Toggle focus mode/ })
      .click();
    await on(page);
    await expect(editor(page)).toBeFocused();
    await leaveButton(page).click();
    await off(page);
    // The Source was showing, so the cursor is back in it.
    await expect(editor(page)).toBeFocused();
  });

  test('puts focus back on the Focus button when the Source is not showing', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'a phone opens on the Script tab; a wide screen shows the Source');
    await start(page);
    await expect(editor(page)).toBeHidden();
    await focusButton(page).click();
    await on(page);
    await expect(editor(page)).toBeFocused();
    await page.keyboard.press('Escape');
    await off(page);
    await expect(editor(page)).toBeHidden();
    await expect(focusButton(page)).toBeFocused();
  });

  test('keeps what was typed', async ({ page }) => {
    await start(page);
    await setText(page, 'INT. ROOM - DAY\n\nA chair.');
    await page.keyboard.press('ControlOrMeta+Shift+Enter');
    await on(page);
    await page.keyboard.type(' It creaks.');
    // The shortcut leaves whatever CodeMirror's completion is doing; Esc is tried in its own tests.
    await page.keyboard.press('ControlOrMeta+Shift+Enter');
    await off(page);
    await expect(page.locator('.cm-content')).toContainText('A chair. It creaks.');
    // One editor: its history survived, and one Undo takes back the typing.
    await showSource(page);
    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.locator('.cm-content')).not.toContainText('It creaks.');
  });

  test('hides everything but the source and the marker', async ({ page }) => {
    await start(page);
    await expect(toolbar(page)).toBeVisible();
    await expect(page.locator('[data-tour="status"]')).toBeVisible();
    await focusButton(page).click();
    await on(page);

    await expect(toolbar(page)).toHaveCount(0);
    await expect(page.getByRole('tab')).toHaveCount(0);
    await expect(page.locator('[data-tour="status"]')).toHaveCount(0);
    await expect(page.locator('#panel-script')).toHaveCount(0);
    await expect(page.locator('#panel-problems')).toHaveCount(0);
    await expect(page.locator('.slim')).toHaveCount(0);
    await expect(page.getByRole('contentinfo')).toHaveCount(0);
    // The source is the one pane, and the editor is in it once.
    await expect(editor(page)).toHaveCount(1);
    await expect(editor(page)).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Source' })).toBeVisible();
    // It never asks for full screen.
    expect(await page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  });

  test('shows the source in a centered column 64 characters wide', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'a phone is narrower than the column');
    await start(page);
    await page.keyboard.press('ControlOrMeta+Shift+Enter');
    await on(page);
    const m = await page.locator('.cm-scroller').evaluate((scroller) => {
      const probe = document.createElement('div');
      probe.style.cssText = 'width:64ch;height:0;visibility:hidden;position:absolute';
      scroller.append(probe);
      const ch64 = probe.getBoundingClientRect().width;
      probe.remove();
      const outer = scroller.getBoundingClientRect();
      const text = (scroller.querySelector('.cm-content') as HTMLElement).getBoundingClientRect();
      return {
        ch64,
        width: text.width,
        left: text.left - outer.left,
        right: outer.right - text.right,
      };
    });
    // The lines carry 24px of padding; their text is 64 characters across.
    expect(Math.abs(m.width - (m.ch64 + 24))).toBeLessThanOrEqual(1);
    expect(Math.abs(m.left - m.right)).toBeLessThanOrEqual(1);
    expect(m.left).toBeGreaterThan(40);
  });

  test('closes completion before leaving focus mode', async ({ page }) => {
    await start(page);
    await setText(page, 'MARGARET\nHi.\n\n');
    await page.keyboard.press('ControlOrMeta+Shift+Enter');
    await on(page);
    await page.keyboard.type('MA');
    await expect(page.locator('.cm-tooltip-autocomplete')).toBeVisible();

    // The first Esc closes the list and stays; the second leaves.
    await page.keyboard.press('Escape');
    await expect(page.locator('.cm-tooltip-autocomplete')).toBeHidden();
    await on(page);
    await expect(editor(page)).toBeFocused();
    await page.keyboard.press('Escape');
    await off(page);
  });

  test('closes the search panel before leaving focus mode', async ({ page }) => {
    await start(page);
    await page.keyboard.press('ControlOrMeta+Shift+Enter');
    await on(page);
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+f');
    await expect(page.locator('.cm-search')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.cm-search')).toBeHidden();
    await on(page);
    await page.keyboard.press('Escape');
    await off(page);
  });

  test('leaves focus mode alone while the palette or a dialog is open', async ({ page }) => {
    await start(page);
    await page.keyboard.press('ControlOrMeta+Shift+Enter');
    await on(page);

    await page.keyboard.press('ControlOrMeta+k');
    await expect(palette(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(palette(page)).toBeHidden();
    await on(page);

    await page.keyboard.press('ControlOrMeta+,');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await on(page);

    // With both closed, Esc leaves.
    await editor(page).click();
    await page.keyboard.press('Escape');
    await off(page);
  });

  test('shows the save state in the corner', async ({ page }) => {
    await start(page);
    await page.keyboard.press('ControlOrMeta+Shift+Enter');
    await on(page);
    // A script with nothing changed.
    await expect(state(page)).toHaveText('Saved');
    await expect(page).not.toHaveTitle(/^• /);

    await page.keyboard.type('X');
    await expect(state(page)).toHaveText('Unsaved changes');
    // The tab title keeps its dot.
    await expect(page).toHaveTitle(/^• /);

    await page.keyboard.press('Backspace');
    await expect(state(page)).toHaveText('Saved');
    await expect(page).not.toHaveTitle(/^• /);
  });

  test('says Saved once the script is saved to a file, and Unsaved changes after more typing', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'the File System Access API');
    await stubPickers(page);
    await start(page);
    await page.keyboard.press('ControlOrMeta+Shift+Enter');
    await on(page);
    await page.keyboard.type('FADE IN:');
    await expect(state(page)).toHaveText('Unsaved changes');
    await nextFileName(page, 'focus.fountain');
    await page.keyboard.press('ControlOrMeta+s');
    await expect(state(page)).toHaveText('Saved');
    await expect(page).not.toHaveTitle(/^• /);
    await page.keyboard.type(' more');
    await expect(state(page)).toHaveText('Unsaved changes');
  });

  test('says a failed save in the corner, where the status bar would have', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'the File System Access API');
    await stubPickers(page);
    await start(page);
    await page.keyboard.press('ControlOrMeta+Shift+Enter');
    await on(page);
    await page.keyboard.type('KEEP');
    await failWrites(page);
    await page.keyboard.press('ControlOrMeta+s');
    await expect(marker(page).getByRole('alert')).toContainText('Drafter isn’t allowed');
    await expect(state(page)).toHaveText('Unsaved changes');
    await expect(editor(page)).toContainText('KEEP');
  });

  test('works in a Markdown document', async ({ page }) => {
    await start(page);
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    const menu = page.getByRole('group', { name: 'Scripts' });
    await menu.getByRole('button', { name: 'New Markdown document' }).click();
    await expect(menu).toBeHidden();
    await page.keyboard.press('ControlOrMeta+Shift+Enter');
    await on(page);
    await expect(editor(page)).toContainText('# Untitled');
    await expect(editor(page)).toBeFocused();
    await expect(state(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await off(page);
  });

  test('does not animate under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await start(page);
    await focusButton(page).click();
    await on(page);
    const calm = await layout(page).evaluate((el) => {
      const style = getComputedStyle(el);
      return { animation: style.animationName, transition: style.transitionDuration };
    });
    expect(calm.animation).toBe('none');
    expect(calm.transition.split(',').every((d) => Number.parseFloat(d) === 0)).toBe(true);

    // Without the preference, entering does animate (so the check above isn't vacuous).
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.keyboard.press('Escape');
    await off(page);
    await focusButton(page).click();
    await on(page);
    expect(await layout(page).evaluate((el) => getComputedStyle(el).animationName)).not.toBe(
      'none',
    );
  });
});

test.describe('what the corner keeps from the bars that are gone', () => {
  test('says the recovery copy is unavailable, as an alert', async ({ page }) => {
    await page.addInitScript(() => {
      indexedDB.open = () => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      };
    });
    await start(page);
    await expect(page.locator('[data-warning="unavailable"]')).toContainText('only in memory');
    await page.keyboard.press('ControlOrMeta+Shift+Enter');
    await on(page);
    await expect(page.locator('[data-warning="unavailable"]')).toHaveCount(0);
    await expect(marker(page).getByRole('alert')).toContainText('only in memory');
    // Leaving puts the bar back, and the corner's copy goes.
    await page.keyboard.press('Escape');
    await off(page);
    await expect(page.locator('[data-warning="unavailable"]')).toContainText('only in memory');
  });

  test('says a script’s file is gone', async ({ page, browserName, isMobile }) => {
    test.skip(browserName !== 'chromium' || !!isMobile, 'the File System Access API');
    await stubPickers(page);
    await start(page);
    await putFile(
      page,
      'The Call.fountain',
      'Title: The Call\n\nINT. KITCHEN - NIGHT\n\nA phone rings.\n',
    );
    await nextFileName(page, 'The Call.fountain');
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await page
      .getByRole('group', { name: 'Scripts' })
      .getByRole('button', { name: 'Open a file…' })
      .click();
    await expect(editor(page)).toContainText('A phone rings.');
    await page.keyboard.press('ControlOrMeta+Shift+Enter');
    await on(page);
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry('The Call.fountain');
    });
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(marker(page)).toContainText("Drafter can't find The Call.fountain");
  });

  test('says a changed file was loaded, as a status', async ({ page, browserName, isMobile }) => {
    test.skip(browserName !== 'chromium' || !!isMobile, 'the File System Access API');
    await stubPickers(page);
    await start(page);
    const v1 = 'Title: The Call\n\nINT. KITCHEN - NIGHT\n\nA phone rings.\n';
    await putFile(page, 'The Call.fountain', v1);
    await nextFileName(page, 'The Call.fountain');
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await page
      .getByRole('group', { name: 'Scripts' })
      .getByRole('button', { name: 'Open a file…' })
      .click();
    await expect(editor(page)).toContainText('A phone rings.');
    await page.keyboard.press('ControlOrMeta+Shift+Enter');
    await on(page);
    await putFile(page, 'The Call.fountain', `${v1}\nNobody answers.\n`);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(editor(page)).toContainText('Nobody answers.');
    // The bar that says so is not in the page: the corner does, and a screen reader hears it.
    await expect(marker(page).getByRole('status').filter({ hasText: 'Updated from' })).toHaveText(
      'Updated from The Call.fountain.',
    );
  });
});

test.describe('focus mode, keys and layouts', () => {
  test('keeps the cursor where it was when the layout changes', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'a phone has one layout');
    await page.setViewportSize({ width: 390, height: 800 });
    await start(page);
    await setText(page, 'hello world');
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');
    // Wider than the phone layout: the editor is parked and mounted again, with focus.
    await page.setViewportSize({ width: 1400, height: 800 });
    await expect(page.getByRole('tab', { name: 'Source' }).first()).toBeVisible();
    await expect(editor(page)).toBeFocused();
    await page.keyboard.type('X');
    await expect(editor(page)).toContainText('hello Xworld');
  });

  test('centers the cursor when it enters with typewriter scrolling on', async ({ page }) => {
    await start(page);
    await showSource(page);
    await page.getByRole('button', { name: 'Typewriter', exact: true }).click();
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Delete');
    for (let i = 1; i <= 80; i++) await page.keyboard.insertText(`Line ${i}\n`);
    for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowUp');
    // The pane is taller in focus mode (no toolbar or bars), so the middle is somewhere else.
    await page.keyboard.press('ControlOrMeta+Shift+Enter');
    await on(page);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const pane = document.querySelector('.cm-scroller')?.getBoundingClientRect();
          const mark = document.querySelector('.cm-cursor-primary')?.getBoundingClientRect();
          const line = document.querySelector('.cm-line')?.getBoundingClientRect();
          if (!pane || !mark || !line) return Number.POSITIVE_INFINITY;
          return Math.abs(mark.top + mark.height / 2 - (pane.top + pane.height / 2)) - line.height;
        }),
      )
      .toBeLessThanOrEqual(0);
  });

  test('the first Esc collapses a selection and the second leaves', async ({ page }) => {
    await start(page);
    await setText(page, 'A chair.');
    await page.keyboard.press('ControlOrMeta+Shift+Enter');
    await on(page);
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    expect(await page.evaluate(() => getSelection()?.toString())).toBe('r.');
    await page.keyboard.press('Escape');
    await on(page);
    expect(await page.evaluate(() => getSelection()?.toString())).toBe('');
    await page.keyboard.press('Escape');
    await off(page);
  });

  test('showing the Script leaves focus mode', async ({ page }) => {
    await start(page);
    await page.keyboard.press('ControlOrMeta+Shift+Enter');
    await on(page);
    await page.keyboard.press('ControlOrMeta+k');
    await palette(page).locator('input').fill('Show Script');
    await palette(page)
      .getByRole('option', { name: /Show Script/ })
      .click();
    await off(page);
    await expect(page.locator('#panel-script')).toBeVisible();
  });

  test('the shortcut does nothing while a dialog is open', async ({ page }) => {
    await start(page);
    await page.keyboard.press('ControlOrMeta+,');
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('ControlOrMeta+Shift+Enter');
    await expect(dialog).toBeVisible();
    await expect(marker(page)).toBeHidden();
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(dialog).toBeHidden();
    await page.keyboard.press('ControlOrMeta+Shift+Enter');
    await on(page);
  });
});
