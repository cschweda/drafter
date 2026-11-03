import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { runCommand, settled, showSource, start } from './modules';

// The Outline for a novel (Novel plan, Task 5): the sample novel's parts, chapters, and sections
// with their words, targets, and statuses; Alt+Up and Alt+Down and dragging move a passage with its
// text; a synopsis and a status are kept in the file's comment and are there after a reload.

const tree = (page: Page) => page.getByRole('tree', { name: 'Outline' });
const row = (page: Page, name: string | RegExp) => tree(page).getByRole('treeitem', { name });
const saltRoad = (page: Page) => row(page, /^The Salt Road, chapter/);
const letter = (page: Page) => row(page, /^A Letter in Another Hand, chapter/);
const announcer = (page: Page) => page.locator('.outline-announcer');
const rowMenu = (page: Page) =>
  page.getByRole('menu', { name: /^Actions for / }).and(page.locator('[data-state="open"]'));

/** The sources of the projects stored in Drafter's database. */
function storedSources(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const open = indexedDB.open('drafter');
        open.onerror = () => resolve([]);
        open.onsuccess = () => {
          const db = open.result;
          const request = db.transaction('projects').objectStore('projects').getAll();
          request.onsuccess = () => {
            db.close();
            resolve((request.result as Array<{ source: string }>).map((p) => p.source));
          };
          request.onerror = () => {
            db.close();
            resolve([]);
          };
        };
      }),
  );
}

/** The whole book, from the editor's state (the page draws only the lines in view). */
const textOf = (page: Page) =>
  page.evaluate(() => {
    type Linked = { view?: { state: { doc: { toString(): string } } } };
    const content = document.querySelector('.cm-content') as
      | (Element & { cmTile?: Linked; cmView?: Linked })
      | null;
    return (content?.cmTile ?? content?.cmView)?.view?.state.doc.toString() ?? '';
  });

/** The line holding the editor's cursor. */
const cursorLine = (page: Page) =>
  page.evaluate(() => {
    type Linked = {
      view?: {
        state: {
          selection: { main: { head: number } };
          doc: { lineAt(pos: number): { text: string } };
        };
      };
    };
    const content = document.querySelector('.cm-content') as
      | (Element & { cmTile?: Linked; cmView?: Linked })
      | null;
    const state = (content?.cmTile ?? content?.cmView)?.view?.state;
    return state ? state.doc.lineAt(state.selection.main.head).text : '';
  });

/** The headings in the book's text, in order. */
const headings = async (page: Page) =>
  (await textOf(page)).split('\n').filter((line) => /^#{1,2} /.test(line));

/** Opens the sample novel (the Scripts menu's Samples) and shows its Outline. */
async function openSample(page: Page) {
  await start(page);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page
    .getByRole('group', { name: 'Scripts', exact: true })
    .getByRole('button', { name: 'Novel', exact: true })
    .click();
  await expect(page.locator('.cm-content')).toContainText('Low Tide');
  await expect(page.getByRole('group', { name: 'Scripts', exact: true })).toBeHidden();
  await settled(page);
  await showOutline(page);
}

async function showOutline(page: Page) {
  await runCommand(page, 'Show Outline');
  await expect(tree(page)).toBeVisible();
}

async function menuFor(page: Page, target: ReturnType<typeof row>) {
  await target.focus();
  await page.keyboard.press('Shift+F10');
  await expect(rowMenu(page)).toBeVisible();
}

test.describe('the Outline for a novel', () => {
  test("lists the sample's parts, chapters, and sections with their words", async ({ page }) => {
    await openSample(page);
    await expect(tree(page).getByRole('treeitem')).toHaveCount(11);
    await expect(row(page, 'Part One, part, 634 words')).toHaveAttribute('aria-level', '1');
    await expect(saltRoad(page)).toHaveAccessibleName(
      'The Salt Road, chapter, 275 words, 23% of a 1,200-word target, Revised',
    );
    await expect(saltRoad(page)).toHaveAttribute('aria-level', '2');
    await expect(row(page, 'Low Tide, section, 142 words')).toHaveAttribute('aria-level', '3');
    await expect(row(page, 'Scene break, section, 38 words')).toBeVisible();
    // A chapter with no target shows none, and its synopsis is its description.
    await expect(
      row(page, 'The Night Watch, chapter, 160 words, To do'),
    ).toHaveAccessibleDescription('Wren takes Alder up to the light.');
    await expect(saltRoad(page).locator('.target')).toHaveText('23% of 1,200');
    await expect(row(page, /^The Night Watch, chapter/).locator('.target')).toHaveCount(0);
    // Words, chapters, and sections: never a script's words.
    await expect(tree(page)).not.toContainText(/scene heading|INT\.|\d pages?\b|\bpp?\.\s/i);
  });

  test('Enter goes to the passage in the Source', async ({ page }) => {
    await openSample(page);
    await row(page, /^The Visitor, section/).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.cm-content')).toBeFocused();
    await expect.poll(() => cursorLine(page)).toBe('## The Visitor');
  });

  test('Alt+Down moves a chapter, the text and its facts follow, and one undo puts it back', async ({
    page,
  }) => {
    await openSample(page);
    const before = await textOf(page);
    await saltRoad(page).focus();
    await page.keyboard.press('Alt+ArrowDown');
    await expect
      .poll(() => headings(page))
      .toEqual([
        '# Part One',
        '# A Letter in Another Hand',
        '## The Page',
        '## The Visitor',
        '# The Salt Road',
        '## Low Tide',
        '## What the Sand Kept',
        '# The Night Watch',
        '## Climbing',
        '## The Turning Light',
      ]);
    await expect(saltRoad(page)).toBeFocused();
    await expect(saltRoad(page)).toHaveAccessibleName(/, Revised$/);
    await expect(announcer(page)).toHaveText(
      'Moved The Salt Road. It is chapter 2 of 3, in Part One.',
    );
    // The comment is still the last line.
    expect((await textOf(page)).trimEnd().endsWith('-->')).toBe(true);
    // Undo from the Outline, and focus stays.
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => textOf(page)).toBe(before);
    await expect(saltRoad(page)).toBeFocused();
    // Alt+Up at the top says so.
    const part = row(page, /^Part One, part/);
    await part.focus();
    await page.keyboard.press('Alt+ArrowUp');
    await expect(announcer(page)).toHaveText('Part One can’t move further up.');
    await expect(part).toBeFocused();
  });

  test('dragging a section into another chapter moves it', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'a phone moves rows from their menu');
    await openSample(page);
    const target = row(page, /^The Page, section/);
    const box = await target.boundingBox();
    if (!box) throw new Error('no row');
    const lines = page.locator('.row.drop-above, .row.drop-below');
    // By hand, so the drop line can be seen on the way: over the row, out of the tree, and back.
    const source = await row(page, /^What the Sand Kept, section/).boundingBox();
    if (!source) throw new Error('no row');
    await page.mouse.move(source.x + 20, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 20, box.y + box.height / 2, { steps: 5 });
    await page.mouse.move(box.x + 20, box.y + box.height - 3, { steps: 3 });
    await expect(target).toHaveClass(/\bdrop-below\b/);
    await expect(lines).toHaveCount(1);
    // Out of the tree, over the editor: the line goes.
    const outside = await page.locator('.cm-content').boundingBox();
    if (!outside) throw new Error('no editor');
    await page.mouse.move(outside.x + 40, outside.y + 40, { steps: 5 });
    await expect(lines).toHaveCount(0);
    await page.mouse.move(box.x + 20, box.y + box.height / 2, { steps: 5 });
    await page.mouse.move(box.x + 20, box.y + box.height - 3, { steps: 3 });
    await expect(target).toHaveClass(/\bdrop-below\b/);
    await page.mouse.up();
    await expect
      .poll(() => headings(page))
      .toEqual([
        '# Part One',
        '# The Salt Road',
        '## Low Tide',
        '# A Letter in Another Hand',
        '## The Page',
        '## What the Sand Kept',
        '## The Visitor',
        '# The Night Watch',
        '## Climbing',
        '## The Turning Light',
      ]);
    await expect(row(page, /^What the Sand Kept, section/)).toBeFocused();
    await expect(lines).toHaveCount(0);
  });

  test('a row’s menu moves it, as a phone does', async ({ page }) => {
    await openSample(page);
    await menuFor(page, row(page, /^Climbing, section/));
    await rowMenu(page).getByRole('menuitem', { name: 'Move section down' }).click();
    await expect
      .poll(async () => (await headings(page)).slice(-2))
      .toEqual(['## The Turning Light', '## Climbing']);
    await expect(row(page, /^Climbing, section/)).toBeFocused();
  });

  test('a synopsis and a status are kept in the file, and are there after a reload', async ({
    page,
  }) => {
    await openSample(page);
    const visitor = row(page, /^The Visitor, section/);
    await menuFor(page, visitor);
    await rowMenu(page).getByRole('menuitem', { name: 'Edit synopsis' }).click();
    const field = page.getByRole('textbox', { name: 'Synopsis of The Visitor' });
    await expect(field).toBeFocused();
    await field.fill('Alder comes to the gate.');
    await page.keyboard.press('Enter');
    await expect(visitor).toBeFocused();
    await expect(visitor).toHaveAccessibleDescription('Alder comes to the gate.');

    await menuFor(page, visitor);
    await rowMenu(page).getByRole('menuitem', { name: 'Status' }).click();
    await page.getByRole('menuitemradio', { name: 'Draft' }).click();
    await expect(row(page, 'The Visitor, section, 78 words, Draft')).toBeVisible();
    await expect(announcer(page)).toHaveText('The Visitor is Draft.');

    // Both live in the comment, and the text above it is as it was.
    await showSource(page);
    await expect
      .poll(() => textOf(page))
      .toContain(
        '"section:the-visitor:0":{"status":"draft","synopsis":"Alder comes to the gate."}',
      );
    await expect
      .poll(async () => (await storedSources(page)).some((s) => s.includes('Alder comes to')))
      .toBe(true);
    await page.reload();
    await expect(page.locator('.cm-content')).toContainText('Low Tide');
    await showOutline(page);
    await expect(row(page, 'The Visitor, section, 78 words, Draft')).toHaveAccessibleDescription(
      'Alder comes to the gate.',
    );
  });

  test('leaving the synopsis field keeps what was typed', async ({ page, isMobile }) => {
    await openSample(page);
    const visitor = row(page, /^The Visitor, section/);
    await menuFor(page, visitor);
    await rowMenu(page).getByRole('menuitem', { name: 'Edit synopsis' }).click();
    const field = page.getByRole('textbox', { name: 'Synopsis of The Visitor' });
    await expect(field).toBeFocused();
    await field.fill('Kept on Tab.');
    await page.keyboard.press('Tab');
    await expect(field).toHaveCount(0);
    await expect(visitor).toHaveAccessibleDescription('Kept on Tab.');
    // A click into the Source keeps focus there; a phone shows one pane, so only the Tab above.
    if (isMobile) return;
    await menuFor(page, visitor);
    await rowMenu(page).getByRole('menuitem', { name: 'Edit synopsis' }).click();
    await page.getByRole('textbox', { name: 'Synopsis of The Visitor' }).fill('Kept on click.');
    await page.locator('.cm-content').click();
    await expect(visitor).toHaveAccessibleDescription('Kept on click.');
    await expect(page.locator('.cm-content')).toBeFocused();
  });

  test('sets a status with the keyboard only', async ({ page }) => {
    await openSample(page);
    const target = row(page, /^Climbing, section/);
    await target.focus();
    await page.keyboard.press('Shift+F10');
    await expect(rowMenu(page)).toBeVisible();
    const status = rowMenu(page).getByRole('menuitem', { name: 'Status' });
    for (let i = 0; i < 8 && !(await status.evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press('ArrowDown');
    }
    await expect(status).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('menuitemradio', { name: 'Draft' })).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(target).toHaveAccessibleName(/, (To do|Draft|Revised|Done)$/);
    await expect(target).toBeFocused();
  });

  test('the status button picks a status with a pointer', async ({ page }) => {
    await openSample(page);
    // The button is a pointer's: the row's name says the status, and its menu sets it.
    await letter(page).locator('.status').click();
    await page.getByRole('menuitemradio', { name: 'Done' }).click();
    await expect(letter(page)).toHaveAccessibleName(/, Done$/);
    await expect(letter(page)).toBeFocused();
  });

  test('renaming a chapter in the Source keeps its facts', async ({ page }) => {
    await openSample(page);
    await showSource(page);
    // The cursor after the heading, which may be out of view, as a click there would leave it.
    await page.evaluate((heading) => {
      type Linked = {
        view?: {
          state: { doc: { toString(): string } };
          dispatch(spec: unknown): void;
          focus(): void;
        };
      };
      const content = document.querySelector('.cm-content') as
        | (Element & { cmTile?: Linked; cmView?: Linked })
        | null;
      const view = (content?.cmTile ?? content?.cmView)?.view;
      if (!view) return;
      const at = view.state.doc.toString().indexOf(heading) + heading.length;
      view.dispatch({
        selection: { anchor: at },
        scrollIntoView: true,
        userEvent: 'select.pointer',
      });
      view.focus();
    }, '# The Night Watch');
    await page.keyboard.type(' Again');
    await showOutline(page);
    await expect(
      row(page, 'The Night Watch Again, chapter, 161 words, To do'),
    ).toHaveAccessibleDescription('Wren takes Alder up to the light.');
  });
});

// axe on what the novel's Outline adds, in both themes, in every project.
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function clean(page: Page, state: string) {
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
}

for (const theme of ['dark', 'light'] as const) {
  test.describe(`the novel's Outline in the ${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('nuxt-color-mode', t), theme);
      await openSample(page);
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`));
    });

    test(`passes axe on the novel's Outline (${theme})`, async ({ page }) => {
      await expect(saltRoad(page)).toBeVisible();
      await clean(page, "the novel's Outline");
      await menuFor(page, saltRoad(page));
      await clean(page, "a row's menu");
      await rowMenu(page).getByRole('menuitem', { name: 'Status' }).click();
      await expect(page.getByRole('menuitemradio', { name: 'Draft' })).toBeVisible();
      await clean(page, 'the statuses');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await menuFor(page, letter(page));
      await rowMenu(page).getByRole('menuitem', { name: 'Edit synopsis' }).click();
      await expect(page.getByRole('textbox', { name: /^Synopsis of/ })).toBeFocused();
      await clean(page, 'editing a synopsis');
    });
  });
}
