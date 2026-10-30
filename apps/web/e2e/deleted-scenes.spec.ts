import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import {
  editor,
  palette,
  paletteInput,
  runCommand,
  setText,
  showSource,
  start,
  wholeText,
} from './modules';

// The Deleted scenes tab (version-history design §3.3, §3.5, §9, §10): every scene in a snapshot but
// in no scene now, newest deleted first; Put back puts one back between its old neighbours as one
// undo; Show text, Compare that version with now, and Find in Deleted scenes from Compare; the
// palette finds it by "show all versions"; one Tab stop with keys; a tab that exists only while
// open, the pane's one tab on a phone; and axe in both themes.

const panel = (page: Page) => page.locator('#panel-deleted');
const entries = (page: Page) => panel(page).locator('.entry');
const entryOf = (page: Page, heading: string) =>
  panel(page).getByRole('group', { name: heading, exact: true });
const announcer = (page: Page) => page.locator('.outline-announcer');
const history = (page: Page) => page.getByRole('dialog', { name: 'History' });
const options = (page: Page) =>
  history(page).getByRole('listbox', { name: 'Snapshots' }).getByRole('option');
const labelField = (page: Page) => history(page).getByRole('textbox', { name: 'Label' });
const scriptsMenu = (page: Page) => page.getByRole('group', { name: 'Scripts', exact: true });
const deletedTab = (page: Page) =>
  page.getByRole('tab', { name: 'Deleted scenes', exact: true, selected: true });

const HALL =
  'INT. HALL - DAY\n\nMarra waits by the door, turning the brass key over in her hands.\n';
const CELLAR =
  'INT. CELLAR - NIGHT\n\nA lamp swings from a hook and the shelves of jars tilt with it.\n\nOsken counts them twice, then a third time, out loud.\n';
const YARD = 'EXT. COAL YARD - DAWN\n\nTwo carts wait under a tarpaulin, their wheels chocked.\n';
const ROOF = 'EXT. ROOF - NIGHT\n\nWind drags the washing lines across the wet slates.\n';
const script = (...scenes: string[]) => `Title: The Weir\n\n${scenes.join('\n')}`;
const BEFORE = script(HALL, CELLAR, YARD, ROOF);
const NOW = script(HALL, ROOF);

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

/** A script at `before`, snapshotted, then changed to `after`; Deleted scenes open on it. */
async function deletedSince(page: Page, before = BEFORE, after = NOW) {
  await start(page);
  await newScript(page);
  await setText(page, before);
  await takeSnapshot(page);
  await setText(page, after);
  await runCommand(page, 'Deleted scenes');
  await expect(deletedTab(page)).toBeVisible();
  await expect(panel(page)).toBeVisible();
}

const focusedEntry = (page: Page) =>
  page.evaluate(
    () =>
      document.activeElement?.closest('.entry')?.querySelector('h3')?.textContent?.trim() ?? null,
  );

test.describe('Deleted scenes', () => {
  test('lists a scene deleted since a snapshot, with its preview', async ({ page }) => {
    await deletedSince(page);
    await expect(entries(page)).toHaveCount(2);
    // Both left in one snapshot: in its order.
    await expect(panel(page).locator('h3')).toHaveText([
      'INT. CELLAR - NIGHT',
      'EXT. COAL YARD - DAWN',
    ]);
    const cellar = entryOf(page, 'INT. CELLAR - NIGHT');
    await expect(cellar.locator('.preview')).toContainText('A lamp swings from a hook');
    await expect(cellar.locator('.meta')).toHaveText(
      /^Last in today, \d+:\d\d.* \(Taken by you\)\. In 1 version, from \d+ \w+\.$/,
    );
    // The slim bar counts them.
    await expect(page.locator('.slim', { hasText: '2 deleted scenes' })).toBeVisible();
  });

  test('Put back puts it between its old neighbours and Undo takes it out', async ({ page }) => {
    await deletedSince(page, script(HALL, CELLAR, ROOF), NOW);
    const cellar = entryOf(page, 'INT. CELLAR - NIGHT');
    await cellar.focus();
    await page.keyboard.press('p');
    await expect(announcer(page)).toHaveText(
      'Put back INT. CELLAR - NIGHT after INT. HALL - DAY. Undo takes it out.',
    );
    await expect.poll(() => wholeText(page)).toBe(script(HALL, CELLAR, ROOF));
    // Focus stayed in the list.
    expect(await focusedEntry(page)).toBe('INT. CELLAR - NIGHT');
    await showSource(page);
    await editor(page).focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => wholeText(page)).toBe(NOW);
  });

  test('the entry leaves the list after Put back', async ({ page }) => {
    await deletedSince(page);
    await entryOf(page, 'INT. CELLAR - NIGHT').focus();
    await page.keyboard.press('p');
    await expect(announcer(page)).toHaveText(
      /^Put back INT\. CELLAR - NIGHT after INT\. HALL - DAY/,
    );
    // Focus went on to the next entry, which stays while the one put back leaves.
    await expect.poll(() => focusedEntry(page)).toBe('EXT. COAL YARD - DAWN');
    await expect(panel(page).locator('h3')).toHaveText(['EXT. COAL YARD - DAWN']);
    expect(await focusedEntry(page)).toBe('EXT. COAL YARD - DAWN');
    // The yard goes back after the cellar, its old previous scene, now back too.
    await page.keyboard.press('p');
    await expect(announcer(page)).toHaveText(
      'Put back EXT. COAL YARD - DAWN after INT. CELLAR - NIGHT. Undo takes it out.',
    );
    await expect(panel(page)).toContainText(
      'No deleted scenes. Every scene in your versions is still in the script.',
    );
    expect(await wholeText(page)).toBe(BEFORE);
  });

  test('Show text shows the whole scene', async ({ page }) => {
    await deletedSince(page);
    const cellar = entryOf(page, 'INT. CELLAR - NIGHT');
    await cellar.getByRole('button', { name: 'Show text' }).click();
    const region = panel(page).getByRole('region', { name: 'Text of INT. CELLAR - NIGHT' });
    await expect(region).toHaveText(CELLAR.trimEnd());
    await cellar.getByRole('button', { name: 'Hide text' }).click();
    await expect(region).toBeHidden();
  });

  test('Compare that version with now opens Compare at the scene', async ({ page }) => {
    await deletedSince(page);
    await entryOf(page, 'INT. CELLAR - NIGHT').focus();
    await page.keyboard.press('Shift+F10');
    await page.getByRole('menuitem', { name: 'Compare that version with now' }).click();
    await expect(
      page.getByRole('tab', { name: 'Compare', exact: true, selected: true }),
    ).toBeVisible();
    await expect(
      page
        .locator('#panel-compare')
        .getByRole('heading', { name: 'INT. CELLAR - NIGHT, Deleted scene', exact: true }),
    ).toBeFocused();
  });

  test('the palette finds it by "show all versions"', async ({ page }) => {
    await start(page);
    await newScript(page);
    await page.keyboard.press('ControlOrMeta+k');
    await expect(paletteInput(page)).toBeFocused();
    await page.keyboard.insertText('show all versions');
    const row = palette(page).getByRole('option', { name: 'Deleted scenes', exact: true });
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute('data-highlighted', '');
    await page.keyboard.press('Enter');
    await expect(deletedTab(page)).toBeVisible();
    // Run again with the tab showing, it closes it.
    await runCommand(page, 'Close Deleted scenes');
    await expect(page.getByRole('tab', { name: 'Deleted scenes' })).toHaveCount(0);
  });

  test('a Markdown document says it has no scenes', async ({ page }) => {
    await deletedSince(page);
    await newScript(page, 'New Markdown document');
    await page.getByRole('tab', { name: 'Deleted scenes', exact: true }).first().click();
    await expect(panel(page)).toContainText('A Markdown document has no scenes.');
    await expect(entries(page)).toHaveCount(0);
  });

  test("a sample says snapshots aren't kept", async ({ page }) => {
    await start(page);
    await runCommand(page, 'Open sample: Screenplay');
    await runCommand(page, 'Deleted scenes');
    await expect(panel(page)).toContainText('Snapshots aren’t kept for a sample.');
  });

  test('keys work in the list', async ({ page }) => {
    await deletedSince(page);
    const first = entryOf(page, 'INT. CELLAR - NIGHT');
    // One Tab stop: the first entry.
    await expect(first).toHaveAttribute('tabindex', '0');
    await expect(entryOf(page, 'EXT. COAL YARD - DAWN')).toHaveAttribute('tabindex', '-1');
    await first.focus();
    await page.keyboard.press('ArrowDown');
    expect(await focusedEntry(page)).toBe('EXT. COAL YARD - DAWN');
    await page.keyboard.press('Home');
    expect(await focusedEntry(page)).toBe('INT. CELLAR - NIGHT');
    await page.keyboard.press('End');
    expect(await focusedEntry(page)).toBe('EXT. COAL YARD - DAWN');
    await page.keyboard.press('Enter');
    await expect(
      panel(page).getByRole('region', { name: 'Text of EXT. COAL YARD - DAWN' }),
    ).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(
      panel(page).getByRole('region', { name: 'Text of EXT. COAL YARD - DAWN' }),
    ).toBeHidden();
    await page.keyboard.press('Shift+F10');
    await expect(page.getByRole('menuitem', { name: 'Copy text' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toBeHidden();
    await expect.poll(() => focusedEntry(page)).toBe('EXT. COAL YARD - DAWN');
    // The filter folds case.
    await panel(page).getByRole('searchbox', { name: 'Filter' }).fill('coal');
    await expect(panel(page).locator('h3')).toHaveText(['EXT. COAL YARD - DAWN']);
  });

  test("on a phone it is the pane's tab", async ({ page, isMobile }) => {
    test.skip(!isMobile, 'a phone shows one pane');
    await deletedSince(page);
    await expect(page.locator('[data-pane]')).toHaveCount(1);
    await expect(panel(page).locator('h3').first()).toBeVisible();
    // The tab fills the screen's width.
    const box = await panel(page).boundingBox();
    const width = page.viewportSize()?.width ?? 0;
    expect(box?.width ?? 0).toBeGreaterThan(width - 2);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });

  test('Close puts focus on the tab that replaces it', async ({ page }) => {
    await deletedSince(page);
    await page.getByRole('button', { name: 'Close Deleted scenes' }).click();
    await expect(page.getByRole('tab', { name: 'Deleted scenes' })).toHaveCount(0);
    await expect(page.locator('#panel-script')).toBeFocused();
  });

  test('Find in Deleted scenes from a Compare group focuses the entry', async ({ page }) => {
    await start(page);
    await newScript(page);
    await setText(page, BEFORE);
    await takeSnapshot(page);
    await setText(page, NOW);
    await runCommand(page, 'History…');
    await options(page).first().focus();
    await page.keyboard.press('Enter');
    const yard = page.locator('#panel-compare section.diff-group', {
      has: page.getByRole('heading', { name: 'EXT. COAL YARD - DAWN, Deleted scene' }),
    });
    await yard.getByRole('button', { name: 'Find in Deleted scenes' }).click();
    await expect(deletedTab(page)).toBeVisible();
    await expect.poll(() => focusedEntry(page)).toBe('EXT. COAL YARD - DAWN');
  });

  test('History opens it from its header', async ({ page }) => {
    await start(page);
    await newScript(page);
    await setText(page, BEFORE);
    await takeSnapshot(page);
    await setText(page, NOW);
    await runCommand(page, 'History…');
    await history(page).getByRole('button', { name: 'Deleted scenes' }).click();
    await expect(history(page)).toBeHidden();
    await expect(deletedTab(page)).toBeVisible();
    await expect(entries(page)).toHaveCount(2);
    await expect(editor(page)).toBeAttached();
  });
});

test.describe("Deleted scenes' accessibility", () => {
  const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
  for (const theme of ['dark', 'light'] as const) {
    test(`has no accessibility violations (${theme})`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('nuxt-color-mode', t), theme);
      await deletedSince(page);
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`));
      await entryOf(page, 'INT. CELLAR - NIGHT').getByRole('button', { name: 'Show text' }).click();
      await expect(
        panel(page).getByRole('region', { name: 'Text of INT. CELLAR - NIGHT' }),
      ).toBeVisible();
      const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      expect(
        violations.map(({ id, nodes }) => `${id}: ${nodes.map((n) => n.target).join(', ')}`),
      ).toEqual([]);
    });
  }
});
