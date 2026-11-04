import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { runCommand, settled, showSource, start, viewTool } from './modules';

// Cards for a novel (Novel plan, Task 6): a card for each chapter and section of the sample, under
// its part's title, with its words, status, and synopsis; dragging a card (or its menu, or Alt+Arrow)
// moves the passage with its text; the card size is the script Cards'; Enter goes to the passage.

const cards = (page: Page) => page.getByRole('listbox', { name: 'Cards' });
const card = (page: Page, name: string | RegExp) => cards(page).getByRole('option', { name });
const saltRoad = (page: Page) => card(page, /^The Salt Road, chapter/);
const climbing = (page: Page) => card(page, /^Climbing, section/);
const cardMenu = (page: Page) =>
  page.getByRole('menu', { name: /^Actions for / }).and(page.locator('[data-state="open"]'));

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

const headings = async (page: Page) =>
  (await textOf(page)).split('\n').filter((line) => /^#{1,2} /.test(line));

/** The cards' titles, in the order drawn. */
const order = (page: Page) =>
  cards(page)
    .locator('[role="option"] .heading')
    .evaluateAll((els) => els.map((el) => el.textContent?.trim() ?? ''));

const SAMPLE_ORDER = [
  'The Salt Road',
  'Low Tide',
  'What the Sand Kept',
  'Scene break',
  'A Letter in Another Hand',
  'The Page',
  'The Visitor',
  'The Night Watch',
  'Climbing',
  'The Turning Light',
];

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
  await runCommand(page, 'Show Cards');
  await expect(cards(page)).toBeVisible();
}

async function menuFor(page: Page, target: ReturnType<typeof card>) {
  await target.focus();
  await page.keyboard.press('Shift+F10');
  await expect(cardMenu(page)).toBeVisible();
}

test.describe('Cards for a novel', () => {
  test("shows the sample's chapters and sections, in order, under their part", async ({ page }) => {
    await openSample(page);
    await expect(cards(page).getByRole('option')).toHaveCount(10);
    await expect.poll(() => order(page)).toEqual(SAMPLE_ORDER);
    await expect(cards(page).getByRole('group', { name: 'Part One' })).toBeVisible();
    await expect(saltRoad(page)).toHaveAccessibleName(
      'The Salt Road, chapter, 275 words, 22% of a 1,200-word target, Revised',
    );
    await expect(saltRoad(page)).toContainText('22% of 1,200');
    await expect(saltRoad(page)).toContainText('Revised');
    await expect(card(page, 'Low Tide, section, 142 words')).toBeVisible();
    await expect(card(page, 'Scene break, section, 38 words')).toBeVisible();
    // A synopsis is the card's description.
    await expect(card(page, /^The Night Watch, chapter/)).toHaveAccessibleDescription(
      'Wren takes Alder up to the light.',
    );
    // Words, chapters, and sections: never a script's words.
    await expect(cards(page)).not.toContainText(/scene heading|INT\.|\d pages?\b|\bpp?\.\s/i);
  });

  test('Enter goes to the passage in the Source', async ({ page }) => {
    await openSample(page);
    await card(page, /^The Visitor, section/).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.cm-content')).toBeFocused();
    await expect.poll(() => cursorLine(page)).toBe('## The Visitor');
  });

  test('Alt+Right moves a chapter, and one undo puts it back', async ({ page }) => {
    await openSample(page);
    const before = await textOf(page);
    await saltRoad(page).focus();
    await page.keyboard.press('Alt+ArrowRight');
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
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => textOf(page)).toBe(before);
    await expect(saltRoad(page)).toBeFocused();
  });

  test('dragging a card moves the passage with its text', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'a phone moves cards from their menu');
    await openSample(page);
    await expect(climbing(page)).toHaveAttribute('draggable', 'true');
    const page_ = card(page, /^The Page, section/);
    const box = await page_.boundingBox();
    if (!box) throw new Error('no card');
    await climbing(page).dragTo(page_, { targetPosition: { x: 4, y: 4 } });
    await expect
      .poll(() => headings(page))
      .toEqual([
        '# Part One',
        '# The Salt Road',
        '## Low Tide',
        '## What the Sand Kept',
        '# A Letter in Another Hand',
        '## Climbing',
        '## The Page',
        '## The Visitor',
        '# The Night Watch',
        '## The Turning Light',
      ]);
    await expect(climbing(page)).toBeFocused();
    await expect(
      page.locator('.card.drop-left, .card.drop-right, .card.drop-above, .card.drop-below'),
    ).toHaveCount(0);
    expect((await textOf(page)).trimEnd().endsWith('-->')).toBe(true);
  });

  test('a card’s menu moves it and sets its status, as a phone does', async ({ page }) => {
    await openSample(page);
    await menuFor(page, climbing(page));
    await cardMenu(page).getByRole('menuitem', { name: 'Move section down' }).click();
    await expect
      .poll(async () => (await headings(page)).slice(-2))
      .toEqual(['## The Turning Light', '## Climbing']);
    await expect(climbing(page)).toBeFocused();

    await menuFor(page, climbing(page));
    await cardMenu(page).getByRole('menuitem', { name: 'Edit synopsis' }).click();
    const field = page.getByRole('textbox', { name: 'Synopsis of Climbing' });
    await expect(field).toBeFocused();
    await field.fill('Up the stairs.');
    await page.keyboard.press('Enter');
    await expect(climbing(page)).toBeFocused();
    await expect(climbing(page)).toHaveAccessibleDescription('Up the stairs.');

    await menuFor(page, climbing(page));
    await cardMenu(page).getByRole('menuitem', { name: 'Status' }).click();
    await page.getByRole('menuitemradio', { name: 'Draft' }).click();
    await expect(card(page, /^Climbing, section, .*Draft$/)).toBeVisible();
    await showSource(page);
    await expect.poll(() => textOf(page)).toContain('"synopsis":"Up the stairs."');
  });

  test('the status on a card picks a status with a pointer', async ({ page }) => {
    await openSample(page);
    await saltRoad(page).locator('.status').click();
    await page.getByRole('menuitemradio', { name: 'Done' }).click();
    await expect(saltRoad(page)).toHaveAccessibleName(/, Done$/);
    await expect(saltRoad(page)).toBeFocused();
  });

  test('leaving the synopsis field keeps what was typed', async ({ page, isMobile }) => {
    await openSample(page);
    await menuFor(page, climbing(page));
    await cardMenu(page).getByRole('menuitem', { name: 'Edit synopsis' }).click();
    const field = page.getByRole('textbox', { name: 'Synopsis of Climbing' });
    await expect(field).toBeFocused();
    await field.fill('Kept on Tab.');
    await page.keyboard.press('Tab');
    await expect(field).toHaveCount(0);
    await expect(climbing(page)).toHaveAccessibleDescription('Kept on Tab.');
    // A click into the Source keeps focus there; a phone shows one pane, so only the Tab above.
    if (isMobile) return;
    await menuFor(page, climbing(page));
    await cardMenu(page).getByRole('menuitem', { name: 'Edit synopsis' }).click();
    await page.getByRole('textbox', { name: 'Synopsis of Climbing' }).fill('Kept on click.');
    await page.locator('.cm-content').click();
    await expect(climbing(page)).toHaveAccessibleDescription('Kept on click.');
    await expect(page.locator('.cm-content')).toBeFocused();
  });

  test('sets a status with the keyboard only', async ({ page }) => {
    await openSample(page);
    await climbing(page).focus();
    await page.keyboard.press('Shift+F10');
    await expect(cardMenu(page)).toBeVisible();
    const status = cardMenu(page).getByRole('menuitem', { name: 'Status' });
    for (let i = 0; i < 8 && !(await status.evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press('ArrowDown');
    }
    await expect(status).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('menuitemradio', { name: 'Draft' })).toBeVisible();
    // Down the statuses to Revised (Climbing has none yet), and that one is set.
    const revised = page.getByRole('menuitemradio', { name: 'Revised' });
    for (
      let i = 0;
      i < 6 && !(await revised.evaluate((el) => el === document.activeElement));
      i++
    ) {
      await page.keyboard.press('ArrowDown');
    }
    await expect(revised).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(climbing(page)).toHaveAccessibleName(/, Revised$/);
    await expect(climbing(page)).toBeFocused();
  });

  test('changes the card size from the slim bar', async ({ page }) => {
    await openSample(page);
    const sizes = await viewTool(page, page.getByRole('group', { name: 'Card size' }));
    const medium = sizes.getByRole('button', { name: 'Medium' });
    const large = sizes.getByRole('button', { name: 'Large' });
    await expect(medium).toHaveAttribute('aria-pressed', 'true');
    const before = (await saltRoad(page).boundingBox())?.height ?? 0;
    await large.click();
    await expect(large).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(async () => (await saltRoad(page).boundingBox())?.height ?? 0)
      .toBeGreaterThan(before);
  });
});

// axe on the novel's Cards, in both themes, in every project.
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
  test.describe(`the novel's Cards in the ${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('nuxt-color-mode', t), theme);
      await openSample(page);
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`));
    });

    test(`passes axe on the novel's Cards (${theme})`, async ({ page }) => {
      await expect(saltRoad(page)).toBeVisible();
      await clean(page, "the novel's Cards");
      await menuFor(page, saltRoad(page));
      await clean(page, "a card's menu");
      await cardMenu(page).getByRole('menuitem', { name: 'Status' }).click();
      await expect(page.getByRole('menuitemradio', { name: 'Draft' })).toBeVisible();
      await clean(page, 'the statuses');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await menuFor(page, climbing(page));
      await cardMenu(page).getByRole('menuitem', { name: 'Edit synopsis' }).click();
      await expect(page.getByRole('textbox', { name: /^Synopsis of/ })).toBeFocused();
      await clean(page, 'editing a synopsis');
    });
  });
}
