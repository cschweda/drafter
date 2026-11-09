import AxeBuilder from '@axe-core/playwright';
import { type Browser, expect, type Page, test } from '@playwright/test';
import { type Outcome, TRAPS } from '../../../fixtures/trap/traps';
import { removePickers } from './fs-stub';
import { editor, palette, replaceWhole, runCommand, showSource, start, wholeText } from './modules';

// Production (production design §5, §6, §7): the tab locks pages and scene numbers and opens Blue;
// an edit is marked with an asterisk, and the status bar says "Blue rev."; the next revision keeps
// Blue's marks; Omit scene leaves OMITTED and one undo brings the scene back; a new scene shows its
// A-number dimmed until Write new scene numbers writes it; the same file in a fresh profile shows the
// same marks and labels; Classic Mode on and off leaves the file alone; each Production trap
// document opens unlocked; and axe on the tab in both themes.

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

/** A script of four pages or so: twelve scenes, each a heading and three paragraphs. */
const LONG = [
  'Title: The Long Weir',
  '',
  ...Array.from({ length: 12 }, (_, i) => [
    `INT. ROOM ${i + 1} - DAY`,
    '',
    `Marra crosses room ${i + 1} and sets the lamp down on the long table by the window.`,
    '',
    `The water in the weir below rises a little, and the boards of room ${i + 1} creak with it.`,
    '',
    `She listens, counts to ten, and goes on to the next room without a word.`,
    '',
  ]).flat(),
].join('\n');

/** Ten paragraphs at once, enough to push a locked page over into an A-page. */
const MORE = Array.from(
  { length: 10 },
  (_, i) => `A new beat ${i + 1}: the rain comes in under the door and pools around her boots.`,
).join('\n\n');

/**
 * Every page of the Script pane, by its label, with the text of each row that carries a revision
 * mark's asterisk and the set it is in: what the crew would see.
 */
function marksAndLabels(page: Page) {
  return scriptRegion(page)
    .locator('.drafter-page')
    .evaluateAll((pages) =>
      pages.map((el) => {
        const rows = new Map<string, string[]>();
        for (const line of el.querySelectorAll<HTMLElement>(
          '.drafter-line:not(.drafter-revision-star):not(.drafter-furniture)',
        )) {
          const row = line.style.getPropertyValue('--row');
          rows.set(row, [...(rows.get(row) ?? []), line.textContent ?? '']);
        }
        const marked = [...el.querySelectorAll<HTMLElement>('.drafter-revision-star')].map(
          (star) =>
            `${star.dataset.set}: ${(rows.get(star.style.getPropertyValue('--row')) ?? []).join(' ')}`,
        );
        return {
          label: el.querySelector('.drafter-sr-only')?.textContent ?? '',
          number: el.querySelector('.drafter-page-number')?.textContent ?? '',
          marked,
        };
      }),
    );
}

/** Open a file… with the file input, as a browser without the picker does: the real path. */
async function openAsFile(page: Page, name: string, bytes: Uint8Array) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const item = scriptsMenu(page).getByRole('button', { name: 'Open a file…' });
  await expect(item).toBeEnabled();
  const chooser = page.waitForEvent('filechooser');
  await item.click();
  await (await chooser).setFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(bytes) });
}

/** A page in a new browser context: a fresh profile, no drafts, nothing in IndexedDB. */
async function freshProfile(browser: Browser, like: Page, baseURL: string | undefined) {
  const context = await browser.newContext({
    baseURL,
    viewport: like.viewportSize(),
  });
  const page = await context.newPage();
  await removePickers(page);
  await start(page);
  return { context, page };
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

  test('the same file in a fresh profile shows the same marks and labels', async ({
    page,
    browser,
    baseURL,
  }) => {
    // Lock, edit (Blue), start Pink, edit again: a fold, A-pages, and both sets' marks.
    await written(page, LONG);
    await lockIt(page);
    await typeAfter(page, 'and goes on to the next room without a word.', MORE);
    await showProduction(page);
    await panel(page).getByRole('button', { name: 'Start the next revision (Pink)' }).click();
    await expect(chip(page)).toHaveText('Pink rev.');
    await typeAfter(page, 'creak with it.', 'Thunder, far off.');
    await showScript(page);
    await expect(scriptRegion(page).locator('.drafter-revision-star[data-set="Pink"]')).toHaveCount(
      1,
    );
    const here = await marksAndLabels(page);
    // Not a vacuous comparison: there are Blue and Pink marks, and an A-page.
    expect(here.some((p) => /^Page \d+A$/.test(p.label))).toBe(true);
    expect(here.flatMap((p) => p.marked).some((m) => m.startsWith('Blue: '))).toBe(true);
    expect(here.flatMap((p) => p.marked).some((m) => m.startsWith('Pink: '))).toBe(true);
    const text = (await wholeText(page)) ?? '';

    // A new profile has nothing but the file: no drafts, no snapshots, no database.
    const fresh = await freshProfile(browser, page, baseURL);
    try {
      expect(
        await fresh.page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name)),
      ).toEqual(['drafter']);
      await openAsFile(fresh.page, 'The Long Weir.fountain', new TextEncoder().encode(text));
      await expect.poll(() => wholeText(fresh.page)).toBe(text);
      await showScript(fresh.page);
      await expect.poll(() => marksAndLabels(fresh.page)).toEqual(here);
    } finally {
      await fresh.context.close();
    }
  });

  test('Classic Mode on and off changes nothing in the file', async ({ page }) => {
    await written(page);
    await lockIt(page);
    await typeAfter(page, 'Wind drags the washing lines across the wet slates.', 'Rain comes.');
    await showScript(page);
    await expect(stars(page)).toHaveCount(1);
    const before = (await wholeText(page)) ?? '';
    expect(before).toContain('"production"');
    await command(page, 'Switch to Classic Mode');
    await expect.poll(() => wholeText(page)).toBe(before);
    await command(page, 'Switch to Fountain Mode');
    await expect.poll(() => wholeText(page)).toBe(before);
    // Still locked, still marked.
    await showProduction(page);
    await expect(panel(page)).toContainText('Pages and scene numbers locked on');
    await showScript(page);
    await expect(stars(page)).toHaveCount(1);
  });

  test('a stray /* says how to let Production change the script again', async ({ page }) => {
    await written(page);
    await lockIt(page);
    await showSource(page);
    const text = (await wholeText(page)) ?? '';
    const stray = text.replace('turning the brass key', 'turning /* oops the brass key');
    expect(stray).not.toBe(text);
    await replaceWhole(page, stray);
    await expect.poll(() => wholeText(page)).toBe(stray);
    await showProduction(page);
    await expect(panel(page).locator('[data-production-read-only]')).toHaveText(
      'A /* in this script isn’t closed by its own */. Type */ where that comment ends, or delete the /*, and Production can change the script again.',
    );
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

// The Production trap documents (fixtures/trap/traps.ts, `production-*`): each one Open takes shows
// its script exactly as written, and the Production tab says it isn't locked and calls the block
// damaged; the one over 5 MB is refused by size; the well-formed control opens locked.
test.describe('Production trap documents', () => {
  for (const trap of TRAPS.filter((t) => t.id.startsWith('production-'))) {
    const outcome = trap.expect['web-open'] as Outcome;
    const does =
      outcome.kind === 'refused'
        ? 'is refused by size'
        : trap.locked
          ? 'opens locked'
          : 'opens unlocked';
    test(`${trap.id} ${does}`, async ({ page }) => {
      await removePickers(page);
      await start(page);
      await openAsFile(page, trap.name, trap.bytes?.() as Uint8Array);
      if (outcome.kind === 'refused') {
        await expect(page.locator('[data-tour="status"]').getByRole('alert')).toContainText(
          outcome.says,
        );
        await expect(page).toHaveTitle(/The Call/);
        return;
      }
      const expected = outcome.text as string;
      await expect.poll(() => wholeText(page), { timeout: 15_000 }).toBe(expected);
      await showProduction(page);
      if (trap.locked) {
        await expect(panel(page)).toContainText('Pages and scene numbers locked on');
        return;
      }
      await expect(panel(page).locator('[data-production-state]')).toHaveText('Not locked');
      await expect(panel(page)).toContainText(
        "Revision marks can't be shown: the block is damaged",
      );
      // Nothing was written: the file's text is as it came.
      expect(await wholeText(page)).toBe(expected);
    });
  }
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
