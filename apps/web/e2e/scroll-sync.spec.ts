import { expect, type Page, test } from '@playwright/test';
import {
  editor,
  openSettings,
  palette,
  paletteInput,
  runCommand,
  settingsDialog,
  showSource,
  start,
} from './modules';

// Scroll sync (decided 2026-10-27): the Source and the Script pane, or a Markdown document's
// Preview, keep the same part of the script at their tops as either one scrolls.

/** A screenplay of `scenes` scenes, about two fifths of a page each; every line of it is unique. */
function longScript(scenes: number): string {
  let text = 'Title: The Long Night\nAuthor: A. Writer\n\n';
  for (let i = 1; i <= scenes; i++) {
    text += `INT. ROOM ${i} - NIGHT\n\n`;
    for (let beat = 1; beat <= 5; beat++) {
      text += `Scene ${i}, beat ${beat}: she crosses the room and looks out at the rain for a long while.\n\n`;
    }
    text += `MARGARET\nThis is line ${i} of what she says.\n\n`;
  }
  return text;
}

/** A Markdown document of `parts` parts; every line of it is unique. */
function longMarkdown(parts: number): string {
  let text = '# A long treatment\n\n';
  for (let i = 1; i <= parts; i++) {
    text += `## Part ${i}\n\n`;
    for (let p = 1; p <= 4; p++) {
      text += `Part ${i}, paragraph ${p}: the story moves on, and the people in it move with it, one scene at a time.\n\n`;
    }
  }
  return text;
}

const SCRIPT = longScript(40);
const MARKDOWN = longMarkdown(40);
/** "The same part of the script", near enough: about one scene's worth of text, in characters. */
const TOLERANCE = 450;

const scriptHost = (page: Page) => page.locator('.script-host');
const preview = (page: Page) => page.getByRole('article', { name: 'Preview' });
const syncButton = (page: Page) =>
  page.getByRole('button', { name: 'Sync scrolling', exact: true });
const wide = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

/** Puts `text` in a new document of `kind`, with the cursor at the top. */
async function fill(page: Page, kind: 'screenplay' | 'markdown', text: string) {
  await start(page);
  // An option's name ends with its keys, where it has some (New screenplay has).
  const name = kind === 'markdown' ? 'New Markdown document' : 'New screenplay';
  await page.keyboard.press('ControlOrMeta+k');
  await paletteInput(page).fill(name);
  await palette(page)
    .getByRole('option', { name: new RegExp(`^${name}`) })
    .click();
  await expect(palette(page)).toBeHidden();
  await showSource(page);
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(text);
  await page.keyboard.press('ControlOrMeta+Home');
}

/** The source offset of the first line of text at the top of the Source pane, or null if it isn't showing. */
async function sourceTop(page: Page, text: string): Promise<number | null> {
  const lines = await page.evaluate(() => {
    const scroller = document.querySelector('.cm-scroller');
    if (!scroller?.getClientRects().length) return null;
    const top = scroller.getBoundingClientRect().top;
    return [...document.querySelectorAll('.cm-line')]
      .filter((line) => line.getBoundingClientRect().bottom > top + 2)
      .map((line) => line.textContent ?? '')
      .filter((t) => t !== '');
  });
  if (!lines) return null;
  // The first line that is in the text once: a cue's name is in it forty times.
  for (const line of lines) {
    const at = text.indexOf(`${line}\n`);
    if (at >= 0 && text.indexOf(`${line}\n`, at + 1) < 0) return at;
  }
  return null;
}

/** The source offset of the first element at the top of the other pane (a line, or a block). */
function viewTop(page: Page, selector: string, anchors: string): Promise<number | null> {
  return page.evaluate(
    ([scrollerSelector, anchorSelector]) => {
      const scroller = document.querySelector(scrollerSelector);
      if (!scroller?.getClientRects().length) return null;
      const top = scroller.getBoundingClientRect().top;
      const first = [...scroller.querySelectorAll<HTMLElement>(anchorSelector)].find(
        (el) => el.getBoundingClientRect().bottom > top + 2,
      );
      return first ? Number(first.dataset.from) : null;
    },
    [selector, anchors] as const,
  );
}

const scriptTop = (page: Page) => viewTop(page, '.script-host', '.drafter-line[data-from]');
const previewTop = (page: Page) => viewTop(page, '.preview', '.body [data-from]');

/** Scrolls the Source until the line `line` is at its top, as a script does (no wheel). */
async function scrollSourceTo(page: Page, line: string) {
  await page.locator('.cm-scroller').evaluate((el) => {
    el.scrollTop = 0;
  });
  await expect
    .poll(
      () =>
        page.evaluate((wanted) => {
          const scroller = document.querySelector('.cm-scroller') as HTMLElement;
          const found = [...document.querySelectorAll('.cm-line')].find(
            (el) => el.textContent === wanted,
          );
          if (!found) {
            scroller.scrollTop += scroller.clientHeight * 0.8;
            return false;
          }
          const delta = found.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
          if (Math.abs(delta) < 3) return true;
          scroller.scrollTop += delta;
          return false;
        }, line),
      { intervals: [50], timeout: 10_000 },
    )
    .toBe(true);
}

/** The writer scrolls `selector` with the mouse wheel, by `dy` pixels in steps. */
async function wheel(page: Page, selector: string, dy: number) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`No ${selector} to scroll.`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let done = 0; done < dy; done += 400) {
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(30);
  }
}

/** Both panes' scroll positions, read every 100 ms until five readings in a row agree. */
async function settled(page: Page, view: string) {
  let last = '';
  let same = 0;
  for (let i = 0; i < 40 && same < 5; i++) {
    const now = await page.evaluate(
      (v) =>
        `${document.querySelector('.cm-scroller')?.scrollTop}/${document.querySelector(v)?.scrollTop}`,
      view,
    );
    same = now === last ? same + 1 : 0;
    last = now;
    await page.waitForTimeout(100);
  }
  return same >= 5;
}

test.describe('scroll sync, on wide screens', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!wide(page), 'Two panes show only on a wide screen; phones have their own test.');
  });

  test('scrolling the Source brings the Script pane to the same scene, and it settles', async ({
    page,
  }) => {
    await fill(page, 'screenplay', SCRIPT);
    await expect(
      scriptHost(page).locator('.drafter-line', { hasText: 'INT. ROOM 40' }),
    ).toBeAttached();
    await expect(syncButton(page)).toHaveAttribute('aria-pressed', 'true');

    await scrollSourceTo(page, 'INT. ROOM 25 - NIGHT');
    const at = SCRIPT.indexOf('INT. ROOM 25 - NIGHT');
    await expect.poll(() => scriptTop(page)).toBeGreaterThan(at - TOLERANCE);
    expect(await scriptTop(page)).toBeLessThan(at + TOLERANCE);
    await expect(
      scriptHost(page).locator('.drafter-line', { hasText: 'INT. ROOM 25 - NIGHT' }),
    ).toBeInViewport();
    // No oscillation: both panes come to rest, and the Source stayed where it was put.
    expect(await settled(page, '.script-host')).toBe(true);
    expect(Math.abs(((await sourceTop(page, SCRIPT)) ?? 0) - at)).toBeLessThan(80);
  });

  test('scrolling the Script pane with the wheel brings the Source to the same scene', async ({
    page,
  }) => {
    await fill(page, 'screenplay', SCRIPT);
    await expect(
      scriptHost(page).locator('.drafter-line', { hasText: 'INT. ROOM 40' }),
    ).toBeAttached();
    await wheel(page, '.script-host', 6000);
    expect(await settled(page, '.script-host')).toBe(true);
    const script = (await scriptTop(page)) ?? 0;
    expect(script).toBeGreaterThan(3000);
    const source = (await sourceTop(page, SCRIPT)) ?? -1;
    expect(Math.abs(source - script)).toBeLessThan(TOLERANCE);
  });

  test('a press held on the Script pane past a pause keeps it leading as it is dragged', async ({
    page,
  }) => {
    await fill(page, 'screenplay', SCRIPT);
    await expect(
      scriptHost(page).locator('.drafter-line', { hasText: 'INT. ROOM 40' }),
    ).toBeAttached();
    // Pressed on the pane's edge (the desk, not a line, so the release jumps nowhere), held still
    // for longer than a lead lasts, then dragged: as a scroll bar's thumb is.
    const box = await scriptHost(page).boundingBox();
    if (!box) throw new Error('No Script pane.');
    await page.mouse.move(box.x + 4, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(800);
    await scriptHost(page).evaluate((el) => {
      el.scrollTop += 5000;
    });
    await page.waitForTimeout(800);
    const script = (await scriptTop(page)) ?? 0;
    expect(script).toBeGreaterThan(3000);
    const source = (await sourceTop(page, SCRIPT)) ?? -1;
    expect(Math.abs(source - script)).toBeLessThan(TOLERANCE);
    await page.mouse.up();
    expect(await settled(page, '.script-host')).toBe(true);
  });

  test('follows at 100% as at Fit width', async ({ page }) => {
    await fill(page, 'screenplay', SCRIPT);
    await page.getByRole('button', { name: '100%' }).click();
    await expect(
      scriptHost(page).locator('.drafter-line', { hasText: 'INT. ROOM 40' }),
    ).toBeAttached();
    await scrollSourceTo(page, 'INT. ROOM 30 - NIGHT');
    const at = SCRIPT.indexOf('INT. ROOM 30 - NIGHT');
    await expect.poll(() => scriptTop(page)).toBeGreaterThan(at - TOLERANCE);
    expect(await scriptTop(page)).toBeLessThan(at + TOLERANCE);
  });

  test('keeps the Source and the Preview in step, both ways', async ({ page }) => {
    await fill(page, 'markdown', MARKDOWN);
    await expect(preview(page).getByRole('heading', { name: 'Part 40' })).toBeAttached();

    await scrollSourceTo(page, '## Part 20');
    const at = MARKDOWN.indexOf('## Part 20');
    await expect.poll(() => previewTop(page)).toBeGreaterThan(at - TOLERANCE);
    expect(await previewTop(page)).toBeLessThan(at + TOLERANCE);
    expect(await settled(page, '.preview')).toBe(true);

    await wheel(page, '.preview', 3000);
    expect(await settled(page, '.preview')).toBe(true);
    const shown = (await previewTop(page)) ?? 0;
    expect(shown).toBeGreaterThan(at + 1000);
    const source = (await sourceTop(page, MARKDOWN)) ?? -1;
    expect(Math.abs(source - shown)).toBeLessThan(TOLERANCE);
  });

  test('typing with typewriter scrolling still centres, and the Script pane follows', async ({
    page,
  }) => {
    await fill(page, 'screenplay', SCRIPT);
    await page.getByRole('button', { name: 'Typewriter', exact: true }).click();
    await scrollSourceTo(page, 'INT. ROOM 30 - NIGHT');
    await page.locator('.cm-line', { hasText: 'INT. ROOM 30 - NIGHT' }).click();
    await page.keyboard.press('End');
    await page.keyboard.insertText('\n\nShe types a new line here, in scene thirty.');
    // The line is at the middle of the Source, and the Script pane shows it.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const pane = document.querySelector('.cm-scroller')?.getBoundingClientRect();
          const cursor = document.querySelector('.cm-cursor-primary')?.getBoundingClientRect();
          if (!pane || !cursor) return 9999;
          return Math.abs(cursor.top + cursor.height / 2 - (pane.top + pane.height / 2));
        }),
      )
      .toBeLessThan(40);
    await expect(
      scriptHost(page).locator('.drafter-line', { hasText: 'She types a new line here' }),
    ).toBeInViewport();
    expect(await settled(page, '.script-host')).toBe(true);
  });

  test('the toggle turns it off, by keyboard too, and the choice survives a reload', async ({
    page,
  }) => {
    await fill(page, 'screenplay', SCRIPT);
    await expect(
      scriptHost(page).locator('.drafter-line', { hasText: 'INT. ROOM 40' }),
    ).toBeAttached();
    await syncButton(page).focus();
    await page.keyboard.press('Space');
    await expect(syncButton(page)).toHaveAttribute('aria-pressed', 'false');

    const before = await scriptHost(page).evaluate((el) => el.scrollTop);
    await scrollSourceTo(page, 'INT. ROOM 25 - NIGHT');
    await page.waitForTimeout(300);
    expect(await scriptHost(page).evaluate((el) => el.scrollTop)).toBe(before);

    await page.reload();
    await showSource(page);
    await expect(syncButton(page)).toHaveAttribute('aria-pressed', 'false');
    await openSettings(page);
    await expect(
      settingsDialog(page).getByRole('switch', { name: 'Sync scrolling' }),
    ).not.toBeChecked();
    await page.keyboard.press('Escape');

    // The palette turns it back on, and the Script pane comes into step at once.
    await runCommand(page, 'Turn on scroll sync');
    await expect(syncButton(page)).toHaveAttribute('aria-pressed', 'true');
    await scrollSourceTo(page, 'INT. ROOM 10 - NIGHT');
    const at = SCRIPT.indexOf('INT. ROOM 10 - NIGHT');
    await expect.poll(() => scriptTop(page)).toBeGreaterThan(at - TOLERANCE);
    expect(await scriptTop(page)).toBeLessThan(at + TOLERANCE);
  });
});

test.describe('scroll sync, on a phone', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(wide(page), 'One pane shows at a time only on a phone.');
  });

  test('the pane a tab opens is at the place the other one was', async ({ page }) => {
    await fill(page, 'screenplay', SCRIPT);
    await scrollSourceTo(page, 'INT. ROOM 25 - NIGHT');
    const at = SCRIPT.indexOf('INT. ROOM 25 - NIGHT');

    await page.getByRole('tab', { name: 'Script' }).click();
    await expect(
      scriptHost(page).locator('.drafter-line', { hasText: 'INT. ROOM 40' }),
    ).toBeAttached();
    await expect.poll(() => scriptTop(page)).toBeGreaterThan(at - TOLERANCE);
    expect(await scriptTop(page)).toBeLessThan(at + TOLERANCE);

    // The writer scrolls the Script pane (a finger, here as its events), then goes back.
    await scriptHost(page).evaluate((el) => {
      el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true }));
      el.scrollTop += 4000;
    });
    expect(await settled(page, '.script-host')).toBe(true);
    const script = (await scriptTop(page)) ?? 0;
    expect(script).toBeGreaterThan(at + 1000);

    await page.getByRole('tab', { name: 'Source' }).click();
    await expect
      .poll(async () => Math.abs(((await sourceTop(page, SCRIPT)) ?? -9999) - script))
      .toBeLessThan(TOLERANCE);
  });
});
