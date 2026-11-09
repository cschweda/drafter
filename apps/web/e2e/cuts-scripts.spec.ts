import { expect, type Page, test } from '@playwright/test';
import {
  editor,
  palette,
  paletteInput,
  runCommand,
  setText,
  showSource,
  start,
  viewTool,
  wholeText,
} from './modules';

// Cuts in a script (drafts-and-cuts design §3, migrated from Deleted scenes, which it replaced):
// a scene cut between two snapshots is listed under its heading, newest first; Put back puts it
// between its old neighbours as one undo and keeps it listed, marked; a read-only tab lists them
// with Put back off; the palette finds it by "deleted scenes" and "show all versions"; Find in Cuts
// from a Compare group; History opens it; a tab that exists only while open, the pane's one tab on
// a phone, and Close gives focus back.

const panel = (page: Page) => page.locator('#panel-cuts');
const items = (page: Page) => panel(page).locator('li.item');
const titles = (page: Page) => panel(page).locator('li.item h4 .title-text');
const itemOf = (page: Page, title: string) =>
  panel(page).getByRole('listitem', { name: title, exact: true });
const announcer = (page: Page) => page.locator('.outline-announcer');
const history = (page: Page) => page.getByRole('dialog', { name: 'History' });
const options = (page: Page) =>
  history(page).getByRole('listbox', { name: 'Snapshots' }).getByRole('option');
const labelField = (page: Page) => history(page).getByRole('textbox', { name: 'Label' });
const scriptsMenu = (page: Page) => page.getByRole('group', { name: 'Scripts', exact: true });
const READ_ONLY = 'You can’t type here because this script is open in another Drafter tab.';
const cutsTab = (page: Page) =>
  page.getByRole('tab', { name: 'Cuts', exact: true, selected: true });

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
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await scriptsMenu(page).getByRole('button', { name: kind }).click();
  await expect(scriptsMenu(page)).toBeHidden();
  await showSource(page);
}

/**
 * Runs a command from the palette. In Firefox the palette now and then lets an Enter go by with
 * its row highlighted (DEFERRED, as in drafts.spec): it is closed and the command run again.
 */
async function command(page: Page, title: string) {
  await expect(async () => {
    if (await palette(page).isVisible()) {
      await page.keyboard.press('Escape');
      await expect(palette(page)).toBeHidden({ timeout: 1000 });
    }
    await runCommand(page, title);
  }).toPass({ timeout: 15_000 });
}

/** Takes a snapshot from History and closes it. */
async function takeSnapshot(page: Page) {
  await command(page, 'Take snapshot…');
  await expect(labelField(page)).toBeFocused();
  const before = await options(page).count();
  await page.keyboard.press('Enter');
  await expect(options(page)).toHaveCount(before + 1);
  await history(page).getByRole('button', { name: 'Close' }).click();
  await expect(history(page)).toBeHidden();
}

/** A script at `before`, snapshotted, then changed to `after` and snapshotted; Cuts open on it. */
async function cutSince(page: Page, before = BEFORE, after = NOW) {
  await start(page);
  await newScript(page);
  await setText(page, before);
  await takeSnapshot(page);
  await setText(page, after);
  await takeSnapshot(page);
  await command(page, 'Cuts…');
  await expect(cutsTab(page)).toBeVisible();
  await expect(panel(page)).toBeVisible();
}

test.describe('Cuts in a script', () => {
  test('lists the scenes cut since a snapshot, each with its text and draft', async ({ page }) => {
    await cutSince(page);
    await expect(items(page)).toHaveCount(2);
    await expect(titles(page)).toHaveText(['INT. CELLAR - NIGHT', 'EXT. COAL YARD - DAWN']);
    const cellar = itemOf(page, 'INT. CELLAR - NIGHT');
    await expect(cellar.locator('.text')).toContainText('A lamp swings from a hook');
    await expect(cellar.locator('.chip')).toHaveText('Whole scene');
    await expect(cellar.locator('.meta')).toHaveText(
      /^Cut while writing Draft 01 · \d+ \w+ \d{4}, \d+:\d\d.*$/,
    );
    // Each under its own heading.
    await expect(panel(page).locator('.group-title .group-name')).toHaveText([
      'INT. CELLAR - NIGHT',
      'EXT. COAL YARD - DAWN',
    ]);
    // The slim bar counts them: in the Inspector's header, or behind its "⋯" when it is narrow.
    await viewTool(page, page.getByText('2 cuts', { exact: true }).filter({ visible: true }));
  });

  test('Put back puts it between its old neighbours, keeps it listed, and Undo takes it out', async ({
    page,
  }) => {
    await cutSince(page, script(HALL, CELLAR, ROOF), NOW);
    const cellar = itemOf(page, 'INT. CELLAR - NIGHT');
    await cellar.getByRole('button', { name: 'Put back “INT. CELLAR - NIGHT”' }).click();
    await expect(announcer(page)).toHaveText(
      'Put back “INT. CELLAR - NIGHT” after INT. HALL - DAY. Undo takes it out.',
    );
    await expect.poll(() => wholeText(page)).toBe(script(HALL, CELLAR, ROOF));
    // Still listed, marked.
    await expect(cellar.locator('.meta')).toContainText('put back on');
    await showSource(page);
    await editor(page).focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => wholeText(page)).toBe(NOW);
  });

  test('a read-only tab lists them, and Put back is off and says why', async ({
    page,
    context,
  }) => {
    await cutSince(page);
    await expect(items(page)).toHaveCount(2);
    // The text is written (750 ms after the last change) before the second tab opens.
    await page.waitForTimeout(1200);
    const second = await context.newPage();
    await second.goto('/');
    await expect(second.getByText(READ_ONLY).first()).toBeVisible();
    await expect.poll(() => wholeText(second)).toBe(NOW);
    await command(second, 'Cuts…');
    await expect(items(second)).toHaveCount(2);
    await expect(panel(second)).toContainText(READ_ONLY);
    const putBack = itemOf(second, 'INT. CELLAR - NIGHT').getByRole('button', {
      name: 'Put back “INT. CELLAR - NIGHT”',
    });
    await expect(putBack).toHaveAttribute('aria-disabled', 'true');
    await expect(putBack).toHaveAccessibleDescription(READ_ONLY);
    await putBack.dispatchEvent('click');
    await expect(announcer(second)).toHaveText(READ_ONLY);
    expect(await wholeText(second)).toBe(NOW);
    await second.close();
  });

  test('says when there are no cuts yet', async ({ page }) => {
    await start(page);
    await newScript(page);
    await setText(page, NOW);
    await command(page, 'Cuts…');
    await expect(panel(page)).toContainText('No cuts yet.');
    await expect(panel(page).locator('.d-empty')).toBeVisible();
  });

  test('the palette finds it by "deleted scenes" and "show all versions"', async ({ page }) => {
    await start(page);
    await newScript(page);
    for (const words of ['deleted scenes', 'show all versions']) {
      await page.keyboard.press('ControlOrMeta+k');
      await expect(paletteInput(page)).toBeFocused();
      await page.keyboard.insertText(words);
      const row = palette(page).getByRole('option', { name: 'Cuts…', exact: true });
      await expect(row).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(palette(page)).toBeHidden();
    }
    await command(page, 'Cuts…');
    await expect(cutsTab(page)).toBeVisible();
    // Run again with the tab showing, it closes it.
    await command(page, 'Close Cuts');
    await expect(page.getByRole('tab', { name: 'Cuts' })).toHaveCount(0);
  });

  test("a sample says cuts aren't kept", async ({ page }) => {
    await start(page);
    await command(page, 'Open sample: Screenplay');
    await command(page, 'Cuts…');
    await expect(panel(page)).toContainText('Cuts aren’t kept for a sample.');
  });

  test("on a phone it is the pane's tab", async ({ page, isMobile }) => {
    test.skip(!isMobile, 'a phone shows one pane');
    await cutSince(page);
    await expect(page.locator('[data-pane]')).toHaveCount(1);
    await expect(titles(page).first()).toBeVisible();
    const box = await panel(page).boundingBox();
    const width = page.viewportSize()?.width ?? 0;
    expect(box?.width ?? 0).toBeGreaterThan(width - 2);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });

  test('Close puts focus on the tab that replaces it', async ({ page, isMobile }) => {
    await cutSince(page);
    await (await viewTool(page, page.getByRole('button', { name: 'Close Cuts' }))).click();
    await expect(page.getByRole('tab', { name: 'Cuts' })).toHaveCount(0);
    if (isMobile) await expect(page.locator('.cm-content')).toBeFocused();
    else await expect(page.locator('#panel-script')).toBeFocused();
  });

  test('Find in Cuts from a Compare group focuses the cut', async ({ page }) => {
    await start(page);
    await newScript(page);
    await setText(page, BEFORE);
    await takeSnapshot(page);
    await setText(page, NOW);
    await takeSnapshot(page);
    await command(page, 'History…');
    // The older snapshot, compared with now.
    await options(page).nth(1).focus();
    await page.keyboard.press('Enter');
    const yard = page.locator('#panel-compare section.diff-group', {
      has: page.getByRole('heading', { name: 'EXT. COAL YARD - DAWN, Deleted scene' }),
    });
    await yard.getByRole('button', { name: 'Find in Cuts' }).click();
    await expect(cutsTab(page)).toBeVisible();
    await expect(itemOf(page, 'EXT. COAL YARD - DAWN')).toBeFocused();
    await expect(panel(page).getByRole('searchbox', { name: 'Filter' })).toHaveValue(
      'EXT. COAL YARD - DAWN',
    );
    await expect(titles(page)).toHaveText(['EXT. COAL YARD - DAWN']);
  });

  test('Find in Cuts says so when the scene was not kept as a cut yet', async ({ page }) => {
    await start(page);
    await newScript(page);
    await setText(page, BEFORE);
    await takeSnapshot(page);
    await setText(page, NOW);
    await command(page, 'History…');
    await options(page).first().focus();
    await page.keyboard.press('Enter');
    const yard = page.locator('#panel-compare section.diff-group', {
      has: page.getByRole('heading', { name: 'EXT. COAL YARD - DAWN, Deleted scene' }),
    });
    await yard.getByRole('button', { name: 'Find in Cuts' }).click();
    await expect(announcer(page)).toHaveText(
      /isn’t in Cuts yet\. A cut is kept at the next snapshot/,
    );
  });

  test('History opens it from its header', async ({ page }) => {
    await cutSince(page);
    await command(page, 'Close Cuts');
    await command(page, 'History…');
    await history(page).getByRole('button', { name: 'Cuts', exact: true }).click();
    await expect(history(page)).toBeHidden();
    await expect(cutsTab(page)).toBeVisible();
    await expect(items(page)).toHaveCount(2);
  });
});
