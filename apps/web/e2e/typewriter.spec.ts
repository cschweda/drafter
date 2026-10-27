import { expect, type Page, test } from '@playwright/test';
import {
  editor,
  openSettings,
  palette,
  paletteInput,
  settingsDialog,
  showSource,
  start,
} from './modules';

const scroller = (page: Page) => page.locator('.cm-scroller');
const barButton = (page: Page) => page.getByRole('button', { name: 'Typewriter', exact: true });
const switchOf = (page: Page) =>
  settingsDialog(page).getByRole('switch', { name: 'Typewriter scrolling' });
const focusButton = (page: Page) => page.getByRole('button', { name: 'Focus', exact: true });

/** How far the cursor's line is from the middle of the pane, and the height of a line. */
async function offCenter(page: Page, target: 'cursor' | 'first') {
  return page.evaluate((which) => {
    const pane = document.querySelector('.cm-scroller');
    const mark =
      which === 'cursor'
        ? document.querySelector('.cm-cursor-primary')
        : document.querySelector('.cm-line');
    if (!pane || !mark) return null;
    const p = pane.getBoundingClientRect();
    const m = mark.getBoundingClientRect();
    const line = Number.parseFloat(
      getComputedStyle(document.querySelector('.cm-line') as Element).lineHeight,
    );
    return { off: Math.abs(m.top + m.height / 2 - (p.top + p.height / 2)), line };
  }, target);
}

/** What the settings table holds, a row to a setting. */
function stored(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(
    () =>
      new Promise<Record<string, unknown>>((resolve) => {
        const open = indexedDB.open('drafter');
        open.onerror = () => resolve({});
        open.onsuccess = () => {
          const db = open.result;
          const request = db.transaction('settings').objectStore('settings').getAll();
          request.onsuccess = () => {
            db.close();
            const rows = request.result as Array<{ key: string; value: unknown }>;
            resolve(Object.fromEntries(rows.map((r) => [r.key, r.value])));
          };
          request.onerror = () => {
            db.close();
            resolve({});
          };
        };
      }),
  );
}

/** Types `count` short lines, a line at a time, with the cursor ending on the last. */
async function typeLines(page: Page, count: number) {
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Delete');
  for (let i = 1; i <= count; i++) {
    // The line break goes in with the text: an Enter key can be taken by Fountain's completion list.
    await page.keyboard.insertText(i < count ? `Line ${i}\n` : `Line ${i}`);
  }
}

async function turnOn(page: Page) {
  await barButton(page).click();
  await expect(barButton(page)).toHaveAttribute('aria-pressed', 'true');
}

test.beforeEach(async ({ page }) => {
  await start(page);
  await showSource(page);
});

test.describe('typewriter scrolling', () => {
  test('keeps the line being typed at the middle of the pane', async ({ page }) => {
    await turnOn(page);
    await typeLines(page, 60);
    await expect
      .poll(async () => {
        const at = await offCenter(page, 'cursor');
        return at !== null && at.off <= at.line;
      })
      .toBe(true);
    // And it follows a cursor move with the keys.
    for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowUp');
    await expect
      .poll(async () => {
        const at = await offCenter(page, 'cursor');
        return at !== null && at.off <= at.line;
      })
      .toBe(true);
  });

  test('leaves the opening lines at the top, with no room above the text', async ({ page }) => {
    // Where the Source pane is scrolled once it has settled (a phone lays the pane out late).
    const settled = async () => {
      let last = Number.NaN;
      await expect
        .poll(async () => {
          const now = await scroller(page).evaluate((el) => el.scrollTop);
          const same = now === last;
          last = now;
          return same;
        })
        .toBe(true);
      return last;
    };
    const before = await settled();
    await turnOn(page);
    // Two frames, so the room around the text has been measured and written.
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    );
    // Turning it on doesn't move the text: no empty half-pane appears above the title page.
    expect(
      await page.evaluate(
        () => document.querySelector<HTMLElement>('.cm-content')?.style.paddingTop,
      ),
    ).toBe('');
    expect(Math.abs((await settled()) - before)).toBeLessThanOrEqual(1);
    await typeLines(page, 60);
    await page.keyboard.press('ControlOrMeta+Home');
    await expect
      .poll(async () => (await scroller(page).evaluate((el) => el.scrollTop)) <= 1)
      .toBe(true);
    const at = await offCenter(page, 'first');
    expect(at?.off).toBeGreaterThan((at?.line ?? 0) * 2);
  });

  test('remembers the setting after a reload', async ({ page }) => {
    await expect(barButton(page)).toHaveAttribute('aria-pressed', 'false');
    await turnOn(page);
    await expect.poll(async () => (await stored(page)).typewriter).toBe(true);
    await page.reload();
    await showSource(page);
    await expect(barButton(page)).toHaveAttribute('aria-pressed', 'true');
    await openSettings(page);
    await expect(switchOf(page)).toBeChecked();
  });

  test('is off to begin with: the first line is at the top', async ({ page }) => {
    const at = await offCenter(page, 'first');
    expect(at?.off).toBeGreaterThan((at?.line ?? 0) * 2);
    expect(
      await page.evaluate(
        () => document.querySelector<HTMLElement>('.cm-content')?.style.paddingTop,
      ),
    ).toBe('');
  });

  test('turns on and off from the keyboard', async ({ page }) => {
    await barButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(barButton(page)).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Space');
    await expect(barButton(page)).toHaveAttribute('aria-pressed', 'false');
  });

  test('the bar, the dialog, and the palette agree', async ({ page }) => {
    await openSettings(page);
    await switchOf(page).check();
    await page.keyboard.press('Escape');
    await expect(settingsDialog(page)).toBeHidden();
    await expect(barButton(page)).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('ControlOrMeta+k');
    await expect(palette(page)).toBeVisible();
    await expect(
      palette(page).getByRole('option', { name: 'Turn on typewriter scrolling' }),
    ).toHaveCount(0);
    await paletteInput(page).fill('typewriter');
    await palette(page).getByRole('option', { name: 'Turn off typewriter scrolling' }).click();
    await expect(barButton(page)).toHaveAttribute('aria-pressed', 'false');
    // Off takes the room above and below the text away again.
    await expect
      .poll(() => editor(page).evaluate((el) => (el as HTMLElement).style.paddingTop))
      .toBe('');

    await page.keyboard.press('ControlOrMeta+k');
    await paletteInput(page).fill('typewriter');
    await palette(page).getByRole('option', { name: 'Turn on typewriter scrolling' }).click();
    await expect(barButton(page)).toHaveAttribute('aria-pressed', 'true');
  });

  test('keeps the place in the script when another setting changes', async ({ page }) => {
    await turnOn(page);
    await typeLines(page, 80);
    await page.keyboard.press('ControlOrMeta+End');
    await expect
      .poll(async () => {
        const at = await offCenter(page, 'cursor');
        return at !== null && at.off <= at.line;
      })
      .toBe(true);
    const padding = () => editor(page).evaluate((el) => (el as HTMLElement).style.paddingBottom);
    // The scroll has settled (centering within a line is not the same as being still).
    await page.waitForTimeout(300);
    const before = await scroller(page).evaluate((el) => el.scrollTop);
    const room = await padding();
    expect(room).not.toBe('');

    // Line numbers, spellcheck, and the text size are other settings; none rebuilds the plugin.
    await openSettings(page);
    await settingsDialog(page).getByRole('switch', { name: 'Line numbers' }).check();
    await settingsDialog(page).getByRole('switch', { name: 'Spellcheck' }).uncheck();
    await expect(page.locator('.cm-lineNumbers')).toBeVisible();
    await page.waitForTimeout(200);
    // Read with the dialog still up: WebKit moves the text a little when focus comes back to
    // the editor, whatever the settings did.
    expect(await padding()).toBe(room);
    expect(Math.abs((await scroller(page).evaluate((el) => el.scrollTop)) - before)).toBeLessThan(
      3,
    );
  });

  test('does not fight the writer scrolling by hand', async ({ page, isMobile }) => {
    test.skip(isMobile, 'a wheel is a mouse');
    await turnOn(page);
    await typeLines(page, 60);
    await expect
      .poll(async () => {
        const at = await offCenter(page, 'cursor');
        return at !== null && at.off <= at.line;
      })
      .toBe(true);
    const before = await scroller(page).evaluate((el) => el.scrollTop);
    await page.mouse.move(300, 300);
    await page.mouse.wheel(0, -400);
    await expect
      .poll(() => scroller(page).evaluate((el) => el.scrollTop))
      .toBeLessThan(before - 100);
    const after = await scroller(page).evaluate((el) => el.scrollTop);
    await page.waitForTimeout(300);
    expect(await scroller(page).evaluate((el) => el.scrollTop)).toBe(after);
  });

  test('Go to line puts the line at the middle too', async ({ page }) => {
    await turnOn(page);
    await typeLines(page, 60);
    await page.keyboard.press('ControlOrMeta+Home');
    await expect
      .poll(async () => (await scroller(page).evaluate((el) => el.scrollTop)) <= 21)
      .toBe(true);
    await page.keyboard.press('ControlOrMeta+k');
    await expect(palette(page)).toBeVisible();
    await paletteInput(page).fill('40');
    await palette(page)
      .getByRole('option', { name: /Go to line 40/ })
      .click();
    await expect
      .poll(async () => {
        const at = await offCenter(page, 'cursor');
        return at !== null && at.off <= at.line * 1.5;
      })
      .toBe(true);
  });

  test('works in a Markdown document', async ({ page }) => {
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await page
      .getByRole('group', { name: 'Scripts' })
      .getByRole('button', { name: 'New Markdown document' })
      .click();
    await expect(editor(page)).toContainText('# Untitled');
    await showSource(page);
    await turnOn(page);
    await typeLines(page, 60);
    await expect
      .poll(async () => {
        const at = await offCenter(page, 'cursor');
        return at !== null && at.off <= at.line;
      })
      .toBe(true);
  });

  test('works in focus mode', async ({ page }) => {
    await turnOn(page);
    await focusButton(page).click();
    await expect(page.getByRole('group', { name: 'Focus mode' })).toBeVisible();
    await typeLines(page, 60);
    await expect
      .poll(async () => {
        const at = await offCenter(page, 'cursor');
        return at !== null && at.off <= at.line;
      })
      .toBe(true);
    // Back at the start, the opening lines are at the top, as everywhere.
    await page.keyboard.press('ControlOrMeta+Home');
    await expect
      .poll(async () => (await scroller(page).evaluate((el) => el.scrollTop)) <= 1)
      .toBe(true);
  });

  test('scrolls instantly, with or without reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await turnOn(page);
    expect(await scroller(page).evaluate((el) => getComputedStyle(el).scrollBehavior)).toBe('auto');
    await typeLines(page, 60);
    // No animation to wait out: the first read after the typing is already centered.
    await expect
      .poll(
        async () => {
          const at = await offCenter(page, 'cursor');
          return at !== null && at.off <= at.line;
        },
        { timeout: 1000 },
      )
      .toBe(true);
  });
});
