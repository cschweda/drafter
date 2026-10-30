import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { editor, runCommand, setText, showSource, start, wholeText } from './modules';
import { drafterDatabase, sampleSeenRows } from './seed';

// History of this scene (version-history design §6): a dialog listing a scene's versions newest
// first, one row per distinct version, followed through a renamed heading; the diff of the
// selected one with now or with the version before; Use this version (a "Before restoring a
// scene" snapshot, then one undo); opened from the Outline's and the Cards' menus, the Structure
// strip's new block menu, the palette, and Deleted scenes; one Tab stop with History's keys; the
// whole screen on a phone; and axe in both themes.

const dialog = (page: Page) => page.getByRole('dialog', { name: 'History of this scene' });
const versions = (page: Page) =>
  dialog(page).getByRole('listbox', { name: 'Versions' }).getByRole('option');
const diff = (page: Page) => dialog(page).locator('.diff-view');
const announcer = (page: Page) => page.locator('.outline-announcer');
const history = (page: Page) => page.getByRole('dialog', { name: 'History' });
const snapshotOptions = (page: Page) =>
  history(page).getByRole('listbox', { name: 'Snapshots' }).getByRole('option');
const labelField = (page: Page) => history(page).getByRole('textbox', { name: 'Label' });
const scriptsMenu = (page: Page) => page.getByRole('group', { name: 'Scripts', exact: true });
const openMenu = (page: Page) => page.getByRole('menu').and(page.locator('[data-state="open"]'));
const strip = (page: Page) => page.getByRole('group', { name: 'Structure strip' });

const body = (lines: string[]) => lines.join('\n\n');
const HALL_V1 = `INT. HALL - DAY\n\n${body([
  'Marra waits by the door, turning the brass key over in her hands.',
  'Rain ticks against the fanlight above the coats.',
  'She counts the hooks, then counts them again, slower.',
])}\n`;
const HALL_V2 = HALL_V1.replace('slower.', 'slower, out loud.');
const HALL_V3 = HALL_V2.replace('Rain ticks', 'Hail rattles');
const ROOF = 'EXT. ROOF - NIGHT\n\nWind drags the washing lines across the wet slates.\n';
const script = (...scenes: string[]) => `Title: The Weir\n\n${scenes.join('\n')}`;

async function newScript(page: Page) {
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await scriptsMenu(page).getByRole('button', { name: 'New screenplay' }).click();
  await expect(scriptsMenu(page)).toBeHidden();
  await showSource(page);
}

/** Takes a snapshot from History, labelled `label`, and closes it. */
async function takeSnapshot(page: Page, label = '') {
  await runCommand(page, 'Take snapshot…');
  await expect(labelField(page)).toBeFocused();
  if (label) await page.keyboard.insertText(label);
  const before = await snapshotOptions(page).count();
  await page.keyboard.press('Enter');
  await expect(snapshotOptions(page)).toHaveCount(before + 1);
  await history(page).getByRole('button', { name: 'Close' }).click();
  await expect(history(page)).toBeHidden();
}

/** A new script through `texts`, a snapshot of each, then at `now`. */
async function versionsOf(page: Page, texts: string[], now: string) {
  await start(page);
  await newScript(page);
  for (const [i, text] of texts.entries()) {
    await setText(page, text);
    await takeSnapshot(page, `Draft ${i + 1}`);
  }
  await setText(page, now);
}

/** Puts the cursor at the start of the Source line `line`. */
async function cursorOn(page: Page, line: string) {
  await showSource(page);
  await editor(page).locator('.cm-line', { hasText: line }).first().click();
  await page.keyboard.press('Home');
}

/** Opens the dialog from the palette, on the scene holding the cursor. */
async function openFromPalette(page: Page, heading = 'INT. HALL - DAY') {
  await cursorOn(page, heading);
  await runCommand(page, 'History of this scene…');
  await expect(dialog(page)).toBeVisible();
}

async function closeDialog(page: Page) {
  await dialog(page).getByRole('button', { name: 'Close' }).click();
  await expect(dialog(page)).toBeHidden();
}

const THREE = [
  script(HALL_V1, ROOF),
  script(HALL_V1, ROOF.replace('wet', 'dark')),
  script(HALL_V2, ROOF),
];

test.describe('History of this scene', () => {
  test("opens from the Outline's menu, the Cards' menu, and the palette", async ({ page }) => {
    await versionsOf(page, [script(HALL_V1, ROOF)], script(HALL_V2, ROOF));
    // The palette: the scene holding the cursor.
    await openFromPalette(page);
    await expect(dialog(page)).toContainText('INT. HALL - DAY');
    await closeDialog(page);
    // The Outline's menu.
    await runCommand(page, 'Show Outline');
    const row = page
      .getByRole('tree', { name: 'Outline' })
      .getByRole('treeitem', { name: /^Scene 1, INT\. HALL - DAY/ });
    await row.focus();
    await page.keyboard.press('Shift+F10');
    await openMenu(page).getByRole('menuitem', { name: 'History of this scene…' }).click();
    await expect(dialog(page)).toBeVisible();
    await expect(versions(page)).toHaveCount(1);
    // Closing gives focus back to the row.
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();
    await expect(row).toBeFocused();
    // The Cards' menu.
    await runCommand(page, 'Show Cards');
    const card = page
      .getByRole('listbox', { name: 'Cards' })
      .getByRole('option', { name: /^Scene 2, EXT\. ROOF - NIGHT/ });
    await card.focus();
    await page.keyboard.press('Shift+F10');
    await openMenu(page).getByRole('menuitem', { name: 'History of this scene…' }).click();
    await expect(dialog(page)).toContainText('EXT. ROOF - NIGHT');
    await closeDialog(page);
  });

  test('lists one row per distinct version, newest first', async ({ page }) => {
    await versionsOf(page, THREE, script(HALL_V3, ROOF));
    await openFromPalette(page);
    // Draft 3 (V2), then Drafts 2 and 1 (V1, the same twice): two rows.
    await expect(versions(page)).toHaveCount(2);
    await expect(versions(page).nth(0)).toContainText('Draft 3');
    await expect(versions(page).nth(1)).toContainText('Draft 2');
    await expect(versions(page).nth(1)).toContainText(/Unchanged in 2 versions/);
    // It opens on the newest version that differs from now, with focus on it.
    await expect(versions(page).nth(0)).toHaveAttribute('aria-selected', 'true');
    await expect(versions(page).nth(0)).toBeFocused();
    // Its change in words against the version before: "out loud" is two words.
    await expect(versions(page).nth(0)).toContainText('+2 words');
  });

  test('opens on the newest version that differs from now', async ({ page }) => {
    await versionsOf(page, THREE, script(HALL_V2, ROOF));
    await openFromPalette(page);
    await expect(versions(page)).toHaveCount(2);
    // The newest is as the scene is now: the one before is selected.
    await expect(versions(page).nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(versions(page).nth(0)).toContainText('Same as now');
  });

  test('follows a scene through a renamed heading', async ({ page }) => {
    const renamed = HALL_V2.replace('INT. HALL - DAY', 'INT. GREAT HALL - DAY');
    await versionsOf(page, [script(HALL_V1, ROOF)], script(renamed, ROOF));
    await openFromPalette(page, 'INT. GREAT HALL - DAY');
    await expect(versions(page)).toHaveCount(1);
    await expect(versions(page).first()).toContainText('INT. HALL - DAY');
    await expect(diff(page)).toContainText('INT. GREAT HALL - DAY');
  });

  test('compares a version with now and with the version before', async ({ page }) => {
    await versionsOf(page, THREE, script(HALL_V3, ROOF));
    await openFromPalette(page);
    const withGroup = dialog(page).getByRole('group', { name: 'Compare with' });
    const now = withGroup.getByRole('button', { name: 'Now' });
    const before = withGroup.getByRole('button', { name: 'Version before' });
    await expect(now).toHaveAttribute('aria-pressed', 'true');
    // Draft 3 with now: the rain became hail.
    await expect(diff(page).locator('.diff-row.removed')).toContainText(['Rain ticks']);
    await expect(diff(page).locator('.diff-row.added')).toContainText(['Hail rattles']);
    await before.click();
    await expect(before).toHaveAttribute('aria-pressed', 'true');
    // Draft 3 with Draft 2: "out loud" was added.
    await expect(diff(page).locator('.diff-row.added')).toContainText(['out loud']);
    await expect(diff(page).locator('.diff-row.removed')).not.toContainText(['Hail']);
    // The oldest has no version before.
    await versions(page).nth(0).focus();
    await page.keyboard.press('End');
    await expect(versions(page).nth(1)).toBeFocused();
    await expect(dialog(page)).toContainText('This is the oldest version.');
    // Enter compares the focused version with now.
    await page.keyboard.press('Enter');
    await expect(now).toHaveAttribute('aria-pressed', 'true');
    await expect(diff(page).locator('.diff-row.added')).toContainText(['Hail rattles', 'out loud']);
    // The version's menu, from Shift+F10; focus comes back to the row.
    await page.keyboard.press('Shift+F10');
    await openMenu(page).getByRole('menuitem', { name: 'Compare with the version before' }).click();
    await expect(before).toHaveAttribute('aria-pressed', 'true');
    await expect(versions(page).nth(1)).toBeFocused();
  });

  test('Use this version restores the scene and Undo brings it back', async ({ page }) => {
    const now = script(HALL_V3, ROOF);
    await versionsOf(page, THREE, now);
    await openFromPalette(page);
    await versions(page).nth(1).focus();
    await page.keyboard.press('u');
    await expect(dialog(page)).toBeHidden();
    await expect(announcer(page)).toHaveText(
      /^INT\. HALL - DAY is as it was on \w+, \d+ \w+ at \d+:\d\d.* Undo brings back what it replaced\.$/,
    );
    await expect.poll(() => wholeText(page)).toBe(script(HALL_V1, ROOF));
    await showSource(page);
    await editor(page).focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => wholeText(page)).toBe(now);
  });

  test('History lists Before restoring a scene', async ({ page }) => {
    await versionsOf(page, [script(HALL_V1, ROOF)], script(HALL_V2, ROOF));
    await openFromPalette(page);
    await dialog(page).getByRole('button', { name: 'Use this version' }).click();
    await expect.poll(() => wholeText(page)).toBe(script(HALL_V1, ROOF));
    await runCommand(page, 'History…');
    await expect(snapshotOptions(page).first()).toContainText('Before restoring a scene');
  });

  test('a deleted scene opens from Deleted scenes with H, and Use this version is off', async ({
    page,
  }) => {
    await versionsOf(page, [script(HALL_V1, ROOF)], script(ROOF));
    await runCommand(page, 'Deleted scenes');
    const entry = page
      .locator('#panel-deleted')
      .getByRole('group', { name: 'INT. HALL - DAY', exact: true });
    await entry.focus();
    await page.keyboard.press('h');
    await expect(dialog(page)).toBeVisible();
    await expect(versions(page)).toHaveCount(1);
    const use = dialog(page).getByRole('button', { name: 'Use this version' });
    await expect(use).toHaveAttribute('aria-disabled', 'true');
    // Off, it still says why when pressed.
    await use.dispatchEvent('click');
    await expect(dialog(page).getByRole('status')).toContainText(
      'That scene isn’t in the script now.',
    );
    await page.keyboard.press('Escape');
    await expect(entry).toBeFocused();
    // Its button too.
    await entry.getByRole('button', { name: 'History of INT. HALL - DAY' }).click();
    await expect(dialog(page)).toBeVisible();
  });

  test('says when there are no versions yet', async ({ page }) => {
    await start(page);
    await newScript(page);
    await setText(page, script(HALL_V1, ROOF));
    await openFromPalette(page);
    await expect(dialog(page)).toContainText(
      'Nothing to compare with yet: save, or take a snapshot.',
    );
  });

  test('fills the screen on a phone', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'a phone');
    await versionsOf(page, [script(HALL_V1, ROOF)], script(HALL_V2, ROOF));
    await openFromPalette(page);
    const box = await dialog(page).boundingBox();
    const size = page.viewportSize();
    expect(box?.width ?? 0).toBeGreaterThan((size?.width ?? 0) - 2);
    expect(box?.height ?? 0).toBeGreaterThan((size?.height ?? 0) - 2);
    const overflow = await dialog(page).evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("the strip's block menu", () => {
  test.use({
    storageState: {
      cookies: [],
      origins: [
        {
          origin: `http://localhost:${Number(process.env.E2E_PORT ?? 4173)}`,
          localStorage: [{ name: 'drafter-tour-v1', value: 'true' }],
          indexedDB: [drafterDatabase([...sampleSeenRows, { key: 'structureStrip', value: true }])],
        },
      ],
    },
  });
  test.beforeEach(() => {
    test.skip(test.info().project.name.startsWith('phone'), 'a phone shows no strip');
  });

  test("the strip's menu opens with Shift+F10 and the context-menu key", async ({ page }) => {
    await versionsOf(
      page,
      [script('# Act One\n', HALL_V1, ROOF)],
      script('# Act One\n', HALL_V2, ROOF),
    );
    const hall = strip(page)
      .getByRole('group', { name: 'Scenes', exact: true })
      .getByRole('button', { name: /^Scene 1, INT\. HALL - DAY/ });
    await hall.focus();
    await page.keyboard.press('Shift+F10');
    await expect(openMenu(page).getByRole('menuitem')).toHaveText([
      'Go to',
      'History of this scene…',
    ]);
    await page.keyboard.press('Escape');
    await expect(openMenu(page)).toHaveCount(0);
    await expect(hall).toBeFocused();
    await page.keyboard.press('ContextMenu');
    await openMenu(page).getByRole('menuitem', { name: 'History of this scene…' }).click();
    await expect(dialog(page)).toBeVisible();
    await expect(versions(page)).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(hall).toBeFocused();
    // A section's menu has Go to only.
    const act = strip(page).getByRole('button', { name: /^Act One/ });
    await act.click({ button: 'right' });
    await expect(openMenu(page).getByRole('menuitem')).toHaveText(['Go to']);
    await page.keyboard.press('Escape');
    // The strip stays one Tab stop.
    await expect(strip(page).locator('button[tabindex="0"]')).toHaveCount(1);
  });
});

test.describe("History of this scene's accessibility", () => {
  const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
  for (const theme of ['dark', 'light'] as const) {
    test(`has no accessibility violations (${theme})`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('nuxt-color-mode', t), theme);
      await versionsOf(page, THREE, script(HALL_V3, ROOF));
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`));
      await openFromPalette(page);
      await expect(diff(page).locator('.diff-row.added').first()).toBeVisible();
      const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      expect(
        violations.map(({ id, nodes }) => `${id}: ${nodes.map((n) => n.target).join(', ')}`),
      ).toEqual([]);
    });
  }
});
