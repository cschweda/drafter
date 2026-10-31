import { expect, type Locator, type Page, test } from '@playwright/test';
import {
  closeSettings,
  editor,
  openSettings,
  setText,
  settingsDialog,
  showSource,
  start,
  stored,
  textOf,
} from './modules';

// The element bar (docs/drafter-element-bar-design.md): a row of buttons over the Source that
// writes Fountain's marks, names the element the cursor is in, and teaches the marks as it goes.
// (Its accessibility checks are in a11y.spec.ts.)

const bar = (page: Page) => page.getByRole('toolbar', { name: 'Element bar' });
const button = (page: Page, name: string) => bar(page).getByRole('button', { name, exact: true });
const here = (page: Page) => bar(page).locator('[data-here]');

/** Puts `text` in the editor with the cursor at its end, and waits for the bar to follow it. */
async function write(page: Page, text: string) {
  await setText(page, text);
  await page.keyboard.press('ControlOrMeta+End');
}

/** Clicks a button on the bar, and waits for the editor to have focus again. */
async function press(page: Page, name: string) {
  await button(page, name).click();
  await expect(editor(page)).toBeFocused();
}

test.beforeEach(async ({ page }) => {
  await start(page);
  await showSource(page);
  // Side by side, the bar shows while focus is in the editor's pane (fresh-look design §3.2).
  await editor(page).focus();
});

test('shows over the Source, and names the element the cursor is in', async ({ page }) => {
  await expect(bar(page)).toBeVisible();
  await write(page, 'INT. HALL - DAY\n\nMARGARET\nHello.');
  await expect(here(page)).toHaveText('You’re in: Dialogue');
  await expect(button(page, 'Dialogue')).toHaveAttribute('aria-pressed', 'true');
  await expect(button(page, 'Character')).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('ArrowUp');
  await expect(here(page)).toHaveText('You’re in: Character');
  await expect(button(page, 'Character')).toHaveAttribute('aria-pressed', 'true');
  // Each button says what its element is, and its mark and key, as its description.
  await expect(button(page, 'Character')).toHaveAccessibleDescription(
    /A name in capitals on its own line.*Shortcut: (Ctrl\+Alt\+3|⌘⌥3)\./,
  );
  // The reason for the element is the description of the words at the left.
  await expect(here(page)).toHaveAccessibleDescription(/^A name in capitals after a blank line/);
  await page.keyboard.press('ArrowUp');
  await expect(here(page)).toHaveText('You’re on a blank line');
});

test('writes each element, natural Fountain first', async ({ page }) => {
  await write(page, 'She waits.\n\nkitchen - night');
  await press(page, 'Scene');
  expect(await textOf(page)).toBe('She waits.\n\nINT. KITCHEN - NIGHT');

  await write(page, 'She waits.\n\nmargaret');
  await press(page, 'Character');
  await page.keyboard.insertText('\nHello.');
  expect(await textOf(page)).toBe('She waits.\n\nMARGARET\nHello.');
  await expect(here(page)).toHaveText('You’re in: Dialogue');

  // Dialogue on a line of action starts a cue above it; the name is upper-cased as it is typed.
  await write(page, 'She waits.\n\nHello there.');
  await press(page, 'Dialogue');
  await page.keyboard.type('bob');
  await page.keyboard.press('Escape');
  expect(await textOf(page)).toBe('She waits.\n\n@BOB\nHello there.');
  // The @ was only for typing the name in capitals: it goes once the cursor leaves the line.
  await page.keyboard.press('ArrowDown');
  expect(await textOf(page)).toBe('She waits.\n\nBOB\nHello there.');

  await write(page, 'MARGARET\nquietly');
  await press(page, 'Parenthetical');
  expect(await textOf(page)).toBe('MARGARET\n(quietly)');

  await write(page, 'INT. HALL');
  await press(page, 'Action');
  expect(await textOf(page)).toBe('!INT. HALL');

  await write(page, 'She waits.\n\ncut to:');
  await press(page, 'Transition');
  expect(await textOf(page)).toBe('She waits.\n\nCUT TO:');
});

test('starts a heading on an empty line and offers the locations', async ({ page }) => {
  await write(page, 'INT. KITCHEN - NIGHT\n\nShe waits.\n\n');
  await press(page, 'Scene');
  expect(await textOf(page)).toBe('INT. KITCHEN - NIGHT\n\nShe waits.\n\nINT. ');
  await expect(page.locator('.cm-tooltip-autocomplete')).toContainText('KITCHEN');
});

test('names a name with no speech yet a Character, and lets a parenthetical go under it', async ({
  page,
}) => {
  await write(page, 'She waits.\n\nmargaret');
  await press(page, 'Character');
  await expect(here(page)).toHaveText('You’re in: Character');
  await expect(button(page, 'Character')).toHaveAttribute('aria-pressed', 'true');
  await expect(button(page, 'Parenthetical')).not.toHaveAttribute('aria-disabled', 'true');
  await press(page, 'Parenthetical');
  expect(await textOf(page)).toBe('She waits.\n\nMARGARET\n()');
});

test('says why a button did nothing', async ({ page }) => {
  await write(page, 'MARGARET\n');
  await expect(here(page)).toHaveAccessibleDescription(/what you type here is their dialogue/);
  await press(page, 'Dialogue');
  await expect(page.getByRole('status').filter({ hasText: 'already dialogue' })).toContainText(
    'type what they say here',
  );
  expect(await textOf(page)).toBe('MARGARET\n');
});

test('runs the element commands from Ctrl+Alt+1 to 7', async ({ page }) => {
  await write(page, 'She waits.\n\nmargaret');
  await page.keyboard.press('ControlOrMeta+Alt+3');
  expect(await textOf(page)).toBe('She waits.\n\nMARGARET');
});

test('is one undo step', async ({ page }) => {
  await write(page, 'She waits.\nkitchen');
  await press(page, 'Scene');
  expect(await textOf(page)).toBe('She waits.\n\nINT. KITCHEN');
  await page.keyboard.press('ControlOrMeta+z');
  expect(await textOf(page)).toBe('She waits.\nkitchen');
});

test('says why Parenthetical is off where it does not apply', async ({ page }) => {
  await write(page, 'She waits.');
  await expect(button(page, 'Parenthetical')).toHaveAttribute('aria-disabled', 'true');
  await expect(button(page, 'Parenthetical')).toHaveAccessibleDescription(
    /goes under a character name or in their dialogue/,
  );
  // Playwright waits for a button with aria-disabled to be enabled, so the click is forced.
  await button(page, 'Parenthetical').click({ force: true });
  expect(await textOf(page)).toBe('She waits.');
});

/** Chooses a button from the bar's More menu. */
async function chooseMore(page: Page, name: string) {
  await button(page, 'More elements').click();
  await page.getByRole('menuitem', { name }).click();
  await expect(editor(page)).toBeFocused();
}

test('Setup adds a mark at the end of the line with the cursor in its label', async ({ page }) => {
  await write(page, 'INT. HALL - DAY\n\nAnn pockets the key.');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await chooseMore(page, 'Setup');
  expect(await textOf(page)).toBe('INT. HALL - DAY\n\nAnn pockets the key. [[Setup: ]]');
  await page.keyboard.type('the key');
  expect(await textOf(page)).toBe('INT. HALL - DAY\n\nAnn pockets the key. [[Setup: the key]]');
});

test('Payoff offers the setup’s label', async ({ page }) => {
  await write(page, 'Ann pockets the key. [[Setup: the key]]\n\nShe opens the door.');
  await chooseMore(page, 'Payoff');
  expect(await textOf(page)).toBe(
    'Ann pockets the key. [[Setup: the key]]\n\nShe opens the door. [[Payoff: ]]',
  );
  const option = page.getByRole('option', { name: 'the key' });
  await expect(option).toBeVisible();
  await option.click();
  expect(await textOf(page)).toBe(
    'Ann pockets the key. [[Setup: the key]]\n\nShe opens the door. [[Payoff: the key]]',
  );
});

test('Setup and Payoff are one undo each', async ({ page }) => {
  await write(page, 'One.\n\nTwo.');
  await chooseMore(page, 'Setup');
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+ArrowUp');
  await chooseMore(page, 'Payoff');
  await page.keyboard.press('Escape');
  expect(await textOf(page)).toBe('One. [[Payoff: ]]\n\nTwo. [[Setup: ]]');
  await page.keyboard.press('ControlOrMeta+z');
  expect(await textOf(page)).toBe('One.\n\nTwo. [[Setup: ]]');
  await page.keyboard.press('ControlOrMeta+z');
  expect(await textOf(page)).toBe('One.\n\nTwo.');
});

test('has the rest in More', async ({ page }) => {
  const choose = async (name: string) => {
    await button(page, 'More elements').click();
    await page.getByRole('menuitem', { name }).click();
    await expect(editor(page)).toBeFocused();
  };
  await write(page, 'THE END');
  await choose('Centered');
  expect(await textOf(page)).toBe('>THE END<');

  await write(page, 'Act one');
  await choose('Section');
  expect(await textOf(page)).toBe('# Act one');

  await setText(page, 'a word');
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft');
  await choose('Bold');
  expect(await textOf(page)).toBe('a **word**');
});

test('moves along the bar with the arrow keys, as one tab stop', async ({ page, isMobile }) => {
  await write(page, 'She waits.');
  await here(page).focus();
  await page.keyboard.press('ArrowRight');
  await expect(button(page, 'Scene')).toBeFocused();
  await expect(button(page, 'Scene')).toHaveAttribute('tabindex', '0');
  await expect(here(page)).toHaveAttribute('tabindex', '-1');
  await page.keyboard.press('End');
  // Side by side, More is last: it holds the cheat sheet and the bar's options there.
  await expect(
    bar(page).getByRole('button', { name: isMobile ? 'Element bar options' : 'More elements' }),
  ).toBeFocused();
  await page.keyboard.press('Home');
  await expect(here(page)).toBeFocused();
  // Enter on a button runs it, and the editor has focus after.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(button(page, 'Action')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(editor(page)).toBeFocused();
});

/** Side by side, More holds the cheat sheet and the bar's options; a phone's bar has ? and ⋯. */
async function fromBar(page: Page, isMobile: boolean, phoneButton: string, item: string) {
  if (isMobile) {
    await bar(page).getByRole('button', { name: phoneButton }).click();
    if (phoneButton === 'Fountain cheat sheet') return;
  } else await button(page, 'More elements').click();
  await page.getByRole('menuitem', { name: item }).click();
}

test('opens the Fountain cheat sheet from ?', async ({ page, context, isMobile }) => {
  const opened = context.waitForEvent('page');
  await fromBar(page, isMobile, 'Fountain cheat sheet', 'Fountain cheat sheet');
  const sheet = await opened;
  await sheet.waitForLoadState();
  expect(new URL(sheet.url()).pathname).toBe('/docs/fountain/');
  await expect(sheet.getByRole('heading', { level: 1 })).toHaveText('Fountain cheat sheet');
  await expect(sheet.locator('#character')).toContainText('@');
});

test('hides from its ⋯ menu, and Settings brings it back', async ({ page, isMobile }) => {
  await fromBar(page, isMobile, 'Element bar options', 'Hide the element bar');
  await expect(bar(page)).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'element bar is hidden' })).toContainText(
    'Turn it back on in Settings',
  );
  // It stays hidden after a reload, once the setting has been kept.
  await expect.poll(async () => (await stored(page)).elementBar).toBe(false);
  await page.reload();
  await expect(editor(page)).toBeAttached();
  await showSource(page);
  await expect(bar(page)).toHaveCount(0);
  await openSettings(page);
  const on = settingsDialog(page).getByRole('switch', { name: 'Element bar' });
  await expect(on).not.toBeChecked();
  await on.check();
  await closeSettings(page);
  await expect(bar(page)).toBeVisible();
});

test('is hidden in focus mode', async ({ page }) => {
  await expect(bar(page)).toBeVisible();
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+Shift+Enter');
  await expect(page.locator('[data-focus-layout]')).toBeVisible();
  await expect(bar(page)).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Shift+Enter');
  await expect(bar(page)).toBeVisible();
});

test('shows the Markdown set in a Markdown document', async ({ page }) => {
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page
    .getByRole('group', { name: 'Scripts', exact: true })
    .getByRole('button', { name: 'New Markdown document' })
    .click();
  await expect(editor(page)).toContainText('# Untitled');
  await showSource(page);
  const md = page.getByRole('toolbar', { name: 'Markdown bar' });
  await expect(md).toBeVisible();
  await expect(md.getByRole('button', { name: 'Heading', exact: true })).toBeVisible();
  await expect(md.getByRole('button', { name: 'Scene', exact: true })).toHaveCount(0);
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+Home');
  await expect(md.locator('[data-here]')).toHaveText('You’re in: Heading 1');
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText('\nfirst');
  await md.getByRole('button', { name: 'List', exact: true }).click();
  await expect(editor(page)).toBeFocused();
  expect(await textOf(page)).toContain('- first');
  await expect(md.locator('[data-here]')).toHaveText('You’re in: List item');
});

test('is hidden in a tab that only shows the script', async ({ page, context, isMobile }) => {
  test.skip(isMobile, 'two tabs are the same on a phone');
  await expect(bar(page)).toBeVisible();
  const other = await context.newPage();
  await other.goto('/');
  await expect(other.getByText('This script is open for editing in another tab')).toBeVisible();
  await showSource(other);
  await expect(other.getByRole('toolbar', { name: 'Element bar' })).toHaveCount(0);
});

test('keeps the editor’s focus when a button is tapped on a phone', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'a phone’s touch screen');
  await write(page, 'She waits.\n\nmargaret');
  await button(page, 'Character').tap();
  await expect(editor(page)).toBeFocused();
  expect(await textOf(page)).toBe('She waits.\n\nMARGARET');
});

test('is one row on a phone, which scrolls sideways', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'a phone’s width');
  const box = await bar(page).boundingBox();
  expect(box?.height ?? 0).toBeLessThan(40);
  const scrolls = await bar(page).evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(scrolls).toBe(true);
  // It is above the text.
  const text = await page.locator('.cm-scroller').boundingBox();
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual((text?.y ?? 0) + 1);
});

test.describe('on a stage play', () => {
  const PLAY = (body: string) =>
    `${body}\n\n/* drafter\n{ "v": 1, "template": "stage-play-standard" }\n*/`;

  /** Puts a play in the editor, with the cursor at the start of its line `n` (from 0). */
  async function play(page: Page, body: string, n: number) {
    await setText(page, PLAY(body));
    await page.keyboard.press('ControlOrMeta+Home');
    for (let i = 0; i < n; i++) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End');
  }

  test('offers Act, Scene, and Stage direction, and no Transition', async ({ page }) => {
    await play(page, '# ACT ONE\n\n## Scene 1\n\nMargaret waits.', 2);
    await expect(button(page, 'Act')).toBeVisible();
    await expect(button(page, 'Stage direction')).toBeVisible();
    await expect(button(page, 'Transition')).toHaveCount(0);
    await expect(here(page)).toHaveText('You’re in: Scene');
    await expect(button(page, 'Scene')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(here(page)).toHaveText('You’re in: Act');
    await page.keyboard.press('ControlOrMeta+Home');
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
    await expect(here(page)).toHaveText('You’re in: Stage direction');
    await expect(button(page, 'Stage direction')).toHaveAttribute('aria-pressed', 'true');
  });

  test('writes a scene as ## from the button', async ({ page }) => {
    await play(page, 'Margaret waits.\n\nthe porch', 2);
    await press(page, 'Scene');
    expect(await textOf(page)).toContain('Margaret waits.\n\n## the porch\n');
  });

  test('writes a scene as ## from Ctrl+Alt+1', async ({ page }) => {
    await play(page, 'Margaret waits.\n\nthe porch', 2);
    await page.keyboard.press('ControlOrMeta+Alt+1');
    expect(await textOf(page)).toContain('Margaret waits.\n\n## the porch\n');
  });

  test('says why Ctrl+Alt+5 writes no transition', async ({ page }) => {
    await play(page, 'Margaret waits.\n\ncut to:', 2);
    await page.keyboard.press('ControlOrMeta+Alt+5');
    await expect(page.getByRole('status').filter({ hasText: 'no transitions' })).toBeVisible();
    expect(await textOf(page)).toContain('\n\ncut to:\n');
  });
});

test('says why a key did nothing', async ({ page }) => {
  await write(page, 'She waits.');
  await page.keyboard.press('ControlOrMeta+Alt+4');
  await expect(
    page.getByRole('status').filter({ hasText: 'under a character name' }),
  ).toBeVisible();
});

// Fresh-look design §3.2 and §10a: side by side, the bar sits in the editor's 36px header, never
// clips (it folds its buttons into More instead, by the width alone), names the element the cursor
// is in in a chip at its left, keeps the marks in its tooltips, and gives way to the script's title
// while focus is in another region.
test.describe('in the editor’s header', () => {
  test.skip(({ isMobile }) => isMobile, 'two panes side by side');

  const header = (page: Page) => page.locator('[data-pane="left"] .head');
  const title = (page: Page) => header(page).locator('[data-script-title]');
  const markdownBar = (page: Page) => page.getByRole('toolbar', { name: 'Markdown bar' });
  const chip = (page: Page) => header(page).locator('[data-here-name]');

  /** What clips: the bar's and the header's overflow, and any item drawn past the bar's edges. */
  async function clipping(toolbar: Locator) {
    return toolbar.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const head = el.closest('.head') as HTMLElement;
      const out = [...el.querySelectorAll<HTMLElement>('[data-bar-item], [data-here]')]
        .filter((item) => getComputedStyle(item).visibility !== 'hidden')
        .filter((item) => {
          const r = item.getBoundingClientRect();
          return r.left < box.left - 0.5 || r.right > box.right + 0.5;
        })
        .map((item) => item.dataset.barItem ?? 'here');
      return {
        bar: el.scrollWidth - el.clientWidth,
        head: head.scrollWidth - head.clientWidth,
        out,
      };
    });
  }
  const NONE = { bar: 0, head: 0, out: [] };
  /** The items drawn on a bar, by their ids. */
  const drawn = (toolbar: Locator) =>
    toolbar
      .locator('[data-bar-item]')
      .evaluateAll((all) =>
        all
          .filter((el) => getComputedStyle(el).visibility !== 'hidden')
          .map((el) => (el as HTMLElement).dataset.barItem),
      );
  /** The bar is out of sight, under the script's title. */
  const away = (page: Page) =>
    page.locator('[data-element-bar]').evaluate((el) => getComputedStyle(el).opacity === '0');
  async function textSize(page: Page, size: string) {
    await openSettings(page);
    await settingsDialog(page).getByLabel('Text size').selectOption(size);
    await closeSettings(page);
    await editor(page).focus();
  }
  async function narrowest(page: Page) {
    await page.setViewportSize({ width: 1024, height: 800 });
    const divider = page.getByRole('separator', { name: 'Resize panes' });
    await divider.focus();
    await page.keyboard.press('Home');
    await expect(divider).toHaveAttribute('aria-valuenow', '25');
    await editor(page).focus();
  }
  async function newMarkdown(page: Page) {
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await page
      .getByRole('group', { name: 'Scripts', exact: true })
      .getByRole('button', { name: 'New Markdown document' })
      .click();
    await expect(editor(page)).toContainText('# Untitled');
    await editor(page).focus();
    await expect(markdownBar(page)).toBeVisible();
  }
  const STAGE_PLAY =
    '# ACT ONE\n\n## Scene 1\n\nMargaret waits.\n\nMARGARET\n(quietly)\nHello?\n\n/* drafter\n{ "v": 1, "template": "stage-play-standard" }\n*/';

  test('never clips at 1280 and 1440 with two panes, at text size Large too', async ({ page }) => {
    for (const size of ['1', '1.5']) {
      if (size !== '1') await textSize(page, size);
      for (const width of [1280, 1440]) {
        await page.setViewportSize({ width, height: 800 });
        for (const text of ['INT. HALL - DAY\n\nMARGARET\nHello.', 'She waits.\n\n']) {
          await write(page, text);
          await expect(bar(page)).toBeVisible();
          await expect
            .poll(() => clipping(bar(page)), `${width}px, text size ${size}`)
            .toEqual(NONE);
        }
        // In the header: the editor side has two bars above the writing, not three.
        const [head, toolbar, text] = await Promise.all([
          header(page).boundingBox(),
          bar(page).boundingBox(),
          page.locator('[data-pane="left"] .cm-scroller').boundingBox(),
        ]);
        expect(toolbar?.y ?? 0).toBeGreaterThanOrEqual(head?.y ?? 0);
        expect((toolbar?.y ?? 0) + (toolbar?.height ?? 0)).toBeLessThanOrEqual(
          (head?.y ?? 0) + (head?.height ?? 0) + 0.5,
        );
        expect(Math.abs((text?.y ?? 0) - ((head?.y ?? 0) + (head?.height ?? 0)))).toBeLessThan(2);
      }
    }
  });

  test('a screenplay’s six buttons all show at 1280', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the widths are Chromium’s; elsewhere a fold is allowed');
    await page.setViewportSize({ width: 1280, height: 800 });
    await write(page, 'INT. HALL - DAY\n\nMARGARET\nHello.');
    await expect
      .poll(() => drawn(bar(page)))
      .toEqual([
        'here',
        'element-scene-heading',
        'element-action',
        'element-character',
        'element-dialogue',
        'element-parenthetical',
        'element-transition',
        'more',
      ]);
  });

  test('never clips at 1280 and 1440 on a stage play or a Markdown document', async ({ page }) => {
    await setText(page, STAGE_PLAY);
    await page.keyboard.press('ControlOrMeta+Home');
    // A stage play's bar (its Act button folds last, being the leftmost).
    await expect(button(page, 'Act')).toBeVisible();
    for (const width of [1280, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      await editor(page).focus();
      await expect.poll(() => clipping(bar(page)), `stage play, ${width}px`).toEqual(NONE);
    }
    await newMarkdown(page);
    for (const width of [1280, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      await editor(page).focus();
      await expect.poll(() => clipping(markdownBar(page)), `Markdown, ${width}px`).toEqual(NONE);
    }
  });

  test('collapses to the current element and More when narrow', async ({ page }) => {
    await write(page, 'INT. HALL - DAY\n\nMARGARET\nHello.');
    await narrowest(page);
    await expect.poll(() => clipping(bar(page))).toEqual(NONE);
    // The element the cursor is in, and More; the buttons wait in More.
    await expect(chip(page)).toBeVisible();
    await expect(chip(page)).toHaveText('Dialogue');
    await expect(button(page, 'More elements')).toBeVisible();
    await expect.poll(() => drawn(bar(page))).toEqual(['here', 'more']);
    // The arrow keys go only through what is drawn.
    await here(page).focus();
    await page.keyboard.press('ArrowRight');
    await expect(button(page, 'More elements')).toBeFocused();
    // More holds the folded buttons first, then the rest, the cheat sheet, and the options.
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu');
    for (const name of [
      'Scene',
      'Action',
      'Character',
      'Parenthetical',
      'Transition',
      'Centered',
    ]) {
      await expect(menu.getByRole('menuitem', { name: new RegExp(`^${name}\\b`) })).toBeVisible();
    }
    await expect(menu.getByRole('menuitem', { name: 'Fountain cheat sheet' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Hide the element bar' })).toBeVisible();
    await page.keyboard.press('Escape');
    await write(page, 'She waits.\n\nkitchen - night');
    await button(page, 'More elements').click();
    await page.getByRole('menuitem', { name: /^Scene\b/ }).click();
    await expect(editor(page)).toBeFocused();
    expect(await textOf(page)).toBe('She waits.\n\nINT. KITCHEN - NIGHT');
    // Given room again, every button comes back out of More.
    const divider = page.getByRole('separator', { name: 'Resize panes' });
    await divider.focus();
    await page.keyboard.press('End');
    await page.setViewportSize({ width: 1440, height: 800 });
    await editor(page).focus();
    await expect
      .poll(() => drawn(bar(page)))
      .toEqual(
        expect.arrayContaining([
          'element-scene-heading',
          'element-action',
          'element-character',
          'element-dialogue',
          'element-parenthetical',
          'element-transition',
          'more',
        ]),
      );
    await expect.poll(() => clipping(bar(page))).toEqual(NONE);
  });

  test('folds by the width alone: moving the cursor moves nothing', async ({ page }) => {
    // At 1024 with the panes half and half, some buttons are in More.
    await page.setViewportSize({ width: 1024, height: 800 });
    await setText(page, 'INT. HALL - DAY\n\nMARGARET\n(quietly)\nHello.\n\nShe waits.');
    await editor(page).focus();
    const lines: Array<[number, string]> = [
      [2, 'Character'],
      [3, 'Parenthetical'],
      [4, 'Dialogue'],
      [6, 'Action'],
    ];
    let first: Array<string | undefined> | undefined;
    let chipBox: { x: number; width: number } | null | undefined;
    for (const [line, name] of lines) {
      await page.keyboard.press('ControlOrMeta+Home');
      for (let i = 0; i < line; i++) await page.keyboard.press('ArrowDown');
      await expect(chip(page)).toHaveText(name);
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => done(null))));
      const items = await drawn(bar(page));
      const box = await here(page).boundingBox();
      if (!first) {
        first = items;
        chipBox = box;
        expect(items.length, 'something folds at 1024').toBeLessThan(8);
        continue;
      }
      expect(items, name).toEqual(first);
      expect(box?.width, name).toBe(chipBox?.width);
      expect(box?.x, name).toBe(chipBox?.x);
    }
  });

  test('names the element the cursor is in, a note or a blank line too', async ({ page }) => {
    await setText(
      page,
      'Title: Test\n\n# Act one\n\n= A synopsis\n\n[[A note]]\n\n>THE END<\n\n~La la la\n\n!INT. HALL\n',
    );
    await editor(page).focus();
    const lines: Array<[number, string]> = [
      [0, 'Title page'],
      [1, 'Blank line'],
      [2, 'Section'],
      [4, 'Synopsis'],
      [6, 'Note'],
      [8, 'Centered'],
      [10, 'Lyric'],
      [12, 'Action'],
    ];
    for (const [line, name] of lines) {
      await page.keyboard.press('ControlOrMeta+Home');
      for (let i = 0; i < line; i++) await page.keyboard.press('ArrowDown');
      // As drawn: a blank line's "blank line" is capitalized by its style.
      await expect(chip(page), `line ${line}`).toHaveText(name, { useInnerText: true });
      await expect(chip(page)).toBeVisible();
    }
    // Its name for a screen reader says where the cursor is in full.
    await expect(here(page)).toHaveAccessibleName('You’re in: Action');
  });

  test('a Markdown document’s formatting folds into More when narrow', async ({ page }) => {
    await newMarkdown(page);
    await narrowest(page);
    await expect.poll(() => clipping(markdownBar(page))).toEqual(NONE);
    const more = markdownBar(page).getByRole('button', { name: 'More formatting' });
    await expect(more).toBeVisible();
    const items = await drawn(markdownBar(page));
    expect(items).not.toContain('markdown-code');
    await more.click();
    const menu = page.getByRole('menu');
    for (const name of ['Code', 'Link', 'Quote']) {
      await expect(menu.getByRole('menuitem', { name: new RegExp(`^${name}\\b`) })).toBeVisible();
    }
    await expect(menu.getByRole('menuitem', { name: 'Hide the element bar' })).toBeVisible();
  });

  test('marks show as tooltips, not inline', async ({ page }) => {
    // The chips are their words alone.
    await expect(button(page, 'Character')).toHaveText('Character');
    await expect(button(page, 'Scene')).toHaveText('Scene');
    await expect(button(page, 'Parenthetical')).toHaveText('Parenthetical');
    await expect(bar(page).locator('.mark')).toHaveCount(0);
    // 12px, weight 500.
    const font = await button(page, 'Scene').evaluate((el) => {
      const style = getComputedStyle(el);
      return [style.fontSize, style.fontWeight];
    });
    expect(font).toEqual(['12px', '500']);
    await button(page, 'Character').hover();
    const tip = page.getByRole('tooltip');
    await expect(tip).toContainText('Mark: @');
    await expect(tip).toContainText('A name in capitals');
  });

  test('the current element is drawn in the accent’s soft fill', async ({ page }) => {
    await write(page, 'INT. HALL - DAY\n\nMARGARET\nHello.');
    await expect(button(page, 'Dialogue')).toHaveAttribute('aria-pressed', 'true');
    const fills = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.background = 'var(--accent-soft)';
      document.body.append(probe);
      const soft = getComputedStyle(probe).backgroundColor;
      probe.remove();
      const pressed = document.querySelector('[data-bar-item="element-dialogue"]') as HTMLElement;
      const other = document.querySelector('[data-bar-item="element-action"]') as HTMLElement;
      return {
        soft,
        pressed: getComputedStyle(pressed).backgroundColor,
        other: getComputedStyle(other).backgroundColor,
      };
    });
    expect(fills.pressed).toBe(fills.soft);
    expect(fills.other).not.toBe(fills.soft);
  });

  test('gives way to the script’s title while focus is in another region', async ({ page }) => {
    await expect.poll(() => away(page)).toBe(false);
    await expect(title(page)).toBeHidden();
    // Focus in the Inspector: the title takes the bar's place.
    await page.locator('#tab-right-outline').click();
    await expect.poll(() => away(page)).toBe(true);
    await expect(title(page)).toBeVisible();
    await expect(title(page)).not.toHaveText('');
    // Back in the editor, the bar again.
    await editor(page).focus();
    await expect.poll(() => away(page)).toBe(false);
    await expect(title(page)).toBeHidden();
    // Focus anywhere in the editor's pane shows it, and Shift+Tab from the toggles goes to it.
    await page.locator('#tab-right-outline').focus();
    await expect.poll(() => away(page)).toBe(true);
    const numbers = page
      .getByRole('group', { name: 'Source view' })
      .getByRole('button', { name: 'Line numbers' });
    await numbers.focus();
    await expect.poll(() => away(page)).toBe(false);
    await page.keyboard.press('Shift+Tab');
    await expect
      .poll(() => page.evaluate(() => !!document.activeElement?.closest('[data-element-bar]')))
      .toBe(true);
    await expect.poll(() => away(page)).toBe(false);
    // Its menus keep it: the More menu is drawn outside the pane.
    await button(page, 'More elements').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toBeVisible();
    await expect.poll(() => away(page)).toBe(false);
    await page.keyboard.press('Escape');
    await expect(button(page, 'More elements')).toBeFocused();
    await expect.poll(() => away(page)).toBe(false);
    // Focus on nothing (a click on the Script's pages): the bar, not an empty-looking header.
    await page.locator('#tab-right-outline').click();
    await expect.poll(() => away(page)).toBe(true);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect.poll(() => away(page)).toBe(false);
  });

  test('shows the bar after a load, with focus on nothing', async ({ page }) => {
    await page.reload();
    await expect(editor(page)).toBeVisible();
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
    await expect.poll(() => away(page)).toBe(false);
    await expect(title(page)).toBeHidden();
    await expect(chip(page)).toBeVisible();
  });

  test('Tab from the top bar reaches the bar, folded already, and shows it', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    // Focus in the top bar: the title shows, the bar is unseen but laid out and measured.
    const last = page.getByRole('banner').getByRole('button').last();
    await last.focus();
    await expect.poll(() => away(page)).toBe(true);
    const unseen = await drawn(bar(page));
    expect(unseen.length, 'something folds at 1024, while unseen too').toBeLessThan(8);
    let reached = false;
    for (let i = 0; i < 8 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() => !!document.activeElement?.closest('[data-element-bar]'));
    }
    expect(reached, 'Tab reaches the element bar').toBe(true);
    await expect.poll(() => away(page)).toBe(false);
    const focused = page.locator('[data-element-bar] :focus-visible');
    await expect(focused).toHaveCount(1);
    const box = await bar(page).boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(100);
    // The fold it was measured to while unseen is the one it shows.
    expect(await drawn(bar(page))).toEqual(unseen);
  });

  test('a click on the header’s empty space keeps the editor’s focus', async ({ page }) => {
    await write(page, 'She waits.');
    const box = await bar(page).boundingBox();
    const spacer = await bar(page).locator('.spacer').boundingBox();
    expect(spacer?.width ?? 0).toBeGreaterThan(4);
    await page.mouse.click(
      (spacer?.x ?? 0) + (spacer?.width ?? 0) / 2,
      (box?.y ?? 0) + (box?.height ?? 0) / 2,
    );
    await expect(editor(page)).toBeFocused();
  });
});
