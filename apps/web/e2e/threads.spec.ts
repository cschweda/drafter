import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from './fixtures';
import { longScript } from './long-script';
import {
  editor,
  palette,
  pasteText,
  runCommand,
  setText,
  settled,
  showSource,
  start,
  stored,
} from './modules';

// Threads… (Threads plan, Task 6): the dialog from a scene's or passage's menu or the palette,
// the thread's own menu (rename, name, color, remove), and the words each says. One undo each.

const SCRIPT = [
  'Title: The Test',
  '',
  'INT. HALL - DAY',
  '',
  '= Ann arrives.',
  '',
  'ANN',
  'Hello.',
  '',
  'EXT. YARD - NIGHT',
  '',
  '[[Thread: A, B]]',
  '',
  'BOB',
  'Hi.',
  '',
].join('\n');

const tree = (page: Page) => page.getByRole('tree', { name: 'Outline' });
const row = (page: Page, name: string | RegExp) => tree(page).getByRole('treeitem', { name });
const hall = (page: Page) => row(page, /^Scene \d+, INT\. HALL - DAY/);
const yard = (page: Page) => row(page, /^Scene \d+, EXT\. YARD - NIGHT/);
const rowMenu = (page: Page) =>
  page.getByRole('menu', { name: /^Actions for / }).and(page.locator('[data-state="open"]'));
const announcer = (page: Page) => page.locator('.outline-announcer');
const dialogOf = (page: Page, name: string | RegExp) => page.getByRole('dialog', { name });

const textOf = (page: Page) =>
  page.evaluate(() => {
    type Linked = { view?: { state: { doc: { toString(): string } } } };
    const content = document.querySelector('.cm-content') as
      | (Element & { cmTile?: Linked; cmView?: Linked })
      | null;
    return (content?.cmTile ?? content?.cmView)?.view?.state.doc.toString() ?? '';
  });

async function undo(page: Page) {
  await showSource(page);
  await editor(page).focus();
  await page.keyboard.press('ControlOrMeta+z');
}

async function openWith(page: Page, text = SCRIPT) {
  await start(page);
  await setText(page, text);
  await runCommand(page, 'Show Outline');
  await expect(tree(page)).toBeVisible();
}

async function menuFor(page: Page, target: ReturnType<typeof row>) {
  await target.focus();
  await page.keyboard.press('Shift+F10');
  await expect(rowMenu(page)).toBeVisible();
}

async function openThreads(page: Page, target: ReturnType<typeof row>, heading: string) {
  await menuFor(page, target);
  await rowMenu(page).getByRole('menuitem', { name: 'Threads…' }).click();
  const dialog = dialogOf(page, `Threads for ${heading}`);
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('Threads… for a scene', () => {
  test('tags a scene from its menu in one undo', async ({ page }) => {
    await openWith(page);
    const dialog = await openThreads(page, hall(page), 'INT. HALL - DAY');
    await dialog.getByRole('textbox', { name: 'New thread' }).fill('A');
    await page.keyboard.press('Enter');
    await expect(dialog.getByRole('checkbox', { name: /^A/ })).toBeChecked();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
    await expect(hall(page)).toBeFocused();
    await expect.poll(() => textOf(page)).toContain('[[Thread: A]]');
    await undo(page);
    await expect.poll(() => textOf(page)).toBe(SCRIPT);
  });

  test('Cancel changes nothing; an existing thread is listed and checked', async ({ page }) => {
    await openWith(page);
    const dialog = await openThreads(page, yard(page), 'EXT. YARD - NIGHT');
    await expect(dialog.getByRole('checkbox', { name: /^A/ })).toBeChecked();
    await expect(dialog.getByRole('checkbox', { name: /^B/ })).toBeChecked();
    await dialog.getByRole('checkbox', { name: /^B/ }).uncheck();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    expect(await textOf(page)).toBe(SCRIPT);
  });

  test('refuses a label with ]] and says why', async ({ page }) => {
    await openWith(page);
    const dialog = await openThreads(page, hall(page), 'INT. HALL - DAY');
    const field = dialog.getByRole('textbox', { name: 'New thread' });
    await field.fill('a]]');
    await page.keyboard.press('Enter');
    await expect(dialog.getByRole('alert')).toContainText('can’t have [[ or ]]');
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    expect(await textOf(page)).toBe(SCRIPT);
  });

  test('more than 12 checked disables the rest', async ({ page }) => {
    await openWith(page);
    const dialog = await openThreads(page, hall(page), 'INT. HALL - DAY');
    const field = dialog.getByRole('textbox', { name: 'New thread' });
    for (let i = 1; i <= 12; i++) {
      await field.fill(`T${i}`);
      await page.keyboard.press('Enter');
    }
    await expect(dialog.getByText('A scene has at most 12 threads.')).toBeVisible();
    await field.fill('T13');
    await page.keyboard.press('Enter');
    await expect(dialog.getByRole('alert')).toHaveText('A scene has at most 12 threads.');
    await expect(dialog.getByRole('checkbox', { name: /^A/ })).toBeDisabled();
  });

  test('a hand-typed label that can’t be written is named when Save refuses', async ({ page }) => {
    const long = 'x'.repeat(41);
    const typed = SCRIPT.replace('= Ann arrives.', `= Ann arrives.\n[[Thread: ${long}]]`);
    await openWith(page, typed);
    const dialog = await openThreads(page, hall(page), 'INT. HALL - DAY');
    await dialog.getByRole('textbox', { name: 'New thread' }).fill('C');
    await page.keyboard.press('Enter');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByRole('alert')).toHaveText(
      `Thread ${long} can’t be saved: a label is at most 40 characters. Uncheck it to save.`,
    );
    await expect(dialog).toBeVisible();
    await dialog.getByRole('checkbox', { name: new RegExp(`^${long}`) }).uncheck();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => textOf(page)).toContain('[[Thread: C]]');
    expect(await textOf(page)).not.toContain(long);
  });

  test('opens from the palette for the cursor’s scene', async ({ page }) => {
    await start(page);
    await setText(page, SCRIPT);
    await showSource(page);
    await editor(page).getByText('Hi.').click();
    await runCommand(page, 'Threads…');
    const dialog = dialogOf(page, 'Threads for EXT. YARD - NIGHT');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('checkbox', { name: /^A/ }).uncheck();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => textOf(page)).toContain('[[Thread: B]]');
    await expect(editor(page)).toBeFocused();
  });

  test('is read-only in a script a stray /* locks, with the reason shown', async ({ page }) => {
    const stray =
      'INT. A - DAY\n\nA.\n\nINT. B - DAY\n\n[[Thread: X]]\n\nB. /* oops\n\n/* drafter\n{"v":1}\n*/\n';
    await openWith(page, stray);
    const why =
      'A /* in this script isn’t closed by its own */, so the outline changes nothing until it is.';
    const dialog = await openThreads(page, row(page, /^Scene 2, INT\. B - DAY/), 'INT. B - DAY');
    await expect(dialog).toContainText(why);
    const save = dialog.getByRole('button', { name: 'Save' });
    await expect(save).toHaveAttribute('aria-disabled', 'true');
    await expect(save).toHaveAccessibleDescription(why);
    await expect(dialog.getByRole('textbox', { name: 'New thread' })).toHaveAttribute(
      'readonly',
      '',
    );
    // The checks stay in the tab order, say why they can't change, and don't change.
    const check = dialog.getByRole('checkbox', { name: /^X/ });
    await expect(check).toBeChecked();
    await expect(check).not.toHaveAttribute('disabled');
    await expect(check).toHaveAttribute('aria-disabled', 'true');
    await expect(check).toHaveAccessibleDescription(why);
    await check.click({ force: true });
    await expect(check).toBeChecked();
    await check.focus();
    await expect(check).toBeFocused();
    await page.keyboard.press('Space');
    await expect(check).toBeChecked();
    await save.click({ force: true });
    await expect(announcer(page)).toHaveText(why);
    await expect(dialog).toBeVisible();
    expect(await textOf(page)).toBe(stray);
  });
});

test.describe('Threads… keeps unsaved work and the scene’s order', () => {
  test('a new label goes after the scene’s own, in its order', async ({ page }) => {
    await openWith(page, SCRIPT.replace('[[Thread: A, B]]', '[[Thread: B, A]]'));
    const dialog = await openThreads(page, yard(page), 'EXT. YARD - NIGHT');
    await dialog.getByRole('textbox', { name: 'New thread' }).fill('C');
    await page.keyboard.press('Enter');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => textOf(page)).toContain('[[Thread: B, A, C]]');
  });

  test('the thread menu is off while changes are unsaved, and works after Save', async ({
    page,
  }) => {
    await openWith(page);
    const dialog = await openThreads(page, yard(page), 'EXT. YARD - NIGHT');
    await dialog.getByRole('checkbox', { name: /^B/ }).uncheck();
    await dialog.getByRole('button', { name: 'Actions for thread A' }).click();
    const rename = page.getByRole('menuitem', { name: 'Rename thread…' });
    await expect(rename).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByRole('menu')).toContainText('Save or cancel your changes first.');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('checkbox', { name: /^B/ })).not.toBeChecked();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
    const again = await openThreads(page, yard(page), 'EXT. YARD - NIGHT');
    await again.getByRole('button', { name: 'Actions for thread A' }).click();
    await expect(page.getByRole('menuitem', { name: 'Rename thread…' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});

test.describe('a thread’s own menu', () => {
  async function openMenu(page: Page, item: string) {
    const dialog = await openThreads(page, yard(page), 'EXT. YARD - NIGHT');
    await dialog.getByRole('button', { name: 'Actions for thread A' }).click();
    await page.getByRole('menuitem', { name: item }).click();
    await expect(dialog).toBeHidden();
  }

  test('renames a thread everywhere and announces it', async ({ page }) => {
    await openWith(page);
    await openMenu(page, 'Rename thread…');
    const edit = dialogOf(page, 'Rename thread A');
    await expect(edit).toBeVisible();
    await edit.getByRole('textbox', { name: 'New label' }).fill('Heist');
    await edit.getByRole('button', { name: 'Rename' }).click();
    await expect(edit).toBeHidden();
    await expect.poll(() => textOf(page)).toContain('[[Thread: Heist, B]]');
    await expect(announcer(page)).toHaveText('Renamed thread A to Heist in 1 scene.');
    await undo(page);
    await expect.poll(() => textOf(page)).toBe(SCRIPT);
  });

  test('asks to merge when the new label is another thread', async ({ page }) => {
    await openWith(page);
    await openMenu(page, 'Rename thread…');
    const edit = dialogOf(page, 'Rename thread A');
    await edit.getByRole('textbox', { name: 'New label' }).fill('b');
    await edit.getByRole('button', { name: 'Rename' }).click();
    await expect(edit).toContainText('B is already a thread. Merge A into it?');
    await expect(edit.getByRole('button', { name: 'Merge' })).toBeFocused();
    await edit.getByRole('button', { name: 'Merge' }).click();
    await expect(edit).toBeHidden();
    await expect.poll(() => textOf(page)).toContain('[[Thread: B]]');
  });

  test('names and colors a thread', async ({ page }) => {
    await openWith(page);
    await openMenu(page, 'Name…');
    let edit = dialogOf(page, 'Name thread A');
    await edit.getByRole('textbox', { name: 'Name' }).fill('The heist');
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(edit).toBeHidden();
    await expect.poll(() => textOf(page)).toContain('"name":"The heist"');
    await openMenu(page, 'Color…');
    edit = dialogOf(page, 'Color thread A');
    await edit.getByRole('combobox', { name: 'Color' }).selectOption('teal');
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(edit).toBeHidden();
    await expect.poll(() => textOf(page)).toContain('"color":"teal"');
    await expect.poll(() => textOf(page)).toContain('"name":"The heist"');
  });

  test('removes a thread from every scene after asking with the count', async ({ page }) => {
    await openWith(page);
    await openMenu(page, 'Remove from every scene…');
    const edit = dialogOf(page, 'Remove thread A');
    await expect(edit).toContainText('Remove thread A from 1 scene?');
    await expect(edit.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await edit.getByRole('button', { name: 'Remove' }).click();
    await expect.poll(() => textOf(page)).toContain('[[Thread: B]]');
    await expect(announcer(page)).toHaveText('Removed thread A from 1 scene.');
    await undo(page);
    await expect.poll(() => textOf(page)).toBe(SCRIPT);
  });
});

test.describe('Threads… for a novel passage', () => {
  async function openSample(page: Page) {
    await start(page);
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page
      .getByRole('group', { name: 'Scripts', exact: true })
      .getByRole('button', { name: 'Novel', exact: true })
      .click();
    await expect(page.locator('.cm-content')).toContainText('Low Tide');
    await runCommand(page, 'Show Outline');
    await expect(tree(page)).toBeVisible();
  }

  test('tags a passage; only the file’s trailing comment changes', async ({ page }) => {
    await openSample(page);
    const before = await textOf(page);
    const chapter = row(page, /^The Salt Road, chapter/);
    await menuFor(page, chapter);
    await rowMenu(page).getByRole('menuitem', { name: 'Threads…' }).click();
    const dialog = dialogOf(page, 'Threads for The Salt Road');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox', { name: 'New thread' }).fill('A');
    await page.keyboard.press('Enter');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(async () => (await textOf(page)).includes('"threads"')).toBe(true);
    const after = await textOf(page);
    const cut = (s: string) => s.slice(0, s.lastIndexOf('<!--'));
    expect(cut(after)).toBe(cut(before));
    await undo(page);
    await expect.poll(() => textOf(page)).toBe(before);
  });
});

test.describe('a novel’s threads and its facts', () => {
  async function openSample(page: Page) {
    await start(page);
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page
      .getByRole('group', { name: 'Scripts', exact: true })
      .getByRole('button', { name: 'Novel', exact: true })
      .click();
    await expect(page.locator('.cm-content')).toContainText('Low Tide');
    await runCommand(page, 'Show Outline');
    await expect(tree(page)).toBeVisible();
  }
  const saltRoad = (page: Page) => row(page, /^The Salt Road, chapter/);
  const lowTide = (page: Page) => row(page, /^Low Tide, section/);
  /** The book's facts, from the trailing comment. */
  const factsOf = async (page: Page) => {
    const text = await textOf(page);
    const json = text.slice(text.lastIndexOf('<!--') + 4, text.lastIndexOf('-->'));
    const body = json.slice(json.indexOf('{'));
    return JSON.parse(body).novel as {
      nodes: Record<string, { status?: string; threads?: string[] }>;
      threads?: Record<string, { name?: string; color?: string }>;
    };
  };
  async function tag(page: Page, target: ReturnType<typeof row>, heading: string, label: string) {
    const dialog = await openThreads(page, target, heading);
    const existing = dialog.getByRole('checkbox', { name: new RegExp(`^${label}`) });
    if ((await existing.count()) > 0) await existing.check();
    else {
      await dialog.getByRole('textbox', { name: 'New thread' }).fill(label);
      await page.keyboard.press('Enter');
    }
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
  }

  test('setting a status from the Outline keeps the passage’s threads', async ({ page }) => {
    await openSample(page);
    await tag(page, saltRoad(page), 'The Salt Road', 'Tide');
    await expect
      .poll(async () => (await factsOf(page)).nodes['chapter:the-salt-road:0']?.threads)
      .toEqual(['Tide']);
    await saltRoad(page).locator('.status').click();
    await page.getByRole('menuitemradio', { name: 'Done' }).click();
    await expect(saltRoad(page)).toHaveAccessibleName(/, Done, thread Tide$/);
    await expect
      .poll(async () => (await factsOf(page)).nodes['chapter:the-salt-road:0'])
      .toEqual(expect.objectContaining({ status: 'done', threads: ['Tide'] }));
  });

  test('Name…, then Color…, then a tag keep the name and color, and the table shows them', async ({
    page,
  }) => {
    await openSample(page);
    await tag(page, saltRoad(page), 'The Salt Road', 'Tide');
    const action = async (item: string) => {
      const dialog = await openThreads(page, saltRoad(page), 'The Salt Road');
      await dialog.getByRole('button', { name: 'Actions for thread Tide' }).click();
      await page.getByRole('menuitem', { name: item }).click();
      await expect(dialog).toBeHidden();
    };
    await action('Name…');
    let edit = dialogOf(page, 'Name thread Tide');
    await edit.getByRole('textbox', { name: 'Name' }).fill('The sea');
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(edit).toBeHidden();
    await action('Color…');
    edit = dialogOf(page, 'Color thread Tide');
    await edit.getByRole('combobox', { name: 'Color' }).selectOption('teal');
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(edit).toBeHidden();
    await tag(page, lowTide(page), 'Low Tide', 'Tide');
    await expect
      .poll(async () => (await factsOf(page)).threads)
      .toEqual({ tide: { name: 'The sea', color: 'teal' } });
    expect((await factsOf(page)).nodes['section:low-tide:0']?.threads).toEqual(['Tide']);
    await runCommand(page, 'Show Lanes');
    await page.getByRole('button', { name: 'Lanes options' }).click();
    await page.getByRole('menuitemcheckbox', { name: 'Show as table' }).click();
    const table = page.getByRole('table', { name: 'Threads' });
    await expect(table).toBeVisible();
    await expect(table.getByRole('row', { name: /^Tide/ })).toContainText('The sea');
  });
});

// Thread chips (Task 8, design §7.6): a bar in the thread's color beside its label on a row and a
// card, named "thread A, The heist"; never the round dot a scene's color uses.
const CHIPS_SCRIPT = `${SCRIPT}/* drafter\n{"v":1,"threads":{"a":{"name":"The heist","color":"yellow"}}}\n*/\n`;
const chipsIn = (scope: ReturnType<Page['locator']>) => scope.locator('.thread-chip');

test.describe('thread chips', () => {
  test('an outline row shows one chip per thread, as a bar, named with the thread’s name', async ({
    page,
  }) => {
    await openWith(page, CHIPS_SCRIPT);
    const chips = chipsIn(yard(page));
    await expect(chips).toHaveCount(2);
    await expect(chips.nth(0)).toHaveText('A');
    await expect(chips.nth(0)).toHaveAttribute('aria-label', 'thread A, The heist');
    await expect(chips.nth(1)).toHaveText('B');
    await expect(chips.nth(1)).toHaveAttribute('aria-label', 'thread B');
    const bar = chips.nth(0).locator('.thread-bar');
    expect(await bar.evaluate((el) => [el.clientWidth, el.clientHeight])).toEqual([4, 16]);
    expect(await bar.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
      'rgb(229, 193, 58)',
    );
    // Not the round dot a scene's color uses.
    await expect(yard(page).locator('.swatch')).toHaveCount(0);
    await expect(chipsIn(hall(page))).toHaveCount(0);
    // The row's name says them too.
    await expect(yard(page)).toHaveAccessibleName(/thread A, The heist, thread B/);
  });

  test('a card shows the same chips', async ({ page }) => {
    await openWith(page, CHIPS_SCRIPT);
    await runCommand(page, 'Show Cards');
    const card = page
      .getByRole('listbox', { name: 'Cards' })
      .getByRole('option', { name: /EXT\. YARD - NIGHT/ });
    await expect(chipsIn(card)).toHaveCount(2);
    await expect(chipsIn(card).first()).toHaveAttribute('aria-label', 'thread A, The heist');
    await expect(card).toHaveAccessibleName(/thread A, The heist, thread B/);
  });

  test('a novel passage’s row and card show its chips', async ({ page }) => {
    await start(page);
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page
      .getByRole('group', { name: 'Scripts', exact: true })
      .getByRole('button', { name: 'Novel', exact: true })
      .click();
    await expect(page.locator('.cm-content')).toContainText('Low Tide');
    await runCommand(page, 'Show Outline');
    const chapter = row(page, /^The Salt Road, chapter/);
    await menuFor(page, chapter);
    await rowMenu(page).getByRole('menuitem', { name: 'Threads…' }).click();
    const dialog = dialogOf(page, 'Threads for The Salt Road');
    await dialog.getByRole('textbox', { name: 'New thread' }).fill('A');
    await page.keyboard.press('Enter');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
    await expect(chipsIn(chapter)).toHaveCount(1);
    await expect(chipsIn(chapter)).toHaveAttribute('aria-label', 'thread A');
    await expect(chipsIn(chapter)).toHaveText('A');
    await runCommand(page, 'Show Cards');
    await expect(chipsIn(page.locator('.novel-cards .card').first())).toHaveCount(1);
  });
});

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
for (const theme of ['dark', 'light'] as const) {
  test(`has no accessibility violations in the thread dialogs (${theme})`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('nuxt-color-mode', t), theme);
    await openWith(page);
    const check = async (state: string) => {
      await page.evaluate(() =>
        Promise.all(
          document
            .getAnimations()
            .filter((a) => a.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY)
            .filter((a) => !(a instanceof CSSAnimation && a.animationName.startsWith('cm-blink')))
            .map((a) => a.finished.catch(() => {})),
        ),
      );
      const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      expect(
        violations.map(({ id, nodes }) => `${id}: ${nodes.map((n) => n.target).join(', ')}`),
        state,
      ).toEqual([]);
    };
    const dialog = await openThreads(page, yard(page), 'EXT. YARD - NIGHT');
    await dialog.getByRole('textbox', { name: 'New thread' }).fill('a]]');
    await page.keyboard.press('Enter');
    await check('Threads… with a refusal');
    await dialog.getByRole('textbox', { name: 'New thread' }).fill('');
    await dialog.getByRole('button', { name: 'Actions for thread A' }).click();
    await page.getByRole('menuitem', { name: 'Color…' }).click();
    const edit = dialogOf(page, 'Color thread A');
    await expect(edit).toBeVisible();
    await check('the color dialog');
  });
}

// The Lanes view (Threads plan, Task 7): a row per thread along the work, then No thread; one
// Tab stop with the arrows between blocks; the table; the phone's list; the switch remembered.

const LANES_SCRIPT = [
  'Title: Lanes',
  '',
  'INT. HALL - DAY',
  '',
  '[[Thread: A]]',
  '',
  'Ann waits in the hall.',
  '',
  'EXT. YARD - NIGHT',
  '',
  '[[Thread: B]]',
  '',
  'Bob digs in the yard.',
  '',
  'INT. SHED - DAY',
  '',
  'Nobody is in the shed.',
  '',
  'INT. KITCHEN - DAY',
  '',
  '[[Thread: A, C]]',
  '',
  'Ann and Cy cook.',
  '',
  'EXT. ROAD - DAY',
  '',
  '[[Thread: C, B]]',
  '',
  'Cy and Bob walk the road.',
  '',
].join('\n');

const lanesGrid = (page: Page) => page.getByRole('grid', { name: 'Lanes' });
const laneRow = (page: Page, header: string | RegExp) =>
  lanesGrid(page)
    .getByRole('row')
    .filter({ has: page.getByRole('rowheader', { name: header }) });
const cell = (page: Page, header: string | RegExp, scene: number) =>
  laneRow(page, header).getByRole('gridcell', { name: new RegExp(`^Scene ${scene},`) });

/** The script, with the cursor in the hall, and the Outline as Lanes. */
async function openLanes(page: Page, text = LANES_SCRIPT, at = 'Ann waits in the hall.') {
  await start(page);
  await setText(page, text);
  await editor(page).getByText(at).click();
  await runCommand(page, 'Show Lanes');
}

test.describe('the Lanes', () => {
  test.skip(({ isMobile }) => isMobile, 'a phone shows the list instead (below)');

  test('a row per thread by first appearance, then No thread', async ({ page }) => {
    await openLanes(page);
    await expect(lanesGrid(page)).toBeVisible();
    await expect(lanesGrid(page).getByRole('rowheader')).toHaveText(['A', 'B', 'C', /^No thread/]);
    const headers = lanesGrid(page).getByRole('rowheader');
    await expect(headers.nth(0).getByRole('button')).toHaveAccessibleName('Thread A, 2 scenes');
    await expect(headers.nth(3)).toContainText('No thread');
    await expect(laneRow(page, /^Thread A/).getByRole('gridcell')).toHaveCount(2);
    await expect(laneRow(page, /^No thread/).getByRole('gridcell')).toHaveCount(1);
    await expect(cell(page, /^Thread C/, 4)).toHaveAccessibleName(
      /^Scene 4, INT\. KITCHEN - DAY, .+, threads A and C$/,
    );
    // The cursor's scene is marked in every row it is in, and is the tab stop.
    await expect(cell(page, /^Thread A/, 1)).toHaveAttribute('aria-current', 'location');
    await expect(lanesGrid(page).locator('[tabindex="0"]')).toHaveCount(1);
    await expect(cell(page, /^Thread A/, 1)).toHaveAttribute('tabindex', '0');
    // The switch says which view shows.
    await expect(page.getByRole('button', { name: 'Lanes', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('the arrows move between blocks, and Enter puts the cursor in that scene', async ({
    page,
  }) => {
    await openLanes(page);
    await cell(page, /^Thread A/, 1).focus();
    // Left from a row's first block is its header; Right comes back.
    await page.keyboard.press('ArrowLeft');
    await expect(
      laneRow(page, /^Thread A/).getByRole('button', { name: /^Thread A/ }),
    ).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(cell(page, /^Thread A/, 1)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(cell(page, /^Thread A/, 4)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(cell(page, /^Thread B/, 5)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(cell(page, /^Thread B/, 2)).toBeFocused();
    await page.keyboard.press('End');
    await expect(cell(page, /^Thread B/, 5)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(cell(page, /^Thread C/, 5)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(cell(page, /^No thread/, 3)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(cell(page, /^No thread/, 3)).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(cell(page, /^Thread C/, 4)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(cell(page, /^Thread C/, 4)).toHaveAttribute('aria-current', 'location');
    await expect(cell(page, /^Thread A/, 4)).toHaveAttribute('aria-current', 'location');
    await expect(cell(page, /^Thread A/, 1)).not.toHaveAttribute('aria-current', 'location');
  });

  test('a block’s menu is the scene menu, and Threads… from it tags the scene', async ({
    page,
  }) => {
    await openLanes(page);
    await cell(page, /^No thread/, 3).focus();
    await page.keyboard.press('Shift+F10');
    const menu = page.getByRole('menu').and(page.locator('[data-state="open"]'));
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Scene details…' })).toBeVisible();
    await menu.getByRole('menuitem', { name: 'Threads…' }).click();
    const dialog = dialogOf(page, 'Threads for INT. SHED - DAY');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('checkbox', { name: /^B/ }).check();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => textOf(page)).toContain('INT. SHED - DAY\n\n[[Thread: B]]');
    // No unit is left without a thread: the No thread row goes.
    await expect(lanesGrid(page).getByRole('rowheader')).toHaveText(['A', 'B', 'C']);
    await expect(laneRow(page, /^Thread B/).getByRole('gridcell')).toHaveCount(3);
  });

  test('the focused block shows a ⋯ that opens its menu', async ({ page }) => {
    await openLanes(page);
    const block = cell(page, /^Thread C/, 4);
    await expect(block).toHaveAttribute('aria-keyshortcuts', 'Enter Shift+F10');
    const more = page.getByRole('button', { name: 'Actions for Scene 4, INT. KITCHEN - DAY' });
    await expect(more).toHaveCount(0);
    await block.focus();
    await expect(more).toBeVisible();
    await expect(more).toHaveAttribute('tabindex', '-1');
    await more.click();
    const menu = page.getByRole('menu').and(page.locator('[data-state="open"]'));
    await expect(menu.getByRole('menuitem', { name: 'Threads…' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(block).toBeFocused();
  });

  test('Left from a row’s first block is its header, whose keys open its menu', async ({
    page,
  }) => {
    await openLanes(page);
    await cell(page, /^Thread B/, 2).focus();
    await page.keyboard.press('ArrowLeft');
    const head = laneRow(page, /^Thread B/).getByRole('button', { name: 'Thread B, 2 scenes' });
    await expect(head).toBeFocused();
    await expect(head).toHaveAttribute('tabindex', '0');
    // Down is the next header, not the menu's button opening.
    await page.keyboard.press('ArrowDown');
    const c = laneRow(page, /^Thread C/).getByRole('button', { name: 'Thread C, 2 scenes' });
    await expect(c).toBeFocused();
    await expect(page.getByRole('menu')).toHaveCount(0);
    await page.keyboard.press('ArrowRight');
    await expect(cell(page, /^Thread C/, 4)).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Shift+F10');
    await expect(page.getByRole('menuitem', { name: 'Rename thread…' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(c).toBeFocused();
    // One Tab stop still: the header is it now.
    await expect(lanesGrid(page).locator('[tabindex="0"]')).toHaveCount(1);
  });

  test('Escape hides the card and keeps focus on the block', async ({ page }) => {
    await openLanes(page);
    const block = cell(page, /^Thread A/, 4);
    await block.focus();
    const card = page.locator('.lanes .card');
    await expect(card).toContainText('Scene 4, INT. KITCHEN - DAY');
    await page.keyboard.press('Escape');
    await expect(card).toHaveCount(0);
    await expect(block).toBeFocused();
  });

  test('a row header’s menu renames the thread', async ({ page }) => {
    await openLanes(page);
    await laneRow(page, /^Thread A/)
      .getByRole('button', { name: 'Thread A, 2 scenes' })
      .click();
    await page.getByRole('menuitem', { name: 'Rename thread…' }).click();
    const edit = dialogOf(page, 'Rename thread A');
    await edit.getByRole('textbox', { name: 'New label' }).fill('Heist');
    await edit.getByRole('button', { name: 'Rename' }).click();
    await expect(edit).toBeHidden();
    await expect(lanesGrid(page).getByRole('rowheader')).toHaveText([
      'Heist',
      'B',
      'C',
      /^No thread/,
    ]);
  });

  test('the table lists the same threads and counts', async ({ page }) => {
    await openLanes(page);
    await expect(lanesGrid(page)).toBeVisible();
    await page.getByRole('button', { name: 'Lanes options' }).click();
    await page.getByRole('menuitemcheckbox', { name: 'Show as table' }).click();
    const table = page.getByRole('table', { name: 'Threads' });
    await expect(table).toBeVisible();
    await expect(lanesGrid(page)).toBeHidden();
    await expect(table.getByRole('columnheader')).toHaveText([
      'Thread',
      'Name',
      'Scenes',
      /^(Pages|Words)$/,
      'Share',
    ]);
    const lists = table.locator('tbody tr').locator('td:nth-child(3)');
    await expect(lists).toHaveText(['1, 4', '2, 5', '4, 5', '3']);
    await expect(table.getByRole('rowheader')).toHaveText(['A', 'B', 'C', /^No thread/]);
    await expect(table.getByRole('button', { name: 'Actions for thread A' })).toBeVisible();
  });

  test('the switch is remembered after a reload, and Tree goes back', async ({ page }) => {
    await openLanes(page);
    await expect(lanesGrid(page)).toBeVisible();
    await expect.poll(async () => (await stored(page)).outlineView).toBe('lanes');
    await page.reload();
    await expect(editor(page)).toBeAttached();
    await runCommand(page, 'Show Outline');
    await expect(page.getByRole('button', { name: 'Lanes', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(lanesGrid(page).or(page.getByText('No threads yet.'))).toBeVisible();
    await page.getByRole('button', { name: 'Tree', exact: true }).click();
    await expect(tree(page)).toBeVisible();
    await expect.poll(async () => (await stored(page)).outlineView).toBe('tree');
  });

  test('says how to add a thread when there are none', async ({ page }) => {
    await openLanes(page, 'INT. HALL - DAY\n\nAnn waits.\n', 'Ann waits.');
    await expect(
      page.getByText('No threads yet. Add one from a scene’s menu: Threads…'),
    ).toBeVisible();
  });

  test('a novel’s passages as lanes', async ({ page }) => {
    await start(page);
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page
      .getByRole('group', { name: 'Scripts', exact: true })
      .getByRole('button', { name: 'Novel', exact: true })
      .click();
    await expect(page.locator('.cm-content')).toContainText('Low Tide');
    await runCommand(page, 'Show Lanes');
    await expect(
      page.getByText('No threads yet. Add one from a chapter’s or section’s menu: Threads…'),
    ).toBeVisible();
  });
});

// A tablet (Threads review, fix round 1): the grid, by touch. iPadOS Safari fires no contextmenu
// on a long press, so the focused block's ⋯ is a touch's way to its menu.
test.describe('the Lanes on a tablet', () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true });

  test('a first tap focuses a block and shows its ⋯; the ⋯ opens the scene menu', async ({
    page,
  }) => {
    await openLanes(page);
    const block = cell(page, /^Thread C/, 4);
    await block.tap();
    await expect(block).toBeFocused();
    // The first tap only focused: the cursor is still in the hall.
    await expect(cell(page, /^Thread A/, 1)).toHaveAttribute('aria-current', 'location');
    const more = page.getByRole('button', { name: 'Actions for Scene 4, INT. KITCHEN - DAY' });
    await more.tap();
    const menu = page.getByRole('menu').and(page.locator('[data-state="open"]'));
    await expect(menu.getByRole('menuitem', { name: 'Threads…' })).toBeVisible();
  });
});

test.describe('the Lanes in a Markdown document', () => {
  test('offer no switch, and the palette no Lanes', async ({ page }) => {
    await start(page);
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page
      .getByRole('group', { name: 'Scripts', exact: true })
      .getByRole('button', { name: 'New Markdown document' })
      .click();
    await expect(editor(page)).toContainText('# Untitled');
    await runCommand(page, 'Show Source');
    // The palette offers no command that is off; its reason is the menus' (useCommandMenu).
    await page.keyboard.press('ControlOrMeta+k');
    await palette(page).locator('input').fill('Show Lanes');
    await expect(palette(page).getByRole('option', { name: /Show Lanes/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Lanes', exact: true })).toHaveCount(0);
  });
});

test.describe('the Lanes on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'the list is the phone’s');

  test('a list grouped by thread, then No thread', async ({ page }) => {
    await openLanes(page);
    const groups = page.getByRole('heading', { level: 2 });
    await expect(groups).toHaveText([/^A/, /^B/, /^C/, /^No thread/]);
    await expect(
      page.getByRole('list', { name: 'Thread A, 2 scenes' }).getByRole('button'),
    ).toHaveText([/^Scene 1, INT\. HALL - DAY/, /^Scene 4, INT\. KITCHEN - DAY/]);
    await expect(lanesGrid(page)).toHaveCount(0);
    // The list has no table: no Lanes options.
    await expect(page.getByRole('button', { name: 'Lanes options' })).toHaveCount(0);
  });
});

for (const theme of ['dark', 'light'] as const) {
  test(`has no accessibility violations in the Lanes, table, and list (${theme})`, async ({
    page,
    isMobile,
  }) => {
    await page.addInitScript((t) => localStorage.setItem('nuxt-color-mode', t), theme);
    await openLanes(page);
    const check = async (state: string) => {
      await page.evaluate(() =>
        Promise.all(
          document
            .getAnimations()
            .filter((a) => a.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY)
            .filter((a) => !(a instanceof CSSAnimation && a.animationName.startsWith('cm-blink')))
            .map((a) => a.finished.catch(() => {})),
        ),
      );
      const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      expect(
        violations.map(({ id, nodes }) => `${id}: ${nodes.map((n) => n.target).join(', ')}`),
        state,
      ).toEqual([]);
    };
    if (isMobile) {
      await expect(page.getByRole('heading', { name: 'Thread A, 2 scenes' })).toBeVisible();
      await check('the list');
      return;
    }
    await expect(lanesGrid(page)).toBeVisible();
    await cell(page, /^Thread A/, 1).focus();
    await check('the grid, a block focused with its card');
    await page.getByRole('button', { name: 'Lanes options' }).click();
    await page.getByRole('menuitemcheckbox', { name: 'Show as table' }).click();
    await expect(page.getByRole('table', { name: 'Threads' })).toBeVisible();
    await check('the table');
  });
}

// The long-task budget, as the strip's (script.spec.ts): typing with the Lanes shown computes them
// only after typing pauses. CI skips it by name ("long task"); run it alone, one worker.
test.describe('Typing with the Lanes shown', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'long tasks are a Chromium API');
  test.skip(
    () => !process.env.DRAFTER_LONG_TASK,
    'a release gate step of its own: DRAFTER_LONG_TASK=1, alone, one worker',
  );

  test('typing for 5 s in a long script with the Lanes shown makes no long task', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'the grid is the wide screen’s');
    test.setTimeout(180_000);
    const threadsOf = ['A', 'B', 'C', 'A, C', '', 'B'];
    const script = longScript()
      .split(/\n(?=(?:INT|EXT)\. )/)
      .map((scene, i) => {
        const tag = threadsOf[i % threadsOf.length];
        return tag ? scene.replace(/\n\n/, `\n\n[[Thread: ${tag}]]\n\n`) : scene;
      })
      .join('\n');
    await start(page);
    await pasteText(page, script);
    await runCommand(page, 'Show Lanes');
    await expect(lanesGrid(page).getByRole('rowheader')).toHaveCount(4);
    await settled(page);
    await page.evaluate(() => {
      const long: number[] = [];
      (window as unknown as { longTasks: number[] }).longTasks = long;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) long.push(entry.duration);
      }).observe({ type: 'longtask', buffered: false });
    });
    const longTasks = () =>
      page.evaluate(() => (window as unknown as { longTasks: number[] }).longTasks);
    // Proof the observer sees what it should: a task of about 80 ms is reported once.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          setTimeout(() => {
            const end = performance.now() + 80;
            while (performance.now() < end);
            resolve();
          }),
        ),
    );
    await expect.poll(async () => (await longTasks()).length).toBe(1);
    await showSource(page);
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+Home');
    await page.evaluate(() => {
      (window as unknown as { longTasks: number[] }).longTasks.length = 0;
    });
    // About 5 s of typing: 84 letters, one every 60 ms.
    const phrase =
      'Typing with the Lanes shown, one letter at a time, as a writer does, for five secs.';
    expect(phrase.length).toBeGreaterThanOrEqual(80);
    await page.keyboard.type(phrase, { delay: 60 });
    // The pause after typing: the lanes are read again, once.
    await page.waitForTimeout(1000);
    await settled(page);
    // The lanes kept up: the grid is still drawn, its four rows read again after the pause.
    await expect(lanesGrid(page).getByRole('rowheader')).toHaveCount(4);
    expect(await longTasks()).toEqual([]);
  });
});
