import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { editor, palette, runCommand, setText, showSource, start, wholeText } from './modules';

// Cuts (drafts-and-cuts design §3): everything cut is kept, found between snapshots (never between
// keystrokes), listed under the scene or chapter it was cut from, newest first, with a filter, to
// browse for ideas; Insert at cursor and Put back are one undo each; Copy; a restored draft adds no
// cuts; on a phone it is in More and the menus' sheets; and axe in both themes.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const panel = (page: Page) => page.locator('#panel-cuts');
const items = (page: Page) => panel(page).locator('li.item');
const titles = (page: Page) => panel(page).locator('li.item h4 .title-text');
const groups = (page: Page) => panel(page).locator('.group-title .group-name');
const itemOf = (page: Page, title: string) =>
  panel(page).getByRole('listitem', { name: title, exact: true });
const filterBox = (page: Page) => panel(page).getByRole('searchbox', { name: 'Filter' });
const announcer = (page: Page) => page.locator('.outline-announcer');
const history = (page: Page) => page.getByRole('dialog', { name: 'History' });
const options = (page: Page) =>
  history(page).getByRole('listbox', { name: 'Snapshots' }).getByRole('option');
const scriptsMenu = (page: Page) => page.getByRole('group', { name: 'Scripts', exact: true });
const startDialog = (page: Page) => page.getByRole('dialog', { name: 'Start new draft' });

const HALL =
  'INT. HALL - DAY\n\nMarra waits by the door, turning the brass key over in her hands.\n\nMARRA\nI never wanted the key, and I never wanted the house that came with it either.\n';
const HALL_TRIMMED =
  'INT. HALL - DAY\n\nMarra waits by the door, turning the brass key over in her hands.\n';
const CELLAR =
  'INT. CELLAR - NIGHT\n\nA lamp swings from a hook and the shelves of jars tilt with it.\n\nOsken counts them twice, then a third time, out loud, and loses count at forty.\n';
const CELLAR_TRIMMED =
  'INT. CELLAR - NIGHT\n\nA lamp swings from a hook and the shelves of jars tilt with it.\n';
const YARD = 'EXT. COAL YARD - DAWN\n\nTwo carts wait under a tarpaulin, their wheels chocked.\n';
const ROOF = 'EXT. ROOF - NIGHT\n\nWind drags the washing lines across the wet slates.\n';
const script = (...scenes: string[]) => `Title: The Weir\n\n${scenes.join('\n')}`;

async function newScript(page: Page, kind = 'New screenplay') {
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await scriptsMenu(page).getByRole('button', { name: kind }).click();
  await expect(scriptsMenu(page)).toBeHidden();
  await showSource(page);
}

/** A palette command, run again if Firefox lets an Enter go by (DEFERRED, as in drafts.spec). */
async function command(page: Page, title: string) {
  await expect(async () => {
    if (await palette(page).isVisible()) {
      await page.keyboard.press('Escape');
      await expect(palette(page)).toBeHidden({ timeout: 1000 });
    }
    await runCommand(page, title);
  }).toPass({ timeout: 15_000 });
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

async function openCuts(page: Page) {
  if (await panel(page).isVisible()) return;
  await command(page, 'Cuts…');
  await expect(panel(page)).toBeVisible();
}

/** A script (or document) of the writer's own at each of `texts` in turn, a snapshot after each. */
async function written(page: Page, texts: string[], kind = 'New screenplay') {
  await start(page);
  await newScript(page, kind);
  for (const text of texts) {
    await setText(page, text);
    await expect.poll(() => wholeText(page)).toBe(text);
    await takeSnapshot(page);
  }
}

test.describe('Cuts', () => {
  test('cutting a scene shows it in Cuts after a snapshot, and not before', async ({ page }) => {
    await written(page, [script(HALL, CELLAR, YARD)]);
    // Cut, and typed back, and cut again: nothing is a cut until a snapshot is kept.
    await setText(page, script(HALL, YARD));
    await setText(page, script(HALL, CELLAR, YARD));
    await setText(page, script(HALL, YARD));
    await openCuts(page);
    await expect(panel(page)).toContainText('No cuts yet.');
    await takeSnapshot(page);
    await expect(titles(page)).toHaveText(['INT. CELLAR - NIGHT']);
  });

  test('passages are grouped under the scene they left, newest first, and the filter finds them', async ({
    page,
  }) => {
    await written(page, [
      script(HALL, CELLAR, ROOF),
      script(HALL, CELLAR_TRIMMED, ROOF),
      script(HALL_TRIMMED, CELLAR_TRIMMED, ROOF),
    ]);
    await openCuts(page);
    await expect(groups(page)).toHaveText(['INT. HALL - DAY', 'INT. CELLAR - NIGHT']);
    const hall = panel(page).locator('section.group').first();
    await expect(hall.locator('.text')).toContainText('I never wanted the key');
    await expect(hall.locator('.chip')).toHaveCount(0);
    await expect(hall.locator('.meta')).toContainText('Cut while writing Draft 01');
    // Filter: words from a cut's text.
    await filterBox(page).fill('forty');
    await expect(groups(page)).toHaveText(['INT. CELLAR - NIGHT']);
    await expect(items(page)).toHaveCount(1);
    await filterBox(page).fill('nothing like this');
    await expect(panel(page)).toContainText('No cut matches “nothing like this”.');
    await filterBox(page).fill('');
    // By draft instead.
    await panel(page).getByRole('button', { name: 'Group by draft' }).click();
    await expect(groups(page)).toHaveText(['Draft 01']);
  });

  test('Insert at cursor puts a scene at the next scene boundary as one undo', async ({ page }) => {
    await written(page, [script(HALL, CELLAR, ROOF), script(HALL, ROOF)]);
    await openCuts(page);
    // The cursor in the hall: the cellar goes in before the roof.
    await showSource(page);
    await editor(page).getByText('brass key').click();
    await openCuts(page);
    await itemOf(page, 'INT. CELLAR - NIGHT')
      .getByRole('button', { name: 'Insert at cursor “INT. CELLAR - NIGHT”' })
      .click();
    await expect(announcer(page)).toHaveText(
      'Inserted “INT. CELLAR - NIGHT” before EXT. ROOF - NIGHT. Undo takes it out.',
    );
    await expect.poll(() => wholeText(page)).toBe(script(HALL, CELLAR, ROOF));
    await showSource(page);
    await editor(page).focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => wholeText(page)).toBe(script(HALL, ROOF));
  });

  test('Put back finds its place among scenes with the same heading', async ({ page }) => {
    const car = (n: number) =>
      `INT. CAR - NIGHT\n\nThe wipers beat ${n} times, slow, and then the radio crackles twice.\n`;
    const layby = 'EXT. LAY-BY - NIGHT\n\nRain hammers the bonnet while Osken checks the map.\n';
    const before = script(car(1), car(2), car(3), layby, car(4), car(5));
    const after = script(car(1), car(2), car(3), car(4), car(5));
    await written(page, [before, after]);
    await openCuts(page);
    await itemOf(page, 'EXT. LAY-BY - NIGHT')
      .getByRole('button', { name: 'Put back “EXT. LAY-BY - NIGHT”' })
      .click();
    await expect.poll(() => wholeText(page)).toBe(before);
  });

  test('a Markdown chapter cut can be inserted elsewhere', async ({ page }) => {
    const ferry =
      '# The ferry\n\nThe ferry leaves at six and nobody on board admits to knowing the pilot.\n';
    const pier = '# The pier\n\nGulls quarrel over a crate of fish that nobody will claim.\n';
    const town = '# The town\n\nShutters open one by one along the harbour road.\n';
    const doc = (...parts: string[]) => parts.join('\n');
    await written(page, [doc(ferry, pier, town), doc(pier, town)], 'New Markdown document');
    await openCuts(page);
    await expect(titles(page)).toHaveText(['The ferry']);
    await expect(panel(page).locator('.chip')).toHaveText('Whole section');
    // The cursor in the pier's paragraph: it goes in at the next paragraph, the town.
    await showSource(page);
    await editor(page).getByText('Gulls quarrel').click();
    await openCuts(page);
    await itemOf(page, 'The ferry')
      .getByRole('button', { name: 'Insert at cursor “The ferry”' })
      .click();
    await expect.poll(() => wholeText(page)).toBe(doc(pier, ferry, town));
  });

  test('Copy puts the text on the clipboard', async ({ page, context, browserName }) => {
    await written(page, [script(HALL, CELLAR, ROOF), script(HALL, ROOF)]);
    await openCuts(page);
    const chromium = browserName === 'chromium';
    if (chromium) await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await itemOf(page, 'INT. CELLAR - NIGHT')
      .getByRole('button', { name: 'Copy “INT. CELLAR - NIGHT”' })
      .click();
    if (chromium) {
      await expect(announcer(page)).toHaveText('Copied “INT. CELLAR - NIGHT”.');
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(CELLAR.trimEnd());
    } else {
      // Only Chromium lets a test grant the clipboard; elsewhere what it says is checked.
      await expect(announcer(page)).toHaveText(
        /^(Copied “INT\. CELLAR - NIGHT”\.|Couldn’t copy the cut\.)$/,
      );
    }
  });

  test('restoring a draft adds no cuts', async ({ page }) => {
    await written(page, [script(HALL, CELLAR)]);
    await command(page, 'Start new draft…');
    await expect(startDialog(page)).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(startDialog(page)).toBeHidden();
    await setText(page, script(HALL, CELLAR, YARD, ROOF));
    await takeSnapshot(page);
    await command(page, 'Drafts…');
    await page
      .locator('#panel-drafts [data-draft="1"]')
      .getByRole('button', { name: 'Restore Draft 01 as a new draft' })
      .click();
    await expect.poll(() => wholeText(page)).toBe(script(HALL, CELLAR));
    await takeSnapshot(page);
    await openCuts(page);
    await expect(panel(page)).toContainText('No cuts yet.');
  });

  test('on a phone, Cuts is in the Drafter menu’s sheet and leads More while open', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'a phone');
    await written(page, [script(HALL, CELLAR), script(HALL)]);
    await page.getByRole('button', { name: 'Drafter menu' }).click();
    const menu = page.getByRole('menu', { name: 'Drafter menu' });
    await menu.getByRole('menuitem', { name: 'Cuts…' }).click();
    await expect(titles(page)).toHaveText(['INT. CELLAR - NIGHT']);
    const bar = page.locator('[data-bottom-bar]');
    await bar.getByRole('tab', { name: 'Write' }).click();
    await bar.getByRole('button', { name: /^More tabs/ }).click();
    const more = page.getByRole('menu', { name: 'More tabs' });
    await expect(more.getByRole('menuitem').first()).toHaveText('Cuts');
    await more.getByRole('menuitem', { name: 'Cuts' }).click();
    await expect(titles(page)).toHaveText(['INT. CELLAR - NIGHT']);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});

test.describe("Cuts' accessibility", () => {
  for (const theme of ['dark', 'light'] as const) {
    test(`has no accessibility violations (${theme})`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('nuxt-color-mode', t), theme);
      await written(page, [script(HALL, CELLAR, ROOF), script(HALL_TRIMMED, ROOF)]);
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`));
      await openCuts(page);
      await expect(items(page)).toHaveCount(2);
      const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      expect(
        violations.map(({ id, nodes }) => `${id}: ${nodes.map((n) => n.target).join(', ')}`),
      ).toEqual([]);
    });
  }
});
