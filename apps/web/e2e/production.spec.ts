import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { editor, palette, replaceWhole, runCommand, showSource, start, wholeText } from './modules';

// Production (production design §5, §6, §7): the tab locks pages and scene numbers and opens Blue;
// an edit is marked with an asterisk, and the status bar says "Blue rev."; the next revision keeps
// Blue's marks; Omit scene leaves OMITTED and one undo brings the scene back; a new scene shows its
// A-number dimmed until Write new scene numbers writes it; and axe on the tab in both themes.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const panel = (page: Page) => page.locator('#panel-production');
const scriptsMenu = (page: Page) => page.getByRole('group', { name: 'Scripts', exact: true });
const scriptRegion = (page: Page) => page.getByRole('region', { name: 'Script' });
const stars = (page: Page) => scriptRegion(page).locator('.drafter-revision-star');
const chip = (page: Page) => page.locator('[data-item="revision"]');
const confirmDialog = (page: Page) => page.getByRole('dialog', { name: /^(Unlock|Clear)/ });
const history = (page: Page) => page.getByRole('dialog', { name: 'History' });
const options = (page: Page) =>
  history(page).getByRole('listbox', { name: 'Snapshots' }).getByRole('option');

const SCRIPT = [
  'Title: The Weir',
  '',
  'INT. HALL - DAY',
  '',
  'Marra waits by the door, turning the brass key over in her hands.',
  '',
  'INT. CELLAR - NIGHT',
  '',
  'A lamp swings from a hook and the shelves of jars tilt with it.',
  '',
  'EXT. ROOF - NIGHT',
  '',
  'Wind drags the washing lines across the wet slates.',
  '',
].join('\n');

async function newScript(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await scriptsMenu(page).getByRole('button', { name: 'New screenplay' }).click();
  await expect(scriptsMenu(page)).toBeHidden();
  await showSource(page);
}

/** A palette command, run again if an Enter goes by (as in cuts.spec). */
async function command(page: Page, title: string) {
  await expect(async () => {
    if (await palette(page).isVisible()) {
      await page.keyboard.press('Escape');
      await expect(palette(page)).toBeHidden({ timeout: 1000 });
    }
    await runCommand(page, title);
  }).toPass({ timeout: 15_000 });
}

async function showProduction(page: Page) {
  await command(page, 'Show Production');
  await expect(panel(page)).toBeVisible();
}

/** A new screenplay of the writer's own with `text`, and the Production tab showing. */
async function written(page: Page, text = SCRIPT) {
  await start(page);
  await newScript(page);
  await replaceWhole(page, text);
  await expect.poll(() => wholeText(page)).toBe(text);
  await showProduction(page);
}

async function lockIt(page: Page) {
  await panel(page).getByRole('button', { name: 'Lock pages and scene numbers' }).click();
  await expect(panel(page)).toContainText('Pages and scene numbers locked on');
}

/**
 * Adds `line` as a paragraph after the line that reads `after`. Put in whole rather than typed: on
 * a phone a long line wraps, and End goes to the end of the wrapped row, not of the line.
 */
async function typeAfter(page: Page, after: string, line: string) {
  await showSource(page);
  const text = (await wholeText(page)) ?? '';
  expect(text).toContain(after);
  const next = text.replace(after, `${after}\n\n${line}`);
  await replaceWhole(page, next);
  await expect.poll(() => wholeText(page)).toBe(next);
}

async function showScript(page: Page) {
  if (!(await scriptRegion(page).isVisible()))
    await page.getByRole('tab', { name: 'Script', exact: true }).first().click();
  await expect(scriptRegion(page).locator('.drafter-page').first()).toBeVisible();
}

async function takeSnapshot(page: Page) {
  await command(page, 'Take snapshot…');
  await expect(history(page).getByRole('textbox', { name: 'Label' })).toBeFocused();
  const before = await options(page).count();
  await page.keyboard.press('Enter');
  await expect(options(page)).toHaveCount(before + 1);
  await history(page).getByRole('button', { name: 'Close' }).click();
  await expect(history(page)).toBeHidden();
}

test.describe('Production', () => {
  test('locks, numbers scenes, and opens Blue', async ({ page }) => {
    await written(page);
    await expect(panel(page)).toContainText('Not locked');
    await lockIt(page);
    const text = (await wholeText(page)) ?? '';
    expect(text).toContain('INT. HALL - DAY #1#');
    expect(text).toContain('INT. CELLAR - NIGHT #2#');
    expect(text).toContain('EXT. ROOF - NIGHT #3#');
    await expect(panel(page).locator('[data-production-set]')).toContainText('Blue revision, ');
    await expect(panel(page).locator('[data-production-set]')).toContainText('0 pages marked');
    // What each action did, or why it didn't, shows in the tab's status line.
    const said = panel(page).getByRole('status');
    await expect(said).toContainText('Pages and scene numbers are locked.');
    await panel(page).getByRole('button', { name: 'Write new scene numbers' }).click();
    await expect(said).toHaveText('Every scene already has its number written.');
    // The lock is one undo step.
    await showSource(page);
    await editor(page).focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => wholeText(page)).toBe(SCRIPT);
  });

  test('an edit shows an asterisk and Blue rev. in the status bar', async ({ page }) => {
    await written(page);
    await lockIt(page);
    await expect(chip(page)).toHaveText('Blue rev.');
    await typeAfter(page, 'Wind drags the washing lines across the wet slates.', 'Rain comes.');
    await showScript(page);
    await expect(stars(page).first()).toBeVisible();
    await expect(stars(page).first()).toHaveAttribute('data-set', 'Blue');
    // The chip opens the Production tab, which counts the marked page. (A phone has no status bar.)
    if (await chip(page).isVisible()) await chip(page).click();
    else await showProduction(page);
    await expect(panel(page)).toBeVisible();
    await expect(panel(page).locator('[data-production-set]')).toContainText('1 page marked');
  });

  test("Start the next revision (Pink) keeps Blue's marks", async ({ page }) => {
    await written(page);
    await lockIt(page);
    await typeAfter(page, 'Wind drags the washing lines across the wet slates.', 'Rain comes.');
    await showProduction(page);
    await panel(page).getByRole('button', { name: 'Start the next revision (Pink)' }).click();
    await expect(panel(page).locator('[data-production-set]')).toContainText('Pink revision, ');
    await expect(chip(page)).toHaveText('Pink rev.');
    await expect(panel(page).getByRole('list', { name: 'Earlier revisions' })).toContainText(
      'Blue, ',
    );
    // Blue's mark is still drawn, as Blue's.
    await showScript(page);
    await expect(stars(page)).toHaveCount(1);
    await expect(stars(page).first()).toHaveAttribute('data-set', 'Blue');
    // A Pink change is marked Pink beside it.
    await typeAfter(
      page,
      'Marra waits by the door, turning the brass key over in her hands.',
      'She knocks.',
    );
    await showScript(page);
    await expect(scriptRegion(page).locator('.drafter-revision-star[data-set="Pink"]')).toHaveCount(
      1,
    );
    await expect(scriptRegion(page).locator('.drafter-revision-star[data-set="Blue"]')).toHaveCount(
      1,
    );
  });

  test('Omit scene leaves OMITTED and one undo brings the scene back', async ({ page }) => {
    await written(page);
    await lockIt(page);
    const locked = (await wholeText(page)) ?? '';
    // No snapshot is taken by hand: Omit scene keeps the scene's text in one of its own first.
    // The Outline's scene menu, from the keyboard.
    await command(page, 'Show Outline');
    const tree = page.getByRole('tree', { name: 'Outline' });
    await tree.getByRole('treeitem', { name: /^Scene \S+, INT\. CELLAR - NIGHT/ }).focus();
    await page.keyboard.press('Shift+F10');
    const menu = page
      .getByRole('menu', { name: /^Actions for / })
      .and(page.locator('[data-state="open"]'));
    await menu.getByRole('menuitem', { name: 'Omit scene' }).click();
    await expect.poll(() => wholeText(page)).toContain('.OMITTED #2#');
    expect(await wholeText(page)).not.toContain('A lamp swings');
    // The scene's text was kept in a snapshot just before (History says so), so the next snapshot,
    // whatever takes it, finds it as a cut (drafts-and-cuts design §3.1).
    await takeSnapshot(page);
    await command(page, 'History…');
    await expect(options(page).filter({ hasText: 'Before omitting scene 2' })).toHaveCount(1);
    await history(page).getByRole('button', { name: 'Close' }).click();
    await expect(history(page)).toBeHidden();
    await command(page, 'Cuts…');
    await expect(page.locator('#panel-cuts')).toContainText('A lamp swings from a hook');
    // One undo brings it back.
    await showSource(page);
    await editor(page).focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => wholeText(page)).toBe(locked);
  });

  test('a new scene shows 5A dimmed, and Write new scene numbers writes it', async ({ page }) => {
    await written(page);
    const start = panel(page).getByRole('spinbutton', { name: 'Scene numbers start at' });
    await start.fill('5');
    await start.press('Tab');
    await lockIt(page);
    expect(await wholeText(page)).toContain('INT. HALL - DAY #5#');
    await typeAfter(
      page,
      'Marra waits by the door, turning the brass key over in her hands.',
      'INT. STAIRS - DAY',
    );
    const shown = editor(page).locator('.cm-provisional-number');
    await expect(shown).toHaveCount(1);
    await expect(shown).toHaveAttribute('data-provisional', '5A');
    await expect(shown).toContainText('#5A#');
    // Drawn, never written, in either mode.
    const before = await wholeText(page);
    expect(before).not.toContain('5A');
    await command(page, 'Switch to Classic Mode');
    await expect(editor(page).locator('.cm-provisional-number')).toHaveCount(1);
    expect(await wholeText(page)).toBe(before);
    await command(page, 'Switch to Fountain Mode');
    await showProduction(page);
    await panel(page).getByRole('button', { name: 'Write new scene numbers' }).click();
    await expect.poll(() => wholeText(page)).toContain('INT. STAIRS - DAY #5A#');
    await expect(editor(page).locator('.cm-provisional-number')).toHaveCount(0);
  });

  test('Unlock asks first, and leaves the text as it was', async ({ page }) => {
    await written(page);
    await lockIt(page);
    await panel(page).getByRole('button', { name: 'Unlock…' }).click();
    await expect(confirmDialog(page)).toBeVisible();
    await confirmDialog(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(confirmDialog(page)).toBeHidden();
    await expect(panel(page)).toContainText('Pages and scene numbers locked on');
    await panel(page).getByRole('button', { name: 'Unlock…' }).click();
    await confirmDialog(page).getByRole('button', { name: 'Unlock', exact: true }).click();
    await expect(confirmDialog(page)).toBeHidden();
    await expect(panel(page)).toContainText('Not locked');
    await expect(chip(page)).toHaveCount(0);
    expect(await wholeText(page)).toContain('INT. HALL - DAY #1#');
  });
});

for (const theme of ['dark', 'light'] as const) {
  test(`the Production tab and its dialog have no accessibility violations (${theme})`, async ({
    page,
  }) => {
    await page.addInitScript((t) => localStorage.setItem('nuxt-color-mode', t), theme);
    await written(page);
    await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`));
    const check = async (state: string) => {
      await page.evaluate(() =>
        Promise.all(
          document
            .getAnimations()
            .filter((a) => a.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY)
            .map((a) => a.finished.catch(() => {})),
        ),
      );
      const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      expect(
        violations.map(({ id, nodes }) => `${id}: ${nodes.map((n) => n.target).join(', ')}`),
        state,
      ).toEqual([]);
    };
    await check('not locked');
    await lockIt(page);
    await typeAfter(page, 'Wind drags the washing lines across the wet slates.', 'INT. SHED - DAY');
    await expect(editor(page).locator('.cm-provisional-number')).toHaveCount(1);
    await check('locked, a new scene’s number dimmed in the Source');
    await showProduction(page);
    await panel(page).getByRole('button', { name: 'Start the next revision (Pink)' }).click();
    await expect(chip(page)).toHaveText('Pink rev.');
    await check('locked, Pink open');
    await panel(page).getByRole('button', { name: 'Clear marks…' }).click();
    await expect(confirmDialog(page)).toBeVisible();
    await check('Clear marks asking');
    await page.keyboard.press('Escape');
    await expect(confirmDialog(page)).toBeHidden();
  });
}
