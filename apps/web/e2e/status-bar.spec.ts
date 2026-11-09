import { expect, type Page, test } from '@playwright/test';
import { removePickers } from './fs-stub';
import { editor, problemsTab, runCommand, setText, showView, start } from './modules';

// The status bar (fresh-look design §3.4, Task 6): one quiet 24px row of borderless buttons. On the
// left the file's name (which opens History) and the recovery copy's warning when there is one; on
// the right pages · running time, words, problems, and the template. Nothing in it says what the top
// bar or the Inspector already does: no save state, no "Page 1 of 2", no sample notice. Below 640px
// it is hidden, but for what can't wait (the recovery copy's warning, an error, a sprint).

const status = (page: Page) => page.locator('[data-tour="status"]');
const width = (page: Page) => page.viewportSize()?.width ?? 0;

/** Makes the browser decline to promise the recovery copy, so the warning chip shows. */
async function storageMayBeCleared(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { persisted: async () => false, persist: async () => false },
    });
  });
}

/** Makes the browser promise to keep it: no chip. */
async function storageKept(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { persisted: async () => true, persist: async () => true },
    });
  });
}

test.describe('on a wide screen', () => {
  test.skip(({ isMobile }) => !!isMobile, 'a phone has no status bar');

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('is one 24px row', async ({ page }) => {
    await storageMayBeCleared(page);
    await start(page);
    await expect(status(page).getByRole('button', { name: /Autosave:/ })).toBeVisible();
    const bar = await status(page).boundingBox();
    expect(bar?.height).toBeGreaterThanOrEqual(23);
    expect(bar?.height).toBeLessThanOrEqual(25);
    // Every item sits inside that one row.
    const outside = await status(page).evaluate((footer) => {
      const box = footer.getBoundingClientRect();
      return Array.from(footer.querySelectorAll<HTMLElement>('button, [data-stat], [data-item]'))
        .filter((el) => el.offsetParent !== null)
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.top < box.top - 0.5 || r.bottom > box.bottom + 0.5;
        })
        .map((el) => el.textContent?.trim());
    });
    expect(outside).toEqual([]);
  });

  test('repeats nothing the top bar or the Inspector says', async ({ page }) => {
    await start(page);
    // The sample, with the Script in the Inspector: its header has the page.
    await showView(page, 'Script');
    await expect(page.locator('[data-pane="right"]')).toContainText('Page 1 of 2');
    await expect(status(page)).not.toContainText(/Page \d+ of \d+/);
    // The top bar's chip says it is a sample; the bar doesn't.
    await expect(status(page)).not.toContainText(/sample/i);
    // The save state is the top bar's.
    await setText(page, 'INT. ROOM - DAY\n\nA change.\n');
    await expect(page.locator('[data-save-state="unsaved"]')).toBeVisible();
    // (Its file item says there is no file yet: that is the file, not the save state.)
    await expect(status(page)).not.toContainText(/Unsaved|Saved/);
    await expect(status(page).locator('[role="status"]')).toHaveCount(0);
  });

  test('says the cursor’s page only while the Script is out of sight', async ({ page }) => {
    await start(page);
    const pageItem = status(page).locator('[data-item="page"]');
    // The Script is in the Inspector, and its header says the page.
    await showView(page, 'Script');
    await expect(pageItem).toHaveCount(0);
    // With the Outline there instead, the bar says it, before the page total.
    await showView(page, 'Outline');
    await expect(pageItem).toHaveText(/^(Title page|Page 1 of 2)$/);
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+End');
    await expect(pageItem).toHaveText('Page 2 of 2');
    const before = await status(page).evaluate((footer) => {
      const label = footer.querySelector('[data-item="page"]');
      const counts = footer.querySelector('.counts-button');
      return !!label && !!counts && !!(label.compareDocumentPosition(counts) & 4);
    });
    expect(before).toBe(true);
    // The title page is named as the Script names it.
    await page.keyboard.press('ControlOrMeta+Home');
    await expect(pageItem).toHaveText('Title page');
    await showView(page, 'Script');
    await expect(pageItem).toHaveCount(0);
  });

  test('says pages · running time, words, problems, and the template', async ({ page }) => {
    await start(page);
    // The sample, counted by hand (counts.spec): 1.4 pages, about a minute, 261 words.
    const counts = status(page).getByRole('button', { name: /pages/ });
    await expect(counts).toHaveText('1.4 pages · About 1 min');
    await expect(status(page).locator('[data-item="words"]')).toHaveText('261 words');
    await expect(status(page).getByRole('button', { name: /problem/ })).toBeVisible();
    await expect(status(page).locator('[data-tour="template"]')).toHaveText('Screenplay');
    // In that order, right of the file's name.
    const order = await status(page).evaluate((footer) =>
      Array.from(
        footer.querySelectorAll<HTMLElement>(
          '.history-button, .counts-button, [data-item="words"], .problems-button, [data-tour="template"]',
        ),
      ).map((el) =>
        el.matches('[data-tour="template"]')
          ? 'template'
          : (el.dataset.item ?? (el.className.match(/[a-z]+-button/)?.[0] as string)),
      ),
    );
    expect(order).toEqual([
      'history-button',
      'counts-button',
      'words',
      'problems-button',
      'template',
    ]);
  });

  test('opens Problems from its problems item', async ({ page }) => {
    await start(page);
    await status(page)
      .getByRole('button', { name: /problem/ })
      .click();
    await expect(problemsTab(page)).toHaveAttribute('aria-selected', 'true');
  });

  test('a Markdown document has words, and no pages or problems', async ({ page }) => {
    await start(page);
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page
      .getByRole('group', { name: 'Scripts', exact: true })
      .getByRole('button', { name: 'New Markdown document' })
      .click();
    await expect(editor(page)).toContainText('# Untitled');
    await expect(status(page).locator('.counts-button')).toHaveText(/^\d[\d,]* words?$/);
    await expect(status(page).locator('[data-item="words"]')).toHaveCount(0);
    await expect(status(page)).not.toContainText(/pages|problem/);
  });

  test('has no dotted underlines: its items are borderless buttons', async ({ page }) => {
    await storageMayBeCleared(page);
    await start(page);
    // A sprint's controls are in the bar too.
    await runCommand(page, 'Start a 15-minute sprint');
    await expect(status(page).locator('[data-sprint]')).toBeVisible();
    await expect(status(page).getByRole('button', { name: /Autosave:/ })).toBeVisible();
    const styles = await status(page).evaluate((footer) =>
      Array.from(footer.querySelectorAll<HTMLElement>('*'))
        .filter((el) => el.offsetParent !== null)
        .map((el) => {
          const css = getComputedStyle(el);
          return {
            text: el.textContent?.trim().slice(0, 30),
            button: el.tagName === 'BUTTON',
            line: css.textDecorationLine,
            border: css.borderTopWidth,
          };
        }),
    );
    expect(styles.filter((s) => s.line !== 'none')).toEqual([]);
    expect(styles.filter((s) => s.button && s.border !== '0px')).toEqual([]);
  });

  test('shows the recovery copy only when it matters', async ({ page }) => {
    await storageKept(page);
    await start(page);
    await expect(status(page).locator('.history-button')).toBeVisible();
    await expect(status(page).getByRole('button', { name: /Autosave:/ })).toHaveCount(0);
  });

  test('names the file, and its button opens History', async ({ page }) => {
    await start(page);
    const file = status(page).locator('.history-button');
    await expect(file).toHaveText('Not saved to a file yet');
    await expect(file).toHaveAccessibleName('History, Not saved to a file yet');
    await file.click();
    await expect(page.getByRole('dialog', { name: 'History' })).toBeVisible();
  });
});

test.describe('from 640px to 1023px', () => {
  test.skip(({ isMobile }) => !!isMobile, 'a desktop window, resized');

  test('says the cursor’s page while the one pane is the Source', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await start(page);
    const pageItem = status(page).locator('[data-item="page"]');
    await showView(page, 'Source');
    await expect(pageItem).toHaveText(/^(Title page|Page \d+ of 2)$/);
    await showView(page, 'Script');
    await expect(pageItem).toHaveCount(0);
  });
});

test.describe('below 640px', () => {
  test('is hidden, from 640px up shown', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'a desktop window, resized');
    await storageKept(page);
    await page.setViewportSize({ width: 639, height: 800 });
    await start(page);
    await expect(editor(page)).toBeAttached();
    await expect(status(page)).toBeHidden();
    await page.setViewportSize({ width: 640, height: 800 });
    await expect(status(page)).toBeVisible();
    const bar = await status(page).boundingBox();
    expect(bar?.height).toBeLessThanOrEqual(25);
  });

  test('is hidden on a phone', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'a phone');
    await storageKept(page);
    await start(page);
    expect(width(page)).toBeLessThan(640);
    await expect(status(page)).toBeHidden();
  });

  test('keeps the storage warning in view and working', async ({ page, isMobile }) => {
    await storageMayBeCleared(page);
    if (!isMobile) await page.setViewportSize({ width: 390, height: 800 });
    await start(page);
    const chip = page.getByRole('button', { name: 'Autosave: not guaranteed' });
    await expect(chip).toBeVisible();
    // Only the warning: the counts and the template are in Stats and the Drafter menu here.
    await expect(status(page).locator('.counts-button')).toBeHidden();
    await expect(status(page).locator('[data-tour="template"]')).toBeHidden();
    await chip.click();
    await expect(page.locator('#recovery-why')).toBeVisible();
    await expect(page.locator('#recovery-why')).toContainText('Save the script to a file');
  });

  test('keeps the errors’ region in place, so an error is said as it arrives', async ({
    page,
    isMobile,
  }) => {
    await storageKept(page);
    // A file input, as every browser without a picker has.
    await removePickers(page);
    if (!isMobile) await page.setViewportSize({ width: 390, height: 800 });
    await start(page);
    await expect(status(page)).toBeHidden();
    // The region is there before any error, and not taken out of the page with the bar.
    const region = status(page).locator('.errors');
    await expect(region).toHaveCount(1);
    expect(await region.evaluate((el) => el.checkVisibility())).toBe(true);
    await region.evaluate((el) => {
      (window as unknown as { __region: Element }).__region = el;
    });
    // A refused file: its line goes into that same region.
    await page.getByRole('button', { name: 'File', exact: true }).click();
    const chooser = page.waitForEvent('filechooser');
    await page
      .getByRole('group', { name: 'Scripts', exact: true })
      .getByRole('button', { name: 'Open a file…' })
      .click();
    await (await chooser).setFiles({
      name: 'Picture.png',
      mimeType: 'text/plain',
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]),
    });
    const alert = region.getByRole('alert');
    await expect(alert).toContainText('isn’t a script');
    await expect(alert).toBeVisible();
    expect(
      await region.evaluate((el) => el === (window as unknown as { __region: Element }).__region),
    ).toBe(true);
  });

  test('opens the counts from the palette', async ({ page, isMobile }) => {
    await storageKept(page);
    if (!isMobile) await page.setViewportSize({ width: 390, height: 800 });
    await start(page);
    await runCommand(page, 'Counts and daily goal…');
    const panel = page.getByRole('dialog', { name: 'Counts' });
    await expect(panel).toBeVisible();
    await expect(panel).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(status(page)).toBeHidden();
  });
});
