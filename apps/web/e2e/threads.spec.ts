import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from './fixtures';
import { editor, runCommand, setText, showSource, start } from './modules';

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
    const stray = 'INT. A - DAY\n\nA.\n\nINT. B - DAY\n\nB. /* oops\n\n/* drafter\n{"v":1}\n*/\n';
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
