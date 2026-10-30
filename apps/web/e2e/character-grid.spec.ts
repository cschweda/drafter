import { expect, type Page, test } from '@playwright/test';
import { longScript } from './long-script';
import { editor, runCommand, setText, start } from './modules';

// The Stats tab's Character by scene (seeing-the-script design §4.4): a row per character and a
// column per scene, each cell the character's speeches there, a dot where they are there and
// silent; long absences outlined and listed; the ARIA grid's keys; and List, which says the same
// as text. Its accessibility tests are in a11y.spec.ts.

const stats = (page: Page) => page.getByRole('tabpanel', { name: 'Stats', exact: true });
const grid = (page: Page) => stats(page).getByRole('grid', { name: 'Character by scene' });
const cell = (page: Page, name: string) => grid(page).getByRole('gridcell', { name, exact: true });
const listButton = (page: Page) => stats(page).getByRole('button', { name: 'List', exact: true });

// Two keepers in a lighthouse, written for these tests.
const LAMP = `Title: The Lamp Room

INT. LAMP ROOM - NIGHT

WREN trims the wick. ODO climbs in, out of breath.

WREN
You're late.

ODO
The stairs are longer at night.

WREN
They are the same stairs.

EXT. GALLERY - NIGHT

ODO leans on the rail. WREN watches from the door.

ODO
Ships tonight?

ODO
None I can see.

INT. STORE ROOM - DAY

WREN
Who moved the oil?

WREN
And the matches.
`;

/** The script in the editor, then the Stats tab at Character by scene. */
async function showGrid(page: Page, text: string) {
  await start(page);
  await setText(page, text);
  await runCommand(page, 'Show stats');
  await page
    .getByRole('navigation', { name: 'Stats sections' })
    .getByRole('link', { name: 'Character by scene' })
    .click();
  await expect(
    stats(page).getByRole('heading', { name: 'Character by scene', level: 2 }),
  ).toBeFocused();
  await expect(grid(page)).toBeVisible();
}

/** The Source line the cursor is on, and the line after it. */
const caretLine = (page: Page) =>
  page.evaluate(() => {
    const node = window.getSelection()?.focusNode ?? null;
    const element = node instanceof Element ? node : (node?.parentElement ?? null);
    const line = element?.closest('.cm-line');
    return [line?.textContent ?? null, line?.nextElementSibling?.textContent ?? null];
  });

/** How far into its line the cursor is. */
const caretColumn = (page: Page) =>
  page.evaluate(() => {
    const selection = window.getSelection();
    const node = selection?.focusNode ?? null;
    const element = node instanceof Element ? node : (node?.parentElement ?? null);
    const line = element?.closest('.cm-line');
    if (!selection || !node || !line) return -1;
    const range = document.createRange();
    range.setStart(line, 0);
    range.setEnd(node, selection.focusOffset);
    return range.toString().length;
  });

/** In the page: makes the grid show (List off) and times it until the frame after it is drawn. */
async function timeGridPaint(page: Page): Promise<{ ms: number; drawn: number }> {
  await listButton(page).click();
  await expect(listButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(grid(page)).toHaveCount(0);
  return page.evaluate(
    () =>
      new Promise<{ ms: number; drawn: number }>((resolve) => {
        const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
          (b) => b.textContent?.trim() === 'List',
        ) as HTMLButtonElement;
        const start = performance.now();
        button.click();
        // Vue draws before the next frame; the paint follows that frame's callbacks.
        requestAnimationFrame(() =>
          setTimeout(() =>
            resolve({
              ms: performance.now() - start,
              drawn: document.querySelectorAll('[role="grid"] [role="gridcell"]').length,
            }),
          ),
        );
      }),
  );
}

test.describe('Character by scene', () => {
  test('shows a row per character and a column per scene, with numbers', async ({ page }) => {
    await showGrid(page, LAMP);
    await expect(grid(page)).toHaveAttribute('aria-rowcount', '3');
    await expect(grid(page)).toHaveAttribute('aria-colcount', '4');
    // Most speeches first, as the Characters table: WREN has four, ODO three.
    await expect(grid(page).getByRole('rowheader')).toHaveText(['WREN', 'ODO']);
    await expect(grid(page).getByRole('columnheader')).toHaveText(['Character', '1', '2', '3']);
    // Each scene's heading describes its column.
    await expect(grid(page).getByRole('columnheader', { name: '2' })).toHaveAttribute(
      'title',
      'EXT. GALLERY - NIGHT',
    );
    const rows = grid(page).getByRole('row');
    await expect(rows.nth(1).getByRole('gridcell')).toHaveText(['2', '·', '2']);
    await expect(rows.nth(2).getByRole('gridcell')).toHaveText(['1', '2', '']);
    await expect(cell(page, 'WREN, scene 1, 2 speeches')).toHaveAttribute('aria-colindex', '2');
    await expect(cell(page, 'ODO, scene 3, not in it')).toHaveAttribute('aria-colindex', '4');
    // One Tab stop: the first cell, until another has had focus.
    await expect(grid(page).locator('[tabindex="0"]')).toHaveCount(1);
    await expect(cell(page, 'WREN, scene 1, 2 speeches')).toHaveAttribute('tabindex', '0');
  });

  test('a silent cell shows a dot and reads silent', async ({ page }) => {
    await showGrid(page, LAMP);
    // WREN watches from the door in scene 2 and says nothing.
    const silent = cell(page, 'WREN, scene 2, silent');
    await expect(silent).toHaveText('·');
    // The shade only repeats the number: a silent cell and an empty one have none.
    await expect(silent).not.toHaveClass(/shade-/);
    await expect(cell(page, 'ODO, scene 2, 2 speeches')).toHaveClass(/shade-2/);
    await expect(cell(page, 'ODO, scene 1, 1 speech')).toHaveClass(/shade-1/);
  });

  test('arrow keys move and Enter goes to the cue', async ({ page }) => {
    await showGrid(page, LAMP);
    // From List, the next Tab stop is the grid's.
    await listButton(page).focus();
    await page.keyboard.press('Tab');
    await expect(cell(page, 'WREN, scene 1, 2 speeches')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(cell(page, 'ODO, scene 1, 1 speech')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(cell(page, 'ODO, scene 2, 2 speeches')).toBeFocused();
    await expect(cell(page, 'ODO, scene 2, 2 speeches')).toHaveAttribute('tabindex', '0');
    await page.keyboard.press('End');
    await expect(cell(page, 'ODO, scene 3, not in it')).toBeFocused();
    await page.keyboard.press('ControlOrMeta+Home');
    await expect(cell(page, 'WREN, scene 1, 2 speeches')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    // The cursor is at ODO's first cue in the gallery.
    await expect(editor(page)).toBeFocused();
    expect(await caretLine(page)).toEqual(['ODO', 'Ships tonight?']);
  });

  test('Enter on a silent cell goes to the first mention', async ({ page }) => {
    await showGrid(page, LAMP);
    await cell(page, 'WREN, scene 2, silent').click();
    await expect(cell(page, 'WREN, scene 2, silent')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(editor(page)).toBeFocused();
    expect((await caretLine(page))[0]).toBe('ODO leans on the rail. WREN watches from the door.');
    // At the name itself.
    expect(await caretColumn(page)).toBe('ODO leans on the rail. '.length);
  });

  test('a long absence is outlined and listed', async ({ page }) => {
    // MAVIS speaks in the first scene and comes back after about 27 pages without her.
    const filler = Array.from({ length: 22 }, () => 'The lamp turns and the sea goes dark again.')
      .map((line) => `${line}\n\n`)
      .join('');
    let text = 'INT. LAMP ROOM - NIGHT\n\nMAVIS\nWho kept the log last night?\n\nODO\nI did.\n\n';
    for (let s = 0; s < 30; s++)
      text += `INT. STAIRWELL - NIGHT\n\n${filler}ODO\nStill nothing.\n\n`;
    text += 'INT. LAMP ROOM - DAWN\n\nMAVIS\nThe log is blank.\n';
    await showGrid(page, text);
    const absences = stats(page).getByRole('list', { name: 'Long absences' });
    const item = absences.getByRole('button', {
      name: /^MAVIS: absent from page \d+ to page \d+ \(\d+ pages\)\.$/,
    });
    await expect(item).toBeVisible({ timeout: 30_000 });
    const [, from, to, n] = /page (\d+) to page (\d+) \((\d+) pages/.exec(
      (await item.textContent()) ?? '',
    ) as RegExpExecArray;
    expect(Number(to) - Number(from)).toBe(Number(n));
    expect(Number(n)).toBeGreaterThanOrEqual(20);
    // The empty cells it spans are outlined; her own scenes aren't.
    await expect(cell(page, 'MAVIS, scene 2, not in it')).toHaveClass(/\bgap\b/);
    await expect(cell(page, 'MAVIS, scene 12, not in it')).toHaveClass(/\bgap\b/);
    await expect(cell(page, 'MAVIS, scene 1, 1 speech')).not.toHaveClass(/\bgap\b/);
    // The item goes to the scene she comes back in.
    await item.click();
    await expect(editor(page)).toBeFocused();
    expect((await caretLine(page))[0]).toBe('INT. LAMP ROOM - DAWN');
  });

  test('List shows each character’s scenes as text, and is remembered', async ({ page }) => {
    await showGrid(page, LAMP);
    await expect(listButton(page)).toHaveAttribute('aria-pressed', 'false');
    await listButton(page).click();
    await expect(listButton(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(grid(page)).toHaveCount(0);
    const list = stats(page).getByRole('list', { name: 'Character by scene' });
    await expect(list.getByRole('listitem')).toHaveText([
      'WREN: in 3 scenes. Speaks in 1, 3. Silent in 2.',
      'ODO: in 2 scenes. Speaks in 1, 2.',
    ]);
    // Kept on this device: the next visit's Stats tab shows the List.
    await page.reload();
    await expect(editor(page)).toBeAttached();
    await runCommand(page, 'Show stats');
    await expect(listButton(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(stats(page).getByRole('list', { name: 'Character by scene' })).toBeVisible();
    await listButton(page).click();
    await expect(grid(page)).toBeVisible();
  });

  test('on a phone the first column stays as the grid scrolls', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'a phone’s width');
    await showGrid(page, longScript({ scenes: 40, characters: 8, seed: 7 }));
    await expect(grid(page).getByRole('rowheader')).toHaveCount(8);
    const first = grid(page).getByRole('rowheader').first();
    const corner = grid(page).getByRole('columnheader').first();
    const before = await first.boundingBox();
    const scrolled = await grid(page).evaluate((el) => {
      el.scrollLeft = 400;
      return el.scrollLeft;
    });
    expect(scrolled).toBeGreaterThan(0);
    await expect.poll(async () => (await first.boundingBox())?.x).toBe(before?.x);
    expect((await corner.boundingBox())?.x).toBe(before?.x);
    // The page itself doesn't scroll sideways: only the grid does.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()?.width ?? 0,
    );
  });

  // Budgets (seeing-the-script design §11): the grid's first paint within 200 ms. These log the
  // time, and fail only past ten times the budget, a guard against a hang (Call 51).
  test('a 120 by 30 grid paints within budget', async ({ page }, info) => {
    test.setTimeout(120_000);
    await showGrid(page, longScript({ scenes: 120, characters: 30, seed: 120 }));
    await expect(grid(page)).toHaveAttribute('aria-colcount', '121');
    const { ms, drawn } = await timeGridPaint(page);
    console.log(`grid 120 x 30, ${info.project.name}: ${ms.toFixed(1)} ms, ${drawn} cells drawn`);
    expect(ms).toBeLessThan(2000);
  });

  test('a 300-scene grid paints within budget', async ({ page }, info) => {
    test.setTimeout(180_000);
    await showGrid(page, longScript({ scenes: 300, characters: 60, seed: 300 }));
    await expect(grid(page)).toHaveAttribute('aria-colcount', '301');
    // Every speaking character has a row (the generator's picks leave a few of the 60 silent).
    const speakers = Number(await grid(page).getAttribute('aria-rowcount')) - 1;
    expect(speakers).toBeGreaterThan(50);
    await expect(grid(page).getByRole('rowheader')).toHaveCount(speakers);
    const { ms, drawn } = await timeGridPaint(page);
    console.log(`grid 300 x 60, ${info.project.name}: ${ms.toFixed(1)} ms, ${drawn} cells drawn`);
    // Only the columns in view and ten each side are drawn.
    expect(drawn).toBeLessThan(speakers * 300);
    expect(ms).toBeLessThan(2000);
  });
});
