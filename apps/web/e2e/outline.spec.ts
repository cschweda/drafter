import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { removePickers } from './fs-stub';
import {
  editor,
  palette,
  paletteInput,
  runCommand,
  setText,
  showSource,
  start,
  textOf,
} from './modules';

// The Outline (Phase 2 design §6, Plan A): the tree, its keys, its menu, moving scenes and
// sections by every route, Condense and Expand, the treatment, and Expand outline. Every move
// keeps focus on the moved row and says where it went; one undo puts it back.

const SCRIPT = [
  'Title: The Test',
  '',
  '# Act One',
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
  'BOB',
  'Hi.',
  '',
  '# Act Two',
  '',
  'INT. CAR - DAY',
  '',
  'Driving.',
  '',
].join('\n');

const tree = (page: Page) => page.getByRole('tree', { name: 'Outline' });
const row = (page: Page, name: string | RegExp) => tree(page).getByRole('treeitem', { name });
const hall = (page: Page) => row(page, /^Scene \d+, INT\. HALL - DAY/);
const yard = (page: Page) => row(page, /^Scene \d+, EXT\. YARD - NIGHT/);
const car = (page: Page) => row(page, /^Scene \d+, INT\. CAR - DAY/);
const actOne = (page: Page) => row(page, /^Act One/);
const actTwo = (page: Page) => row(page, /^Act Two/);
const announcer = (page: Page) => page.locator('.outline-announcer');
// The open one: a menu that is closing stays in the page for its fade.
const rowMenu = (page: Page) =>
  page.getByRole('menu', { name: /^Actions for / }).and(page.locator('[data-state="open"]'));

/** The scene headings in the script's text, in order. */
const order = async (page: Page) =>
  (await textOf(page)).split('\n').filter((line) => /^(INT|EXT)\.|^# /.test(line));

/** Undoes the last change from the editor, with its key. */
async function undo(page: Page) {
  await showSource(page);
  await editor(page).focus();
  await page.keyboard.press('ControlOrMeta+z');
}

async function showOutline(page: Page) {
  await runCommand(page, 'Show Outline');
  await expect(tree(page)).toBeVisible();
}

async function openWith(page: Page, text = SCRIPT) {
  await start(page);
  await setText(page, text);
  await showOutline(page);
}

/** Opens a row's menu from the keyboard. */
async function menuFor(page: Page, target: ReturnType<typeof row>) {
  await target.focus();
  await page.keyboard.press('Shift+F10');
  await expect(rowMenu(page)).toBeVisible();
}

test.describe('the Outline', () => {
  test("lists the sample's scenes with pages and lengths", async ({ page }) => {
    await start(page);
    await showOutline(page);
    await expect(tree(page).getByRole('treeitem')).toHaveCount(3);
    await expect(row(page, /^Act One, 2 scenes/)).toHaveAttribute('aria-level', '1');
    await expect(row(page, 'Scene 1, INT. KITCHEN - NIGHT, page 1, 1 1/8 pages')).toHaveAttribute(
      'aria-level',
      '2',
    );
    await expect(row(page, 'Scene 2, EXT. BACK PORCH - LATER, page 2, 2/8 page')).toBeVisible();
    await expect(tree(page)).toContainText('p. 1 · 1 1/8 p');
  });

  test("lists a stage play's acts and scenes", async ({ page }) => {
    await openWith(
      page,
      '# Act One\n\n## The kitchen\n\nA table.\n\n## The porch\n\nRain.\n\n/* drafter\n{"v":1,"template":"stage-play-standard"}\n*/\n',
    );
    await expect(tree(page).getByRole('treeitem')).toHaveCount(3);
    await expect(row(page, /^Act One, 2 scenes/)).toBeVisible();
    await expect(row(page, /^Scene 1, The kitchen/)).toHaveAttribute('aria-level', '2');
    await expect(row(page, /^Scene 2, The porch/)).toBeVisible();
  });

  test('works as a tree by keyboard', async ({ page }) => {
    await openWith(page);
    const items = tree(page).getByRole('treeitem');
    await expect(items).toHaveCount(5);
    // One tab stop: the first row.
    await expect(actOne(page)).toHaveAttribute('tabindex', '0');
    await expect(hall(page)).toHaveAttribute('tabindex', '-1');
    await expect(actOne(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(hall(page)).toHaveAttribute('aria-posinset', '1');
    await expect(hall(page)).toHaveAttribute('aria-setsize', '2');
    await expect(hall(page)).toHaveAccessibleDescription(/Ann arrives\..*ANN/);
    await actOne(page).focus();
    await page.keyboard.press('ArrowDown');
    await expect(hall(page)).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(actOne(page)).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(actOne(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(items).toHaveCount(3);
    await page.keyboard.press('ArrowRight');
    await expect(items).toHaveCount(5);
    await page.keyboard.press('End');
    await expect(car(page)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(actOne(page)).toBeFocused();
    // Type-ahead.
    await page.keyboard.type('ext');
    await expect(yard(page)).toBeFocused();
  });

  test('goes to a scene on Enter', async ({ page }) => {
    await openWith(page);
    await yard(page).focus();
    await page.keyboard.press('Enter');
    await expect(editor(page)).toBeFocused();
    await page.keyboard.insertText('X');
    expect(await textOf(page)).toContain('XEXT. YARD - NIGHT');
  });

  test('filters by character', async ({ page }) => {
    await openWith(page);
    await page.getByRole('searchbox').fill('bob');
    await expect(tree(page).getByRole('treeitem')).toHaveCount(2);
    await expect(yard(page)).toBeVisible();
    await page.getByRole('searchbox').fill('nobody');
    await expect(page.getByText('No scene matches “nobody”.')).toBeVisible();
  });

  test('edits a synopsis in place and undoes it in one step', async ({ page }) => {
    await openWith(page);
    await menuFor(page, yard(page));
    await rowMenu(page).getByRole('menuitem', { name: 'Edit synopsis' }).click();
    const field = page.getByRole('textbox', { name: 'Synopsis of EXT. YARD - NIGHT' });
    await expect(field).toBeFocused();
    await field.fill('Bob says hi.');
    await page.keyboard.press('Enter');
    await expect(yard(page)).toBeFocused();
    await expect(yard(page)).toContainText('Bob says hi.');
    expect(await textOf(page)).toContain('EXT. YARD - NIGHT\n\n= Bob says hi.\n\nBOB');
    // Escape leaves it as it was.
    await menuFor(page, hall(page));
    await rowMenu(page).getByRole('menuitem', { name: 'Edit synopsis' }).click();
    await expect(page.getByRole('textbox', { name: 'Synopsis of INT. HALL - DAY' })).toBeFocused();
    await page.keyboard.insertText(' Changed.');
    await page.keyboard.press('Escape');
    await expect(hall(page)).toBeFocused();
    expect(await textOf(page)).toContain('= Ann arrives.\n');
    await undo(page);
    await expect.poll(() => textOf(page)).toBe(SCRIPT);
  });

  test('colors a scene from the menu, and the color is a name too', async ({ page }) => {
    await openWith(page);
    await menuFor(page, hall(page));
    await rowMenu(page).getByRole('menuitem', { name: 'Color…' }).click();
    const noColor = page.getByRole('menuitemcheckbox', { name: 'No color' });
    await expect(noColor).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('menuitemcheckbox', { name: 'blue' }).click();
    await expect(hall(page)).toBeFocused();
    await expect(row(page, /^Scene 1, INT\. HALL - DAY, blue/)).toBeVisible();
    await expect(hall(page)).toContainText('blue');
    expect(await textOf(page)).toContain('= Ann arrives.\n[[Color: blue]]\n\nANN');
    await expect(announcer(page)).toHaveText('Colored INT. HALL - DAY blue.');
  });

  test('is not offered for a Markdown document', async ({ page }) => {
    await start(page);
    await runCommand(page, 'New Markdown document');
    await expect(page.getByRole('tab', { name: 'Preview' }).first()).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Outline' })).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+k');
    await expect(paletteInput(page)).toBeFocused();
    await page.keyboard.insertText('Show Outline');
    await expect(palette(page).getByRole('option', { name: 'Show Outline' })).toHaveCount(0);
  });
});

test.describe('moving in the Outline', () => {
  test('moves a scene down with Alt+Down, keeps focus on it, and says where it went', async ({
    page,
  }) => {
    await openWith(page);
    await hall(page).focus();
    await page.keyboard.press('Alt+ArrowDown');
    await expect
      .poll(() => order(page))
      .toEqual([
        '# Act One',
        'EXT. YARD - NIGHT',
        'INT. HALL - DAY',
        '# Act Two',
        'INT. CAR - DAY',
      ]);
    await expect(hall(page)).toBeFocused();
    await expect(hall(page)).toHaveAccessibleName(/^Scene 2, INT\. HALL - DAY/);
    await expect(announcer(page)).toHaveText('Moved INT. HALL - DAY to scene 2 of 3, in Act One.');
  });

  test("moves a scene across a section's edge with Alt+Up", async ({ page }) => {
    await openWith(page);
    await car(page).focus();
    await page.keyboard.press('Alt+ArrowUp');
    await expect
      .poll(() => order(page))
      .toEqual([
        '# Act One',
        'INT. HALL - DAY',
        'EXT. YARD - NIGHT',
        'INT. CAR - DAY',
        '# Act Two',
      ]);
    await expect(car(page)).toBeFocused();
    await expect(car(page)).toHaveAttribute('aria-level', '2');
    await expect(announcer(page)).toHaveText('Moved INT. CAR - DAY to scene 3 of 3, in Act One.');
  });

  test('moves a section with its scenes', async ({ page }) => {
    await openWith(page);
    await actTwo(page).focus();
    await page.keyboard.press('Alt+ArrowUp');
    await expect
      .poll(() => order(page))
      .toEqual([
        '# Act Two',
        'INT. CAR - DAY',
        '# Act One',
        'INT. HALL - DAY',
        'EXT. YARD - NIGHT',
      ]);
    await expect(actTwo(page)).toBeFocused();
    await expect(announcer(page)).toHaveText('Moved Act Two. It starts at scene 1 of 3.');
    // Nowhere further up: it says so, and nothing changes.
    await page.keyboard.press('Alt+ArrowUp');
    await expect(announcer(page)).toHaveText('Act Two can’t move further up.');
  });

  test('undoes a move in one step', async ({ page }) => {
    await openWith(page);
    await hall(page).focus();
    await page.keyboard.press('Alt+ArrowDown');
    await expect.poll(() => textOf(page)).not.toBe(SCRIPT);
    await undo(page);
    await expect.poll(() => textOf(page)).toBe(SCRIPT);
  });

  test('moves a scene with Move to…', async ({ page }) => {
    await openWith(page);
    await menuFor(page, hall(page));
    await rowMenu(page).getByRole('menuitem', { name: 'Move scene to…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Move INT. HALL - DAY' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleDescription('Put it after:');
    await dialog.getByRole('searchbox').fill('car');
    await dialog.getByRole('button', { name: 'Scene 3: INT. CAR - DAY' }).click();
    await expect(dialog).toBeHidden();
    await expect
      .poll(() => order(page))
      .toEqual([
        '# Act One',
        'EXT. YARD - NIGHT',
        '# Act Two',
        'INT. CAR - DAY',
        'INT. HALL - DAY',
      ]);
    await expect(hall(page)).toBeFocused();
    await expect(announcer(page)).toHaveText('Moved INT. HALL - DAY to scene 3 of 3, in Act Two.');
  });

  test("moves a scene from its row's ⋯ menu, as a phone does", async ({ page }) => {
    await openWith(page);
    // The ⋯ button is for a pointer: the row's keys open the same menu.
    await hall(page).locator('button.more').click();
    await rowMenu(page).getByRole('menuitem', { name: 'Move scene down' }).click();
    await expect
      .poll(() => order(page))
      .toEqual([
        '# Act One',
        'EXT. YARD - NIGHT',
        'INT. HALL - DAY',
        '# Act Two',
        'INT. CAR - DAY',
      ]);
    await expect(hall(page)).toBeFocused();
  });

  test('moves a scene by dragging it', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'a phone moves rows from their menu');
    await openWith(page);
    const target = await car(page).boundingBox();
    if (!target) throw new Error('no row');
    await hall(page).dragTo(car(page), {
      targetPosition: { x: 20, y: target.height - 3 },
    });
    await expect
      .poll(() => order(page))
      .toEqual([
        '# Act One',
        'EXT. YARD - NIGHT',
        '# Act Two',
        'INT. CAR - DAY',
        'INT. HALL - DAY',
      ]);
    await expect(announcer(page)).toHaveText('Moved INT. HALL - DAY to scene 3 of 3, in Act Two.');
  });

  test('moves the scene holding the cursor with Move scene down', async ({ page }) => {
    await start(page);
    await setText(page, SCRIPT);
    await showSource(page);
    await editor(page).getByText('Hello.').click();
    await runCommand(page, 'Move scene down');
    await expect
      .poll(() => order(page))
      .toEqual([
        '# Act One',
        'EXT. YARD - NIGHT',
        'INT. HALL - DAY',
        '# Act Two',
        'INT. CAR - DAY',
      ]);
    await expect(announcer(page)).toHaveText('Moved INT. HALL - DAY to scene 2 of 3, in Act One.');
    // The cursor went with it.
    await expect(editor(page)).toBeFocused();
    await page.keyboard.insertText('!');
    expect(await textOf(page)).toMatch(/INT\. HALL - DAY[\s\S]*!/);
    expect((await textOf(page)).indexOf('!')).toBeGreaterThan(
      (await textOf(page)).indexOf('INT. HALL'),
    );
  });

  test("doesn't move a scene in a read-only tab, and says why", async ({ context, isMobile }) => {
    test.skip(!!isMobile, 'two browser tabs are the same on a phone');
    const first = await context.newPage();
    await start(first);
    const second = await context.newPage();
    await second.goto('/');
    await expect(second.getByText('This script is open for editing in another tab.')).toBeVisible();
    await showOutline(second);
    const kitchen = row(second, /^Scene 1, INT\. KITCHEN - NIGHT/);
    const before = await textOf(second);
    await kitchen.focus();
    await second.keyboard.press('Alt+ArrowDown');
    await expect(announcer(second)).toHaveText('This script is open for editing in another tab.');
    expect(await textOf(second)).toBe(before);
    await menuFor(second, kitchen);
    const down = rowMenu(second).getByRole('menuitem', { name: 'Move scene down' });
    await expect(down).toHaveAttribute('aria-disabled', 'true');
    await expect(rowMenu(second)).toContainText('This script is open for editing in another tab.');
  });
});

test.describe('condense, expand, and treatments', () => {
  test('condenses to the outline and expands again', async ({ page }) => {
    await start(page);
    await setText(page, SCRIPT);
    await runCommand(page, 'Condense to outline');
    await expect(tree(page)).toBeVisible();
    await expect(announcer(page)).toHaveText(
      'Condensed to the outline: every scene is folded to its heading and synopsis.',
    );
    await showSource(page);
    await expect(page.locator('.cm-foldPlaceholder')).toHaveCount(3);
    await expect(page.locator('.cm-foldPlaceholder', { hasText: 'Ann arrives.' })).toHaveCount(1);
    await expect(editor(page)).toContainText('# Act Two');
    await expect(editor(page)).not.toContainText('Hello.');
    await runCommand(page, 'Expand all');
    await expect(page.locator('.cm-foldPlaceholder')).toHaveCount(0);
    await expect(editor(page)).toContainText('Hello.');
  });

  test('exports a treatment as a Markdown file', async ({ page }) => {
    await removePickers(page);
    await start(page);
    await setText(page, SCRIPT);
    await runCommand(page, 'Export as treatment…');
    const dialog = page.getByRole('dialog', { name: 'Export as treatment' });
    await expect(dialog).toBeVisible();
    await dialog
      .getByRole('checkbox', { name: 'Include each scene’s first paragraph of action' })
      .check();
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Save file' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('The Test — treatment.md');
    expect(await readFile(await file.path(), 'utf8')).toBe(
      `${[
        '# The Test',
        '## Act One',
        '### INT. HALL - DAY',
        'Ann arrives.',
        '### EXT. YARD - NIGHT',
        '## Act Two',
        '### INT. CAR - DAY',
        'Driving.',
      ].join('\n\n')}\n`,
    );
    await expect(dialog).toBeHidden();
  });

  test('opens a treatment as a document', async ({ page }) => {
    await start(page);
    await setText(page, SCRIPT);
    await runCommand(page, 'Export as treatment…');
    const dialog = page.getByRole('dialog', { name: 'Export as treatment' });
    await dialog.getByRole('button', { name: 'Open as a document' }).click();
    await expect(page.getByRole('tab', { name: 'Preview' }).first()).toBeVisible();
    await showSource(page);
    await expect(editor(page)).toContainText('# The Test');
    await expect(editor(page)).toContainText('### INT. CAR - DAY');
  });

  test('expands synopses into stubs in one undo, and Problems lists them', async ({ page }) => {
    const outline =
      'Title: Plan\n\n# Act One\n\n= Margaret waits.\n\n- Danny comes home.\n- They eat cake.\n';
    await start(page);
    await setText(page, outline);
    await runCommand(page, 'Expand outline');
    await expect
      .poll(() => textOf(page))
      .toBe(
        'Title: Plan\n\n# Act One\n\nINT. LOCATION - DAY\n\n= Margaret waits.\n\nINT. LOCATION - DAY\n\n= Danny comes home.\n\nINT. LOCATION - DAY\n\n= They eat cake.\n',
      );
    await expect(announcer(page)).toHaveText('Made 3 scene stubs. Problems lists them.');
    await page
      .getByRole('tab', { name: /^Problems/ })
      .last()
      .click();
    const problems = page.getByRole('tabpanel', { name: /^Problems/ });
    await expect(problems.getByText(/still has the stand-in heading/)).toHaveCount(3);
    await undo(page);
    await expect.poll(() => textOf(page)).toBe(outline);
  });

  test('makes a screenplay from a Markdown outline', async ({ page }) => {
    await start(page);
    await runCommand(page, 'New Markdown document');
    await setText(page, '# The Plan\n\n## Act One\n\n- Margaret waits.\n- Danny comes home.\n');
    await runCommand(page, 'New screenplay from this outline');
    await expect(page.getByRole('tab', { name: 'Outline' }).first()).toBeVisible();
    await expect
      .poll(() => textOf(page))
      .toMatch(
        /^Title: The Plan\n[\s\S]*\n\n## Act One\n\nINT\. LOCATION - DAY\n\n= Margaret waits\.\n\nINT\. LOCATION - DAY\n\n= Danny comes home\.\n$/,
      );
    await showOutline(page);
    await expect(tree(page).getByRole('treeitem')).toHaveCount(3);
    await page
      .getByRole('tab', { name: /^Problems/ })
      .last()
      .click();
    await expect(
      page.getByRole('tabpanel', { name: /^Problems/ }).getByText(/still has the stand-in heading/),
    ).toHaveCount(2);
  });
});

// axe on every state the Outline adds, in both themes, in every project (so at desktop and at phone
// width). These run by default: they aren't named for the opt-in accessibility suite.
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function clean(page: Page, state: string) {
  // A fade still running is waited out: axe measures the colors on screen.
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
  test.describe(`the Outline in the ${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('nuxt-color-mode', t), theme);
      await openWith(page, SCRIPT.replace('= Ann arrives.', '= Ann arrives.\n[[Color: teal]]'));
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`));
    });

    test(`passes axe on the Outline (${theme})`, async ({ page }) => {
      await expect(row(page, /^Scene 1, INT\. HALL - DAY, teal/)).toBeVisible();
      await clean(page, 'the Outline');
      await page.getByRole('searchbox').fill('nobody');
      await clean(page, 'the Outline, filtered to nothing');
    });

    test(`passes axe with a row's menu and its colors open (${theme})`, async ({ page }) => {
      await menuFor(page, hall(page));
      await clean(page, "a row's menu");
      await rowMenu(page).getByRole('menuitem', { name: 'Color…' }).click();
      await expect(page.getByRole('menuitemcheckbox', { name: 'blue' })).toBeVisible();
      await clean(page, 'the colors');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await menuFor(page, yard(page));
      await rowMenu(page).getByRole('menuitem', { name: 'Edit synopsis' }).click();
      await expect(page.getByRole('textbox', { name: /^Synopsis of/ })).toBeFocused();
      await clean(page, 'editing a synopsis');
    });

    test(`passes axe with Move to… open (${theme})`, async ({ page }) => {
      await menuFor(page, hall(page));
      await rowMenu(page).getByRole('menuitem', { name: 'Move scene to…' }).click();
      await expect(page.getByRole('dialog', { name: 'Move INT. HALL - DAY' })).toBeVisible();
      await clean(page, 'Move to…');
    });

    test(`passes axe with the treatment dialog open (${theme})`, async ({ page }) => {
      await runCommand(page, 'Export as treatment…');
      await expect(page.getByRole('dialog', { name: 'Export as treatment' })).toBeVisible();
      await clean(page, 'the treatment dialog');
    });

    test(`passes axe with the tabs' More open (${theme})`, async ({ page }) => {
      await page.keyboard.press('ControlOrMeta+,');
      const settings = page.getByRole('dialog', { name: 'Settings' });
      for (const name of ['Scene list', 'Cast']) {
        await settings.getByRole('switch', { name, exact: true }).click();
      }
      await settings.getByRole('button', { name: 'Done' }).click();
      await page.locator('[data-pane]').first().getByRole('button', { name: 'More tabs' }).click();
      await expect(page.getByRole('menu', { name: 'More tabs' })).toBeVisible();
      await clean(page, "the tabs' More");
    });

    test(`passes axe in a read-only tab's menu (${theme})`, async ({ page, context, isMobile }) => {
      test.skip(!!isMobile, 'two browser tabs are the same on a phone');
      const second = await context.newPage();
      await second.goto('/');
      await expect(
        second.getByText('This script is open for editing in another tab.'),
      ).toBeVisible();
      await showOutline(second);
      await menuFor(second, tree(second).getByRole('treeitem').nth(1));
      await clean(second, "a read-only tab's row menu");
      void page;
    });
  });
}
