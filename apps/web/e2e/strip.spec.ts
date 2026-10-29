import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import { editor, setText, start } from './modules';
import { drafterDatabase, sampleSeenRows } from './seed';

// The Structure strip (docs/drafter-structure-strip-design.md): a band above both panes with a row
// per section depth the script uses, a row of scenes, and a page ruler. It is off by default, so
// these tests start with the setting stored on (Call 24), as playwright.config.ts builds its own
// storage state.

const port = Number(process.env.E2E_PORT ?? 4173);
const withStrip = {
  storageState: {
    cookies: [],
    origins: [
      {
        origin: `http://localhost:${port}`,
        localStorage: [{ name: 'drafter-tour-v1', value: 'true' }],
        indexedDB: [drafterDatabase([...sampleSeenRows, { key: 'structureStrip', value: true }])],
      },
    ],
  },
};

const strip = (page: Page) => page.getByRole('group', { name: 'Structure strip' });
const stripRow = (page: Page, name: string) =>
  strip(page).getByRole('group', { name, exact: true });
const scenes = (page: Page) => stripRow(page, 'Scenes').getByRole('button');

const SAMPLE = new URL('../../../samples/screenplay.fountain', import.meta.url);

test.describe('with the strip on', () => {
  test.use(withStrip);
  test.beforeEach(() => {
    test.skip(test.info().project.name.startsWith('phone'), 'a phone shows no strip');
  });

  test('shows a row per section level, the scenes, and a ruler', async ({ page }) => {
    await start(page);
    await setText(page, await readFile(SAMPLE, 'utf8'));
    await expect(strip(page)).toBeVisible();
    // The sample has one section depth (# Act One) and two scenes.
    const acts = stripRow(page, 'Sections marked #').getByRole('button');
    await expect(acts).toHaveCount(1);
    await expect(acts.first()).toHaveAccessibleName(/^Act One, 2 scenes/);
    await expect(scenes(page)).toHaveCount(2);
    await expect(scenes(page).first()).toHaveAccessibleName(/^Scene 1, INT\. KITCHEN - NIGHT/);
    await expect(scenes(page).first()).toContainText('1 INT. KITCHEN - NIGHT');
    await expect(scenes(page).nth(1)).toHaveAccessibleName(/^Scene 2, EXT\. BACK PORCH - LATER/);
    await expect(stripRow(page, 'Sections marked ##')).toHaveCount(0);
    // The row marks and the ruler are for the eye: the groups carry the names.
    const marks = strip(page).locator('.marks');
    await expect(marks).toHaveAttribute('aria-hidden', 'true');
    await expect(marks).toHaveText(/#\s*Scenes/);
    const ruler = strip(page).locator('.ruler');
    await expect(ruler).toHaveAttribute('aria-hidden', 'true');
    await expect(ruler).toBeVisible();
    await expect(ruler.locator('.number').first()).toHaveText('1');
    // The two scenes tile the whole width, the act sits exactly above them, and no block is
    // narrower than nothing.
    const boxes = await strip(page)
      .locator('[role="group"][aria-label] button')
      .evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { left: r.left, right: r.right };
        }),
      );
    const [act, first, second] = boxes as Array<{ left: number; right: number }>;
    expect(Math.abs((act?.left ?? 0) - (first?.left ?? 1))).toBeLessThan(1);
    expect(Math.abs((act?.right ?? 0) - (second?.right ?? 1))).toBeLessThan(1);
    expect(Math.abs((first?.right ?? 0) - (second?.left ?? 1))).toBeLessThan(1);
    // At most 18 px a row plus 14 px of ruler (Call 27), with the borders.
    const height = await strip(page).evaluate((el) => el.getBoundingClientRect().height);
    expect(height).toBeLessThanOrEqual(2 * 18 + 14 + 2);
  });

  test('colors a scene by its color note, and names the color', async ({ page }) => {
    await start(page);
    await setText(
      page,
      [
        'INT. HALL - DAY',
        '',
        '[[Color: Blue]]',
        '',
        'Ann waits.',
        '',
        'EXT. YARD - NIGHT',
        '',
        '[[Color: Chartreuse]]',
        '',
        'Ben runs.',
        '',
      ].join('\n'),
    );
    await expect(scenes(page)).toHaveCount(2);
    const hall = scenes(page).first();
    const yard = scenes(page).nth(1);
    await expect(hall).toHaveAccessibleName(/^Scene 1, INT\. HALL - DAY, blue/);
    // The swatch's own blue (#4a86d9) is the block's bottom edge; the fill is a tint of it.
    await expect(hall).toHaveCSS('border-bottom-color', 'rgb(74, 134, 217)');
    const fills = await Promise.all(
      [hall, yard].map((block) => block.evaluate((el) => getComputedStyle(el).backgroundColor)),
    );
    expect(fills[0]).not.toBe(fills[1]);
    // A word Drafter doesn't know is named, and drawn neutral.
    await expect(yard).toHaveAccessibleName(/^Scene 2, EXT\. YARD - NIGHT, chartreuse/);
    await expect(yard).toHaveCSS('border-bottom-width', '0px');
  });

  test('shows one line for a script with no scenes', async ({ page }) => {
    await start(page);
    await setText(page, '# Act One\n\n= Something happens.\n');
    await expect(strip(page)).toHaveText('No scenes yet. Each scene heading you write shows here.');
    await expect(strip(page).getByRole('button')).toHaveCount(0);
  });

  test('keeps its blocks while typing adds a block', async ({ page }) => {
    await start(page);
    await setText(page, await readFile(SAMPLE, 'utf8'));
    await expect(scenes(page)).toHaveCount(2);
    // Wait for the strip by pages, then watch it at every change: the scenes row's buttons never
    // all go, and the ruler (drawn only by pages) never goes, so the strip neither empties nor
    // falls back to words while the layout catches up (Call 6).
    await expect(strip(page).locator('.ruler')).toBeVisible();
    await page.evaluate(() => {
      const w = window as unknown as { stripLeast: number; rulerLost: boolean };
      const count = () =>
        document.querySelectorAll('[role="group"][aria-label="Scenes"] button').length;
      w.stripLeast = count();
      w.rulerLost = false;
      new MutationObserver(() => {
        w.stripLeast = Math.min(w.stripLeast, count());
        if (!document.querySelector('[aria-label="Structure strip"] .ruler')) w.rulerLost = true;
      }).observe(document.body, { childList: true, subtree: true, attributes: true });
    });
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+End');
    for (let i = 0; i < 10; i++) await page.keyboard.press('Enter');
    await page.keyboard.type('INT. SHED - DAY');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Rain.');
    await expect(scenes(page)).toHaveCount(3);
    expect(
      await page.evaluate(() => {
        const w = window as unknown as { stripLeast: number; rulerLost: boolean };
        return { least: w.stripLeast, rulerLost: w.rulerLost };
      }),
    ).toEqual({ least: 2, rulerLost: false });
  });
});

test('is not shown until it is turned on', async ({ page }) => {
  await start(page);
  await setText(page, 'INT. HALL - DAY\n\nAnn waits.\n');
  await expect(editor(page)).toContainText('Ann waits.');
  await expect(page.locator('.top')).toBeVisible();
  await expect(strip(page)).toHaveCount(0);
});
