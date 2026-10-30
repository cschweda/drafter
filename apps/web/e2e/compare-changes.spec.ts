import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { DIFF_TOKENS } from '../app/compare/colors';
import {
  closeSettings,
  editor,
  openSettings,
  runCommand,
  setText,
  settingsDialog,
  showSource,
  start,
  stored,
  wholeText,
} from './modules';

// Compare's Changes view (version-history design §5): the Fountain text's diff, grouped by scene,
// with + and − rows, changed words underlined and struck through, folds, Go to scene, unified or
// side by side, red and green or blue and orange. The Pages view keeps v0.13's asterisks (the
// controller's ruling on Call 19). Axe runs on the view in both themes (the ruling on Call 36).

const history = (page: Page) => page.getByRole('dialog', { name: 'History' });
const options = (page: Page) =>
  history(page).getByRole('listbox', { name: 'Snapshots' }).getByRole('option');
const labelField = (page: Page) => history(page).getByRole('textbox', { name: 'Label' });
const scriptsMenu = (page: Page) => page.getByRole('group', { name: 'Scripts', exact: true });
const shownCompareTab = (page: Page) =>
  page.getByRole('tab', { name: 'Compare', exact: true, selected: true });
const panel = (page: Page) => page.locator('#panel-compare');
const comparePaneOf = (page: Page) => page.locator('[data-pane]', { has: panel(page) });
const diff = (page: Page) => panel(page).locator('.diff-view');
const rows = (page: Page, kind: 'added' | 'removed') => diff(page).locator(`.diff-row.${kind}`);
const groupTitles = (page: Page) => diff(page).locator('h3');
const announcer = (page: Page) => page.locator('.outline-announcer');
const viewGroup = (page: Page) => comparePaneOf(page).getByRole('group', { name: 'View' });
const layoutGroup = (page: Page) => comparePaneOf(page).getByRole('group', { name: 'Layout' });

const BASE = [
  'Title: The Call',
  '',
  'INT. HALL - DAY',
  '',
  'She waits by the door.',
  '',
  'The phone rings.',
  '',
  'EXT. ROOF - NIGHT',
  '',
  'Wind.',
  '',
].join('\n');

async function newScript(page: Page, kind = 'New screenplay') {
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await scriptsMenu(page).getByRole('button', { name: kind }).click();
  await expect(scriptsMenu(page)).toBeHidden();
  await showSource(page);
}

/** Takes a snapshot from History and closes it. */
async function takeSnapshot(page: Page) {
  await runCommand(page, 'Take snapshot…');
  await expect(labelField(page)).toBeFocused();
  const before = await options(page).count();
  await page.keyboard.press('Enter');
  await expect(options(page)).toHaveCount(before + 1);
  await history(page).getByRole('button', { name: 'Close' }).click();
  await expect(history(page)).toBeHidden();
}

/** Opens History and runs `key` on snapshot row `row` (0 is the newest). */
async function onRow(page: Page, row: number, key: string) {
  await runCommand(page, 'History…');
  await expect(options(page).nth(row)).toBeVisible();
  await options(page).nth(row).focus();
  await page.keyboard.press(key);
}

/** A script at `before`, snapshotted, then changed to `after`, compared with now. */
async function compareWithNow(page: Page, before: string, after: string) {
  await start(page);
  await newScript(page);
  await setText(page, before);
  await takeSnapshot(page);
  await setText(page, after);
  await onRow(page, 0, 'Enter');
  await expect(history(page)).toBeHidden();
  await expect(shownCompareTab(page)).toBeVisible();
  await expect(diff(page)).toBeVisible();
}

/** The editor's cursor, from its state (`wholeText`'s way in). */
const cursor = (page: Page) =>
  page.evaluate(() => {
    type Linked = { view?: { state: { selection: { main: { head: number } } } } };
    const content = document.querySelector('.cm-content') as
      | (Element & { cmTile?: Linked; cmView?: Linked })
      | null;
    return (content?.cmTile ?? content?.cmView)?.view?.state.selection.main.head ?? null;
  });

const focusedChange = (page: Page) =>
  page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.change ?? null);

const CHANGED = BASE.replace('She waits by the door.', 'She paces by the door.').replace(
  'The phone rings.',
  'The phone rings.\n\nA dog barks.',
);

/** A scene of `count` numbered beats, one a line. */
const beats = (count: number, edit: (i: number) => string = (i) => `Beat ${i}.`) =>
  Array.from({ length: count }, (_, i) => edit(i)).join('\n');

const wide = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

test.describe("Compare's Changes view", () => {
  test('opens on Changes with + and − rows', async ({ page }) => {
    await compareWithNow(page, BASE, CHANGED);
    await expect(viewGroup(page).getByRole('button', { name: 'Changes' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(diff(page).locator('.diff-summary')).toHaveText(
      '1 scene changed · 3 lines added, 1 removed',
    );
    await expect(groupTitles(page)).toHaveText(['INT. HALL - DAY']);
    // The older line's number, then the newer's, the sign, the hidden word, and the line.
    await expect(rows(page, 'removed')).toHaveText([/^5−removed, She waits by the door\.$/]);
    await expect(rows(page, 'added')).toHaveCount(3);
    await expect(rows(page, 'added').first()).toHaveText(/^5\+added, She paces by the door\.$/);
    await expect(rows(page, 'added').filter({ hasText: 'A dog barks.' })).toHaveText(
      /^\d+\+added, A dog barks\.$/,
    );
    // The numbers and the signs aren't read; the hidden words are.
    const sign = rows(page, 'added').first().locator('.diff-sign');
    await expect(sign).toHaveText('+');
    await expect(sign).toHaveAttribute('aria-hidden', 'true');
    await expect(rows(page, 'added').first().locator('.diff-num').first()).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    await expect(rows(page, 'removed').locator('.drafter-sr-only')).toHaveText('removed, ');
    // The Changes list names each change by its scene.
    await expect(panel(page).locator('.changes .change')).toHaveText([
      'INT. HALL - DAY: 1 line changed',
      'INT. HALL - DAY: 2 lines added',
    ]);
  });

  test('marks changed words, underlined and struck through', async ({ page }) => {
    await compareWithNow(page, BASE, CHANGED);
    const deleted = rows(page, 'removed').locator('.diff-word-del');
    const inserted = rows(page, 'added').first().locator('.diff-word-add');
    await expect(deleted).toHaveText(['waits']);
    await expect(inserted).toHaveText(['paces']);
    const line = (el: Element) => getComputedStyle(el).textDecorationLine;
    expect(await deleted.evaluate(line)).toContain('line-through');
    expect(await inserted.evaluate(line)).toContain('underline');
  });

  test('Show 40 unchanged lines opens the fold', async ({ page }) => {
    const scene = (edit: (i: number) => string) =>
      `Title: Beats\n\nINT. HALL - DAY\n\n${beats(48, edit)}\n`;
    const older = scene((i) => `Beat ${i}.`);
    const newer = scene((i) => (i === 0 || i === 47 ? `Beat ${i}, again.` : `Beat ${i}.`));
    await compareWithNow(page, older, newer);
    const fold = diff(page).getByRole('button', { name: 'Show 40 unchanged lines' });
    await expect(fold).toBeVisible();
    await expect(diff(page).locator('.diff-row', { hasText: 'Beat 20.' })).toHaveCount(0);
    await fold.click();
    await expect(fold).toHaveCount(0);
    await expect(diff(page).locator('.diff-row', { hasText: 'Beat 20.' })).toHaveCount(1);
    // Focus goes to the first line it showed.
    await expect(diff(page).locator('.diff-row:focus')).toHaveText(/Beat 4\.$/);
  });

  test('a group header goes to its scene', async ({ page }) => {
    await compareWithNow(page, BASE, BASE.replace('Wind.', 'Wind.\n\nRain.'));
    const roof = diff(page).locator('section.diff-group', {
      has: page.getByRole('heading', { name: 'EXT. ROOF - NIGHT' }),
    });
    await roof.getByRole('button', { name: 'Go to scene' }).click();
    await expect(editor(page)).toBeFocused();
    const text = (await wholeText(page)) ?? '';
    await expect.poll(() => cursor(page)).toBe(text.indexOf('EXT. ROOF - NIGHT'));
  });

  test('a deleted scene that is gone says so', async ({ page }) => {
    await compareWithNow(page, BASE, BASE.replace('EXT. ROOF - NIGHT\n\nWind.\n', ''));
    const roof = diff(page).locator('section.diff-group', {
      has: page.getByRole('heading', { name: /EXT\. ROOF - NIGHT/ }),
    });
    await expect(roof.locator('.diff-tag')).toHaveText('Deleted scene');
    await roof.getByRole('button', { name: 'Go to scene' }).click();
    await expect(announcer(page)).toHaveText('That scene isn’t in the script now.');
  });

  test('side by side shows Before and After columns, and is hidden on a phone', async ({
    page,
    isMobile,
  }) => {
    if (!isMobile) await page.setViewportSize({ width: 1700, height: 900 });
    await compareWithNow(page, BASE, CHANGED);
    if (isMobile) {
      await expect(layoutGroup(page)).toHaveCount(0);
      await expect(diff(page)).toHaveClass(/diff-unified/);
      return;
    }
    await layoutGroup(page).getByRole('button', { name: 'Side by side' }).click();
    const table = diff(page).getByRole('table');
    await expect(table.getByRole('columnheader')).toHaveText([/^Before \d+:\d+/, /^After now/]);
    // The changed line: the older on the left, the newer on the right, in one row.
    const changed = table.getByRole('row').filter({ hasText: 'She waits by the door.' });
    await expect(changed.getByRole('cell')).toHaveText([
      /−removed, She waits by the door\.$/,
      /\+added, She paces by the door\.$/,
    ]);
    // An added line has a blank cell beside it.
    const added = table.getByRole('row').filter({ hasText: 'A dog barks.' });
    await expect(added.getByRole('cell').first()).toHaveText('');
    // Narrower than 720 px, the choice goes and the view is unified.
    await page.setViewportSize({ width: 1100, height: 900 });
    await expect(layoutGroup(page)).toHaveCount(0);
    await expect(diff(page).getByRole('table')).toHaveCount(0);
  });

  test('N and Shift+N step through changes in the Changes view', async ({ page }) => {
    const after = BASE.replace('She waits by the door.', 'She paces by the door.')
      .replace('The phone rings.\n\n', '')
      .replace('Wind.', 'Wind.\n\nRain.');
    await compareWithNow(page, BASE, after);
    const labels = [
      'INT. HALL - DAY: 1 line changed',
      'INT. HALL - DAY: 2 lines removed',
      'EXT. ROOF - NIGHT: 2 lines added',
    ];
    await panel(page).focus();
    for (const i of [0, 1, 2, 0]) {
      await page.keyboard.press('n');
      await expect.poll(() => focusedChange(page)).toBe(String(i));
      await expect(announcer(page)).toHaveText(labels[i] as string);
    }
    await page.keyboard.press('Shift+N');
    await expect.poll(() => focusedChange(page)).toBe('2');
    // The focused row is the change's first, in the Changes view.
    await expect(diff(page).locator(':focus')).toHaveClass(/diff-row added/);
  });

  test('the choice of view and layout is remembered', async ({ page, isMobile }) => {
    if (!isMobile) await page.setViewportSize({ width: 1700, height: 900 });
    await compareWithNow(page, BASE, CHANGED);
    await viewGroup(page).getByRole('button', { name: 'Pages' }).click();
    await expect(panel(page).locator('section.pages .drafter-page').first()).toBeVisible();
    await expect(diff(page)).toHaveCount(0);
    await expect.poll(async () => (await stored(page)).compareView).toBe('pages');
    await viewGroup(page).getByRole('button', { name: 'Changes' }).click();
    if (!isMobile) {
      await layoutGroup(page).getByRole('button', { name: 'Side by side' }).click();
      await expect.poll(async () => (await stored(page)).diffLayout).toBe('split');
    }
    await viewGroup(page).getByRole('button', { name: 'Pages' }).click();
    await expect.poll(async () => (await stored(page)).compareView).toBe('pages');
    // A new visit opens Compare on the view, and the layout, chosen last.
    await page.reload();
    await expect(editor(page)).toBeAttached();
    await onRow(page, 0, 'Enter');
    await expect(shownCompareTab(page)).toBeVisible();
    await expect(viewGroup(page).getByRole('button', { name: 'Pages' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(panel(page).locator('section.pages .drafter-page').first()).toBeVisible();
    await viewGroup(page).getByRole('button', { name: 'Changes' }).click();
    if (!isMobile) await expect(diff(page).getByRole('table')).toBeVisible();
  });

  test('Blue and orange recolors the view', async ({ page }) => {
    await compareWithNow(page, BASE, CHANGED);
    const theme = (await page.locator('html').getAttribute('class'))?.includes('light')
      ? 'light'
      : 'dark';
    const hex = (h: string) =>
      `rgb(${[1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16)).join(', ')})`;
    const tint = () =>
      rows(page, 'added')
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(await tint()).toBe(hex(DIFF_TOKENS['red-green'][theme]['--diff-add-bg'] as string));
    await openSettings(page);
    await settingsDialog(page)
      .getByRole('combobox', { name: 'Colors for changes' })
      .selectOption({ label: 'Blue and orange' });
    await closeSettings(page);
    await expect(page.locator('html')).toHaveAttribute('data-diff-colors', 'blue-orange');
    expect(await tint()).toBe(hex(DIFF_TOKENS['blue-orange'][theme]['--diff-add-bg'] as string));
    const removedSign = rows(page, 'removed').first().locator('.diff-sign');
    expect(await removedSign.evaluate((el) => getComputedStyle(el).color)).toBe(
      hex(DIFF_TOKENS['blue-orange'][theme]['--diff-del-sign'] as string),
    );
  });

  test('a whole rewrite draws collapsed groups quickly', async ({ page }) => {
    test.slow();
    // Two unrelated scripts of 5,000 lines, ten scenes each, of invented words.
    const script = (seed: string) =>
      `Title: ${seed}\n\n${Array.from(
        { length: 10 },
        (_, s) =>
          `INT. ${seed.toUpperCase()} ROOM ${s} - DAY\n\n${Array.from(
            { length: 497 },
            (_, i) => `${seed}${s}x${i} vorrel ${seed}${i % 7} tamsin.`,
          ).join('\n')}\n`,
      ).join('\n')}`;
    await start(page);
    await newScript(page);
    await setText(page, script('quell'));
    await takeSnapshot(page);
    await setText(page, script('brindle'));
    await runCommand(page, 'History…');
    await options(page).first().focus();
    const started = Date.now();
    await page.keyboard.press('Enter');
    await expect(diff(page).locator('.diff-summary')).toBeVisible({ timeout: 60_000 });
    await expect(diff(page).locator('.diff-large').first()).toBeVisible();
    const elapsed = Date.now() - started;
    console.log(`A whole rewrite of 5,000 lines drew in ${elapsed} ms.`);
    await expect(diff(page).locator('.diff-large').first()).toContainText(
      /Large change: [\d,]+ lines\.\s*Show$/,
    );
    // A large group's rows are drawn only when shown: the title page's few are all there are.
    // The headings are alike enough to pair ("INT. QUELL ROOM 0 - DAY" and "INT. BRINDLE ROOM 0 -
    // DAY"), so each scene is one renamed group of 996 changed lines.
    await expect(diff(page).locator('.diff-large')).toHaveCount(10);
    await expect(diff(page).locator('.diff-tag', { hasText: 'Renamed' })).toHaveCount(10);
    expect(await diff(page).locator('.diff-row').count()).toBeLessThan(10);
    // A hang guard, ten times the budget; the time is logged above.
    expect(elapsed).toBeLessThan(5_000);
  });

  test('Pages keeps its asterisks', async ({ page }) => {
    await compareWithNow(page, BASE, CHANGED);
    await viewGroup(page).getByRole('button', { name: 'Pages' }).click();
    await expect(panel(page).locator('.compare-mark')).toHaveText([
      'changed, She paces by the door.',
      'added, A dog barks.',
    ]);
    await expect(panel(page).locator('.compare-star')).toHaveCount(2);
    await expect(panel(page).locator('.diff-sign')).toHaveCount(0);
    await viewGroup(page).getByRole('button', { name: 'Changes' }).click();
  });

  test('a Markdown document has only the Changes view', async ({ page }) => {
    await start(page);
    await newScript(page, 'New Markdown document');
    await setText(page, '# Notes\n\nOne.\n\nTwo.\n');
    await takeSnapshot(page);
    await setText(page, '# Notes\n\nOne.\n\nThree.\n');
    await onRow(page, 0, 'Enter');
    await expect(shownCompareTab(page)).toBeVisible();
    await expect(viewGroup(page)).toHaveCount(0);
    await expect(groupTitles(page)).toHaveText(['Notes']);
    await expect(diff(page).getByRole('button', { name: 'Go to heading' })).toBeVisible();
    await expect(panel(page).locator('.changes .change')).toHaveText(['Notes: 1 line changed']);
  });
});

test.describe("the Changes view's accessibility", () => {
  const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
  async function violations(page: Page) {
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    return violations.map(({ id, nodes }) => `${id}: ${nodes.map((n) => n.target).join(', ')}`);
  }

  for (const theme of ['dark', 'light'] as const) {
    for (const colors of ['Red and green', 'Blue and orange'] as const) {
      test(`has no accessibility violations (${theme}, ${colors})`, async ({ page }) => {
        await page.addInitScript((t) => localStorage.setItem('nuxt-color-mode', t), theme);
        if (wide(page)) await page.setViewportSize({ width: 1700, height: 900 });
        await compareWithNow(page, BASE, CHANGED.replace('Wind.', 'Wind and rain.'));
        await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`));
        if (colors === 'Blue and orange') {
          await openSettings(page);
          await settingsDialog(page)
            .getByRole('combobox', { name: 'Colors for changes' })
            .selectOption({ label: colors });
          await closeSettings(page);
        }
        expect(await violations(page), `unified, ${theme}, ${colors}`).toEqual([]);
        if (await layoutGroup(page).isVisible()) {
          await layoutGroup(page).getByRole('button', { name: 'Side by side' }).click();
          await expect(diff(page).getByRole('table').first()).toBeVisible();
          expect(await violations(page), `side by side, ${theme}, ${colors}`).toEqual([]);
        }
      });
    }
  }
});
