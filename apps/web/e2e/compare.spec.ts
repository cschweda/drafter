import { expect, type Page, test } from '@playwright/test';
import {
  editor,
  expectTypingLeavesScript,
  runCommand,
  setText,
  showSource,
  start,
} from './modules';

// Compare's Pages view (Phase 2 design §11.2): the newer of two versions as pages, changed and
// added lines with an asterisk, removed lines behind a button, a Changes list, and Next and
// Previous change (N and Shift+N in the tab, and the palette). Opened from History; read-only.
// Compare opens on its Changes view (version-history design §5.1, compare-changes.spec.ts), so
// these tests choose Pages first, as a writer does once (it is remembered).

const history = (page: Page) => page.getByRole('dialog', { name: 'History' });
const options = (page: Page) =>
  history(page).getByRole('listbox', { name: 'Snapshots' }).getByRole('option');
const labelField = (page: Page) => history(page).getByRole('textbox', { name: 'Label' });
const scriptsMenu = (page: Page) => page.getByRole('group', { name: 'Scripts', exact: true });
// Every pane's slot holds the tab chosen last, so the selected one is the one showing it.
const compareTab = (page: Page) => page.getByRole('tab', { name: 'Compare', exact: true });
const shownCompareTab = (page: Page) =>
  page.getByRole('tab', { name: 'Compare', exact: true, selected: true });
const panel = (page: Page) => page.locator('#panel-compare');
const pages = (page: Page) => panel(page).locator('section.pages .drafter-page');
const changes = (page: Page) => panel(page).locator('.changes .change');
const announcer = (page: Page) => page.locator('.outline-announcer');
const comparePaneOf = (page: Page) => page.locator('[data-pane]', { has: panel(page) });

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

/** Chooses the Pages view on Compare's slim bar. */
async function showPages(page: Page) {
  await comparePaneOf(page)
    .getByRole('group', { name: 'View' })
    .getByRole('button', { name: 'Pages' })
    .click();
}

/** A script at `before`, snapshotted, then changed to `after`, compared with now, as pages. */
async function compareWithNow(page: Page, before: string, after: string) {
  await start(page);
  await newScript(page);
  await setText(page, before);
  await takeSnapshot(page);
  await setText(page, after);
  await onRow(page, 0, 'Enter');
  await expect(history(page)).toBeHidden();
  await expect(shownCompareTab(page)).toBeVisible();
  await showPages(page);
  await expect(pages(page).first()).toBeVisible();
}

/** The `data-change` of the focused element. */
const focusedChange = (page: Page) =>
  page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.change ?? null);

test.describe('Compare', () => {
  test.skip(({ isMobile }) => !!isMobile, 'the phone is tried on its own below');

  test('compares a snapshot with now and marks added and changed lines with an asterisk', async ({
    page,
  }) => {
    const after = BASE.replace('She waits by the door.', 'She paces by the door.').replace(
      'The phone rings.',
      'The phone rings.\n\nA dog barks.',
    );
    await compareWithNow(page, BASE, after);
    // In the pane that isn't showing Source.
    await expect(comparePaneOf(page)).toHaveAttribute('data-pane', 'right');
    await expect(comparePaneOf(page)).toContainText(/Comparing .+ with now \(.+\)/);
    const marked = panel(page).locator('.compare-mark');
    await expect(marked).toHaveText(['changed, She paces by the door.', 'added, A dog barks.']);
    await expect(panel(page).locator('.compare-star')).toHaveCount(2);
    await expect(panel(page).locator('.compare-star').first()).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    await expect(changes(page)).toHaveText([
      'Page 1, INT. HALL - DAY: 1 line changed',
      'Page 1, INT. HALL - DAY: 2 lines added',
    ]);
    // The pages keep their headings.
    await expect(panel(page).getByRole('heading', { name: 'EXT. ROOF - NIGHT' })).toHaveCount(1);
  });

  test('shows a removed-lines marker that reveals the struck-through lines', async ({ page }) => {
    await compareWithNow(page, BASE, BASE.replace('The phone rings.\n\n', ''));
    const gap = panel(page).getByRole('button', { name: '2 lines removed', exact: true });
    await expect(gap).toHaveAttribute('aria-expanded', 'false');
    await expect(panel(page).locator('del', { hasText: 'The phone rings.' })).toBeHidden();
    // Named for the scene the lines were in, not the next one.
    await expect(changes(page)).toHaveText(['Page 1, INT. HALL - DAY: 2 lines removed']);
    await gap.click();
    await expect(gap).toHaveAttribute('aria-expanded', 'true');
    await expect(panel(page).locator('del', { hasText: 'The phone rings.' })).toBeVisible();
    await gap.click();
    await expect(panel(page).locator('del', { hasText: 'The phone rings.' })).toBeHidden();
  });

  test('marks a moved scene as added where it is and removed where it was', async ({ page }) => {
    const moved = [
      'Title: The Call',
      '',
      'EXT. ROOF - NIGHT',
      '',
      'Wind.',
      '',
      'INT. HALL - DAY',
      '',
      'She waits by the door.',
      '',
      'The phone rings.',
      '',
    ].join('\n');
    await compareWithNow(page, BASE, moved);
    const added = await panel(page).locator('.compare-mark').allTextContents();
    const removed = await panel(page).locator('.compare-gap-lines del').allTextContents();
    expect(added.length).toBeGreaterThan(0);
    expect(removed.length).toBeGreaterThan(0);
    // One scene's heading is marked added where it is now, and listed removed where it was.
    const heading = ['INT. HALL - DAY', 'EXT. ROOF - NIGHT'].find(
      (h) => added.includes(`added, ${h}`) && removed.includes(h),
    );
    expect(heading).toBeDefined();
  });

  test('Next change and Previous change reach every change, by N, Shift+N, and the palette', async ({
    page,
  }) => {
    const after = BASE.replace('She waits by the door.', 'She paces by the door.')
      .replace('The phone rings.\n\n', '')
      .replace('Wind.', 'Wind.\n\nRain.');
    await compareWithNow(page, BASE, after);
    await expect(changes(page)).toHaveCount(3);
    const labels = await changes(page).allTextContents();
    await panel(page).focus();
    for (const i of [0, 1, 2, 0]) {
      await page.keyboard.press('n');
      await expect.poll(() => focusedChange(page)).toBe(String(i));
      await expect(announcer(page)).toHaveText(labels[i] as string);
    }
    await page.keyboard.press('Shift+N');
    await expect.poll(() => focusedChange(page)).toBe('2');
    await expect(announcer(page)).toHaveText(labels[2] as string);
    // From the Source, the palette goes to the change in Compare.
    await editor(page).click();
    await runCommand(page, 'Next change');
    await expect.poll(() => focusedChange(page)).toBe('0');
    await runCommand(page, 'Previous change');
    await expect.poll(() => focusedChange(page)).toBe('2');
  });

  test('the Changes list goes to each change', async ({ page }) => {
    const after = BASE.replace('She waits by the door.', 'She paces by the door.').replace(
      'Wind.',
      'Wind.\n\nRain.',
    );
    await compareWithNow(page, BASE, after);
    await expect(changes(page)).toHaveCount(2);
    for (const i of [1, 0]) {
      await changes(page).nth(i).click();
      await expect.poll(() => focusedChange(page)).toBe(String(i));
    }
  });

  test('the newer of two snapshots is the one drawn', async ({ page }) => {
    await start(page);
    await newScript(page);
    await setText(page, BASE);
    await takeSnapshot(page);
    await setText(page, BASE.replace('Wind.', 'Wind.\n\nA dog barks.'));
    await takeSnapshot(page);
    await setText(page, BASE.replace('Wind.', 'Wind.\n\nA dog barks.\n\nRain.'));
    // The older snapshot's Compare with…, then the newer one: the newer is drawn, whichever was first.
    await onRow(page, 1, 'c');
    const choices = history(page).getByRole('group', { name: /^Compare the snapshot from/ });
    await expect(choices.getByRole('button')).toHaveText(['Now', /, Taken by you$/, 'Cancel']);
    await choices.getByRole('button').nth(1).click();
    await expect(history(page)).toBeHidden();
    await showPages(page);
    await expect(pages(page).first()).toBeVisible();
    await expect(panel(page).locator('.compare-mark')).toHaveText(['added, A dog barks.']);
    await expect(panel(page)).not.toContainText('Rain.');
    // Neither side is now, so there is nothing to update.
    await expect(comparePaneOf(page).getByRole('button', { name: 'Update' })).toHaveCount(0);
    await expect(comparePaneOf(page)).toContainText(/Comparing \d+:\d+\D* with \d+:\d+/);
  });

  test('Update compares with the text as it is now', async ({ page }) => {
    await compareWithNow(page, BASE, BASE.replace('Wind.', 'Wind.\n\nA dog barks.'));
    await expect(panel(page).locator('.compare-mark')).toHaveText(['added, A dog barks.']);
    // Now was the text when Compare opened: an edit since doesn't move the marks.
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.insertText('\nRain.\n');
    await expect(panel(page)).not.toContainText('Rain.');
    await comparePaneOf(page).getByRole('button', { name: 'Update' }).click();
    await expect(panel(page).locator('.compare-mark')).toHaveText([
      'added, A dog barks.',
      'added, Rain.',
    ]);
  });

  test('closes when another script opens', async ({ page }) => {
    await compareWithNow(page, BASE, BASE.replace('Wind.', 'Wind.\n\nRain.'));
    await newScript(page);
    await expect(compareTab(page)).toHaveCount(0);
    await expect(panel(page)).toHaveCount(0);
  });

  test('Close comparison takes the tab away', async ({ page }) => {
    await compareWithNow(page, BASE, BASE.replace('Wind.', 'Wind.\n\nRain.'));
    await comparePaneOf(page).getByRole('button', { name: 'Close comparison' }).click();
    await expect(compareTab(page)).toHaveCount(0);
    await expect(page.locator('[data-pane="right"]').getByRole('tabpanel')).toBeFocused();
  });

  test('offers no edits: Compare is read-only', async ({ page }) => {
    await compareWithNow(page, BASE, BASE.replace('Wind.', 'Wind.\n\nRain.'));
    await expect(panel(page).locator('input, textarea, [contenteditable="true"]')).toHaveCount(0);
    // Keys typed in it change nothing drawn there, and nothing in the script (Safari would type
    // into the editor), and N still goes to a change.
    const before = await panel(page).textContent();
    await expectTypingLeavesScript(page, panel(page));
    expect(await panel(page).textContent()).toBe(before);
  });
});

test.describe('Compare on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'a phone only');

  test('the Changes list is collapsed on a phone', async ({ page }) => {
    await compareWithNow(page, BASE, BASE.replace('Wind.', 'Wind.\n\nRain.'));
    const list = panel(page).locator('details.changes');
    await expect(list).toBeVisible();
    await expect(list).not.toHaveAttribute('open', /.*/);
    await expect(changes(page).first()).toBeHidden();
    await list.locator('summary').click();
    await expect(changes(page).first()).toBeVisible();
  });
});
