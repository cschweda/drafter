import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import {
  closeSettings,
  editor,
  openSettings,
  palette,
  runCommand,
  setText,
  settingsDialog,
  start,
  stored,
  textOf,
  wholeText,
} from './modules';
import { drafterDatabase, sampleSeenRows } from './seed';

// The Structure strip (docs/drafter-structure-strip-design.md): a band above both panes with a row
// per section depth the script uses, a row of scenes, and a page ruler. It is off by default, so
// these tests start with the setting stored on (Call 24), as playwright.config.ts builds its own
// storage state.

const port = Number(process.env.E2E_PORT ?? 4173);
const withStrip = {
  storageState: {
    cookies: [],
    origins: [
      {
        origin: `http://localhost:${port}`,
        localStorage: [{ name: 'drafter-tour-v1', value: 'true' }],
        indexedDB: [drafterDatabase([...sampleSeenRows, { key: 'structureStrip', value: true }])],
      },
    ],
  },
};

const strip = (page: Page) => page.getByRole('group', { name: 'Structure strip' });
const stripRow = (page: Page, name: string) =>
  strip(page).getByRole('group', { name, exact: true });
const scenes = (page: Page) => stripRow(page, 'Scenes').getByRole('button');

const SAMPLE = new URL('../../../samples/screenplay.fountain', import.meta.url);

/** A screenplay of `scenes` scenes, about two fifths of a page each; every heading is unique. */
function longScript(scenes: number): string {
  let text = 'Title: The Long Night\nAuthor: A. Writer\n\n';
  for (let i = 1; i <= scenes; i++) {
    text += `INT. ROOM ${i} - NIGHT\n\n`;
    for (let beat = 1; beat <= 5; beat++) {
      text += `Scene ${i}, beat ${beat}: she crosses the room and looks out at the rain for a long while.\n\n`;
    }
    text += `MARGARET\nThis is line ${i} of what she says.\n\n`;
  }
  return text;
}

const scriptHost = (page: Page) => page.locator('.script-host');
/** The strip by pages: its ruler has numbers. */
const paged = (page: Page) => expect(strip(page).locator('.ruler .number').first()).toBeVisible();
/** The strip's one tab stop. */
const tabStop = (page: Page) => strip(page).locator('button[tabindex="0"]');
const focusedName = (page: Page) =>
  page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null);

/** Whether `line` of the Script pane is inside the pane's visible box. */
const scriptShows = (page: Page, line: string) =>
  scriptHost(page).evaluate((host, text) => {
    const box = host.getBoundingClientRect();
    const el = [...host.querySelectorAll('.drafter-line')].find((l) => l.textContent === text);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.top >= box.top && r.bottom <= box.bottom;
  }, line);

/** An act and two scenes, short enough that the Source draws every line. */
const SHORT =
  '# Act One\n\nINT. KITCHEN - NIGHT\n\nAnn waits.\n\nEXT. BACK PORCH - LATER\n\nBen runs.\n';

/** Puts the cursor at the start of the Source line `line`. */
async function cursorOn(page: Page, line: string) {
  await editor(page).locator('.cm-line', { hasText: line }).first().click();
  await page.keyboard.press('Home');
}

/** Scrolls `selector` with the mouse wheel, as a reader does. */
async function wheel(page: Page, selector: string, dy: number) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`No ${selector} to scroll.`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let done = 0; done < dy; done += 400) {
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(30);
  }
}

test.describe('with the strip on', () => {
  test.use(withStrip);
  test.beforeEach(() => {
    test.skip(test.info().project.name.startsWith('phone'), 'a phone shows no strip');
  });

  test('shows a row per section level, the scenes, and a ruler', async ({ page }) => {
    await start(page);
    await setText(page, await readFile(SAMPLE, 'utf8'));
    await expect(strip(page)).toBeVisible();
    // The sample has one section depth (# Act One) and two scenes.
    const acts = stripRow(page, 'Sections marked #').getByRole('button');
    await expect(acts).toHaveCount(1);
    await expect(acts.first()).toHaveAccessibleName(/^Act One, 2 scenes/);
    await expect(scenes(page)).toHaveCount(2);
    await expect(scenes(page).first()).toHaveAccessibleName(/^Scene 1, INT\. KITCHEN - NIGHT/);
    await expect(scenes(page).first()).toContainText('1 INT. KITCHEN - NIGHT');
    await expect(scenes(page).nth(1)).toHaveAccessibleName(/^Scene 2, EXT\. BACK PORCH - LATER/);
    await expect(stripRow(page, 'Sections marked ##')).toHaveCount(0);
    // The row marks and the ruler are for the eye: the groups carry the names.
    const marks = strip(page).locator('.marks');
    await expect(marks).toHaveAttribute('aria-hidden', 'true');
    await expect(marks).toHaveText(/#\s*Scenes/);
    const ruler = strip(page).locator('.ruler');
    await expect(ruler).toHaveAttribute('aria-hidden', 'true');
    await expect(ruler).toBeVisible();
    await expect(ruler.locator('.number').first()).toHaveText('1');
    // The two scenes tile the whole width, the act sits exactly above them, and no block is
    // narrower than nothing.
    const boxes = await strip(page)
      .locator('[role="group"][aria-label] button')
      .evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { left: r.left, right: r.right };
        }),
      );
    const [act, first, second] = boxes as Array<{ left: number; right: number }>;
    expect(Math.abs((act?.left ?? 0) - (first?.left ?? 1))).toBeLessThan(1);
    expect(Math.abs((act?.right ?? 0) - (second?.right ?? 1))).toBeLessThan(1);
    expect(Math.abs((first?.right ?? 0) - (second?.left ?? 1))).toBeLessThan(1);
    // At most 18 px a row plus 14 px of ruler (Call 27), with the borders.
    const height = await strip(page).evaluate((el) => el.getBoundingClientRect().height);
    expect(height).toBeLessThanOrEqual(2 * 18 + 14 + 2);
  });

  test('colors a scene by its color note, and names the color', async ({ page }) => {
    await start(page);
    await setText(
      page,
      [
        'INT. HALL - DAY',
        '',
        '[[Color: Blue]]',
        '',
        'Ann waits.',
        '',
        'EXT. YARD - NIGHT',
        '',
        '[[Color: Chartreuse]]',
        '',
        'Ben runs.',
        '',
      ].join('\n'),
    );
    await expect(scenes(page)).toHaveCount(2);
    const hall = scenes(page).first();
    const yard = scenes(page).nth(1);
    await expect(hall).toHaveAccessibleName(/^Scene 1, INT\. HALL - DAY, blue/);
    // The swatch's own blue (#4a86d9) is the block's bottom edge; the fill is a tint of it.
    await expect(hall).toHaveCSS('border-bottom-color', 'rgb(74, 134, 217)');
    const fills = await Promise.all(
      [hall, yard].map((block) => block.evaluate((el) => getComputedStyle(el).backgroundColor)),
    );
    expect(fills[0]).not.toBe(fills[1]);
    // A word Drafter doesn't know is named, and drawn neutral.
    await expect(yard).toHaveAccessibleName(/^Scene 2, EXT\. YARD - NIGHT, chartreuse/);
    await expect(yard).toHaveCSS('border-bottom-width', '0px');
  });

  test('keeps a section with no scenes at the far right inside the strip', async ({ page }) => {
    await start(page);
    await setText(page, 'INT. HALL - DAY\n\nAnn waits.\n\n# Epilogue\n');
    const tick = stripRow(page, 'Sections marked #').getByRole('button');
    await expect(tick).toHaveAccessibleName(/^Epilogue/);
    const [block, track] = await Promise.all([
      tick.boundingBox(),
      strip(page).locator('.track').boundingBox(),
    ]);
    expect((block?.x ?? 0) + (block?.width ?? 0)).toBeLessThanOrEqual(
      (track?.x ?? 0) + (track?.width ?? 0) + 0.5,
    );
  });

  test('shows one line for a script with no scenes', async ({ page }) => {
    await start(page);
    await setText(page, '# Act One\n\n= Something happens.\n');
    await expect(strip(page)).toHaveText('No scenes yet. Each scene heading you write shows here.');
    await expect(strip(page).getByRole('button')).toHaveCount(0);
  });

  test('keeps its blocks while typing adds a block', async ({ page }) => {
    await start(page);
    await setText(page, await readFile(SAMPLE, 'utf8'));
    await expect(scenes(page)).toHaveCount(2);
    // Wait for the strip by pages, then watch it at every change: the scenes row's buttons never
    // all go, and the ruler (drawn only by pages) never goes, so the strip neither empties nor
    // falls back to words while the layout catches up (Call 6).
    await expect(strip(page).locator('.ruler')).toBeVisible();
    await page.evaluate(() => {
      const w = window as unknown as { stripLeast: number; rulerLost: boolean };
      const count = () =>
        document.querySelectorAll('[role="group"][aria-label="Scenes"] button').length;
      w.stripLeast = count();
      w.rulerLost = false;
      new MutationObserver(() => {
        w.stripLeast = Math.min(w.stripLeast, count());
        if (!document.querySelector('[aria-label="Structure strip"] .ruler')) w.rulerLost = true;
      }).observe(document.body, { childList: true, subtree: true, attributes: true });
    });
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+End');
    for (let i = 0; i < 10; i++) await page.keyboard.press('Enter');
    await page.keyboard.type('INT. SHED - DAY');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Rain.');
    await expect(scenes(page)).toHaveCount(3);
    expect(
      await page.evaluate(() => {
        const w = window as unknown as { stripLeast: number; rulerLost: boolean };
        return { least: w.stripLeast, rulerLost: w.rulerLost };
      }),
    ).toEqual({ least: 2, rulerLost: false });
  });
});

test.describe('going there, and where you are', () => {
  test.use(withStrip);
  test.beforeEach(() => {
    test.skip(test.info().project.name.startsWith('phone'), 'a phone shows no strip');
  });

  test("loading a script and the layout's answer never move the panes", async ({ page }) => {
    // From the frame a loaded script's strip first shows until its ruler is numbered, and a
    // moment after, the Source pane's top stays put under the strip: the ruler's row is kept while the strip is
    // by words, before the layout answers.
    await page.addInitScript(() => {
      const w = window as unknown as { tops: number[] };
      w.tops = [];
      const frame = () => {
        // The long script's strip: from the frame it first shows its 200 scenes.
        const band = document.querySelector('[aria-label="Structure strip"]');
        const loaded = band?.querySelectorAll('[aria-label="Scenes"] button').length === 200;
        const source = document.querySelector('.cm-editor')?.closest('[data-pane]');
        // Measured from the strip's own top: the bars above it in `.top` (the storage warning,
        // say) come and go on their own timing, which is not the strip's doing.
        if (band && loaded && source) {
          w.tops.push(
            Math.round(source.getBoundingClientRect().top - band.getBoundingClientRect().top),
          );
        }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    await start(page);
    // A long script, so its layout takes a moment after the load.
    await setText(page, longScript(200));
    await paged(page);
    await expect(strip(page).getByRole('button')).toHaveCount(200);
    await page.waitForTimeout(1500);
    // Loaded again, from the recovery copy: the index first, by words, then the layout's pages.
    await page.reload();
    await paged(page);
    await page.waitForTimeout(300);
    const tops = await page.evaluate(() => (window as unknown as { tops: number[] }).tops);
    expect(tops.length).toBeGreaterThan(0);
    expect(new Set(tops).size, `the Source pane moved: ${[...new Set(tops)]}`).toBe(1);
  });

  test('clicking a scene puts the cursor on its heading and the Script pane shows it', async ({
    page,
  }) => {
    await start(page);
    await setText(page, longScript(40));
    await page.keyboard.press('ControlOrMeta+Home');
    await paged(page);
    await expect.poll(() => scriptShows(page, 'INT. ROOM 30 - NIGHT')).toBe(false);
    await scenes(page).nth(29).click();
    await expect(editor(page)).toBeFocused();
    await expect.poll(() => scriptShows(page, 'INT. ROOM 30 - NIGHT')).toBe(true);
    await page.keyboard.insertText('X');
    expect(await textOf(page)).toContain('XINT. ROOM 30 - NIGHT');
  });

  test('clicking a section goes to its line', async ({ page }) => {
    await start(page);
    await setText(page, await readFile(SAMPLE, 'utf8'));
    await page.keyboard.press('ControlOrMeta+End');
    await stripRow(page, 'Sections marked #').getByRole('button').click();
    await expect(editor(page)).toBeFocused();
    await page.keyboard.insertText('X');
    expect(await textOf(page)).toContain('\nX# Act One\n');
  });

  test('is one Tab stop, and the arrows move along and between rows', async ({ page }) => {
    await start(page);
    await setText(page, await readFile(SAMPLE, 'utf8'));
    await paged(page);
    // The cursor before the first scene: the tab stop is the first scene.
    await page.keyboard.press('ControlOrMeta+Home');
    await expect(tabStop(page)).toHaveCount(1);
    await expect(tabStop(page)).toHaveAccessibleName(/^Scene 1/);
    const scrolls = () =>
      page.evaluate(() =>
        ['.cm-scroller', '.script-host'].map((s) => document.querySelector(s)?.scrollTop ?? null),
      );
    const before = await scrolls();
    await tabStop(page).focus();
    expect(await focusedName(page)).toMatch(/^Scene 1, INT\. KITCHEN/);
    await page.keyboard.press('ArrowRight');
    expect(await focusedName(page)).toMatch(/^Scene 2, EXT\. BACK PORCH/);
    await expect(tabStop(page)).toHaveCount(1);
    await expect(tabStop(page)).toHaveAccessibleName(/^Scene 2/);
    // The end of the row: nothing further.
    await page.keyboard.press('ArrowRight');
    expect(await focusedName(page)).toMatch(/^Scene 2/);
    await page.keyboard.press('Home');
    expect(await focusedName(page)).toMatch(/^Scene 1/);
    await page.keyboard.press('End');
    expect(await focusedName(page)).toMatch(/^Scene 2/);
    await page.keyboard.press('ArrowUp');
    expect(await focusedName(page)).toMatch(/^Act One/);
    await page.keyboard.press('ArrowUp');
    expect(await focusedName(page)).toMatch(/^Act One/);
    await page.keyboard.press('ArrowDown');
    expect(await focusedName(page)).toMatch(/^Scene 1, INT\. KITCHEN/);
    // The arrows don't scroll the panes or move anything else.
    expect(await scrolls()).toEqual(before);
    // Tab leaves the strip, and Shift+Tab comes back to the block last focused.
    const last = await focusedName(page);
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(() =>
        Boolean(document.activeElement?.closest('[aria-label="Structure strip"]')),
      ),
    ).toBe(false);
    await page.keyboard.press('Shift+Tab');
    expect(await focusedName(page)).toBe(last);
  });

  test('Enter and Space go to the focused block', async ({ page }) => {
    await start(page);
    await setText(page, await readFile(SAMPLE, 'utf8'));
    await scenes(page).nth(1).focus();
    await page.keyboard.press('Enter');
    await expect(editor(page)).toBeFocused();
    await page.keyboard.insertText('X');
    // Exactly the X: the Enter that went there typed nothing.
    const sample = await readFile(SAMPLE, 'utf8');
    expect(await wholeText(page)).toBe(
      sample.replace('EXT. BACK PORCH - LATER', 'XEXT. BACK PORCH - LATER'),
    );
    await stripRow(page, 'Sections marked #').getByRole('button').focus();
    await page.keyboard.press(' ');
    await expect(editor(page)).toBeFocused();
    await page.keyboard.insertText('Y');
    expect(await textOf(page)).toContain('\nY# Act One\n');
  });

  test("focus enters on the cursor's scene", async ({ page }) => {
    await start(page);
    await setText(page, SHORT);
    await paged(page);
    await cursorOn(page, 'EXT. BACK PORCH - LATER');
    await expect(tabStop(page)).toHaveAccessibleName(/^Scene 2, EXT\. BACK PORCH/);
    await cursorOn(page, 'INT. KITCHEN - NIGHT');
    await expect(tabStop(page)).toHaveAccessibleName(/^Scene 1, INT\. KITCHEN/);
  });

  test("marks the cursor's scene and its sections as the cursor moves", async ({ page }) => {
    await start(page);
    await setText(page, SHORT);
    const act = stripRow(page, 'Sections marked #').getByRole('button');
    const marked = strip(page).locator('[aria-current="location"]');
    // The act's line is before the first scene: nothing is marked.
    await page.keyboard.press('ControlOrMeta+Home');
    await expect(marked).toHaveCount(0);
    await cursorOn(page, 'INT. KITCHEN - NIGHT');
    await expect(scenes(page).first()).toHaveAttribute('aria-current', 'location');
    await expect(act).toHaveAttribute('aria-current', 'location');
    await expect(marked).toHaveCount(2);
    await expect(scenes(page).first()).toHaveCSS('outline-style', 'solid');
    await cursorOn(page, 'EXT. BACK PORCH - LATER');
    await expect(scenes(page).nth(1)).toHaveAttribute('aria-current', 'location');
    await expect(scenes(page).first()).not.toHaveAttribute('aria-current', /./);
    await expect(marked).toHaveCount(2);
  });

  test('the in-view marker follows the Script pane as it scrolls', async ({ page }) => {
    await start(page);
    await setText(page, longScript(40));
    await page.keyboard.press('ControlOrMeta+Home');
    await paged(page);
    const marker = strip(page).locator('.ruler .in-view');
    await expect(marker).toBeVisible();
    await expect(marker).toHaveAttribute('aria-hidden', 'true');
    const left = () => marker.evaluate((el) => el.getBoundingClientRect().left);
    const before = await left();
    await wheel(page, '.script-host', 4000);
    await expect.poll(left).toBeGreaterThan(before + 20);
    const middle = await left();
    await wheel(page, '.script-host', 4000);
    await expect.poll(left).toBeGreaterThan(middle + 20);
    // With the Script pane gone, so is the marker.
    await page.locator('#tab-right-outline').click();
    await expect(scriptHost(page)).toHaveCount(0);
    await expect(marker).toHaveCount(0);
  });

  test('hovering and focusing show the card with the page, length, and goal', async ({ page }) => {
    await start(page);
    await setText(
      page,
      (await readFile(SAMPLE, 'utf8')).replace(
        'INT. KITCHEN - NIGHT\n',
        'INT. KITCHEN - NIGHT\n\n[[Goal: Get Danny to stay.]]\n',
      ),
    );
    await paged(page);
    const card = strip(page).locator('.card');
    await expect(card).toHaveCount(0);
    const kitchen = scenes(page).first();
    await kitchen.hover();
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('aria-hidden', 'true');
    await expect(card).toContainText('Scene 1, INT. KITCHEN - NIGHT');
    await expect(card).toContainText(/page 1 · \d/);
    await expect(card).toContainText('Goal: Get Danny to stay.');
    // Under the block, never over it, and inside the strip's width.
    const boxes = async () => {
      const [b, c, s] = await Promise.all([kitchen, card, strip(page)].map((l) => l.boundingBox()));
      return { b, c, s };
    };
    const { b, c, s } = await boxes();
    expect(c?.y ?? 0).toBeGreaterThanOrEqual((b?.y ?? 0) + (b?.height ?? 0));
    expect(c?.x ?? -1).toBeGreaterThanOrEqual((s?.x ?? 0) - 0.5);
    // Leaving takes it away.
    await page.mouse.move(5, 400);
    await expect(card).toHaveCount(0);
    // Focus shows the last scene's, still inside the strip at its right edge.
    const porch = scenes(page).nth(1);
    await porch.focus();
    await expect(card).toContainText('Scene 2, EXT. BACK PORCH - LATER');
    const after = await boxes();
    expect((after.c?.x ?? 0) + (after.c?.width ?? 0)).toBeLessThanOrEqual(
      (after.s?.x ?? 0) + (after.s?.width ?? 0) + 0.5,
    );
    // Hovering another block shows its card; leaving it shows the focused block's again.
    await kitchen.hover();
    await expect(card).toContainText('Scene 1, INT. KITCHEN - NIGHT');
    await page.mouse.move(5, 400);
    await expect(card).toContainText('Scene 2, EXT. BACK PORCH - LATER');
    // A section's card: its title and its scenes.
    await page.keyboard.press('ArrowUp');
    await expect(card).toContainText('Act One');
    await expect(card).toContainText(/2 scenes/);
    await page.keyboard.press('Tab');
    await expect(card).toHaveCount(0);
  });

  test("the card shows a scene's time and its estimate from the dialogue", async ({ page }) => {
    await start(page);
    await setText(page, await readFile(SAMPLE, 'utf8'));
    await paged(page);
    const card = strip(page).locator('.card');
    const kitchen = scenes(page).first();
    await kitchen.hover();
    // 1 1/8 pages at a minute a page; the dialogue's words at 150 a minute and its lines of action
    // at 1.5 s come to about 50 s.
    await expect(card).toContainText('page 1 · 1 1/8 pp · 1 min 10 s');
    await expect(card).toContainText('Estimate from the dialogue: 50 s');
    // Its name says both, as the card is for the eye.
    await expect(kitchen).toHaveAccessibleName(
      'Scene 1, INT. KITCHEN - NIGHT, page 1, 1 1/8 pages, about 1 minute 10 seconds, estimate from the dialogue about 50 seconds',
    );
    // An act's are its scenes' totals.
    const act = stripRow(page, 'Sections marked #').getByRole('button').first();
    await act.hover();
    await expect(card).toContainText('2 scenes · 1 3/8 pp · 1 min 25 s');
    await expect(card).toContainText('Estimate from the dialogue: 1 min');
  });

  test('in a read-only tab, shows the strip and goes to a scene', async ({ context }) => {
    const first = await context.newPage();
    await start(first);
    await setText(first, await readFile(SAMPLE, 'utf8'));
    await expect(scenes(first)).toHaveCount(2);
    const second = await context.newPage();
    await second.goto('/');
    await expect(second.getByText('This script is open for editing in another tab.')).toBeVisible();
    await expect(scenes(second)).toHaveCount(2);
    await scenes(second).nth(1).click();
    await expect(editor(second)).toBeFocused();
    await expect(scenes(second).nth(1)).toHaveAttribute('aria-current', 'location');
    await expect.poll(() => scriptShows(second, 'EXT. BACK PORCH - LATER')).toBe(true);
    // Still read-only: going there changed nothing.
    await expect(second.getByText('This script is open for editing in another tab.')).toBeVisible();
  });
});

test('is not shown until it is turned on', async ({ page }) => {
  await start(page);
  await setText(page, 'INT. HALL - DAY\n\nAnn waits.\n');
  await expect(editor(page)).toContainText('Ann waits.');
  await expect(page.locator('.top')).toBeVisible();
  await expect(strip(page)).toHaveCount(0);
});

// ---- Turning it on and off (structure strip design §5, Calls 14–16, 30–32) -------------------

const structureButton = (page: Page) =>
  page.getByRole('banner').getByRole('button', { name: 'Structure', exact: true });
const stripSwitch = (page: Page) =>
  settingsDialog(page).getByRole('switch', { name: 'Structure strip', exact: true });
const TOGGLE = 'Toggle the structure strip';
const NOT_FOR_MARKDOWN = 'A Markdown document has no scenes.';
/** Mod+Alt+O, the strip's key (Call 31). */
const pressToggle = (page: Page) => page.keyboard.press('ControlOrMeta+Alt+o');
const inStrip = (page: Page) =>
  page.evaluate(() => Boolean(document.activeElement?.closest('[aria-label="Structure strip"]')));

async function newMarkdown(page: Page) {
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page
    .getByRole('group', { name: 'Scripts', exact: true })
    .getByRole('button', { name: 'New Markdown document' })
    .click();
  await expect(editor(page)).toContainText('# Untitled');
}

test.describe('turning it on and off', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name.startsWith('phone'), 'a phone shows no strip');
  });

  test('the toolbar button, Mod+Alt+O, the palette, and Settings turn the same strip on and off, and it is remembered after a reload', async ({
    page,
  }) => {
    await start(page);
    await setText(page, await readFile(SAMPLE, 'utf8'));
    await expect(strip(page)).toHaveCount(0);
    // The toolbar button.
    await structureButton(page).click();
    await expect(scenes(page)).toHaveCount(2);
    await expect.poll(async () => (await stored(page)).structureStrip).toBe(true);
    // The key, with focus in the editor.
    await editor(page).click();
    await pressToggle(page);
    await expect(strip(page)).toHaveCount(0);
    await expect.poll(async () => (await stored(page)).structureStrip).toBe(false);
    // The palette, which shows the key.
    await page.keyboard.press('ControlOrMeta+k');
    await palette(page).locator('input').fill(TOGGLE);
    const row = palette(page).getByRole('option', { name: new RegExp(`^${TOGGLE}`) });
    await expect(row).toContainText(/Ctrl\+Alt\+O|⌘⌥O/);
    await row.click();
    await expect(scenes(page)).toHaveCount(2);
    // Settings, which shows what the others set.
    await openSettings(page);
    await expect(stripSwitch(page)).toBeChecked();
    await stripSwitch(page).click();
    await expect(stripSwitch(page)).not.toBeChecked();
    await expect(strip(page)).toHaveCount(0);
    await stripSwitch(page).click();
    await expect(stripSwitch(page)).toBeChecked();
    await closeSettings(page);
    await expect(scenes(page)).toHaveCount(2);
    // Remembered.
    await page.reload();
    await expect(scenes(page)).toHaveCount(2);
    await expect(structureButton(page)).toHaveAttribute('aria-pressed', 'true');
  });

  test('the toolbar button is pressed while the strip shows', async ({ page }) => {
    await start(page);
    const button = structureButton(page);
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    // The fifth round action, after Focus, in its own color (Call 30).
    const labels = await page.getByRole('banner').locator('.actions .act .label').allTextContents();
    expect(labels.slice(0, 5)).toEqual(['Open', 'Save', 'Export', 'Focus', 'Structure']);
    await expect(button.locator('.round')).toHaveCSS('background-color', 'rgb(183, 166, 230)');
    await button.click();
    await expect(strip(page)).toBeVisible();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await button.click();
    await expect(strip(page)).toHaveCount(0);
    await expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  test('is not shown for a Markdown document, and the button and command say why', async ({
    page,
  }) => {
    await start(page);
    await structureButton(page).click();
    await expect(strip(page)).toBeVisible();
    await newMarkdown(page);
    await expect(strip(page)).toHaveCount(0);
    const button = structureButton(page);
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    await expect(button).toHaveAttribute('title', NOT_FOR_MARKDOWN);
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    // Neither the button nor the key does anything: the setting stays on.
    await button.click({ force: true });
    await editor(page).click();
    await pressToggle(page);
    await expect(strip(page)).toHaveCount(0);
    expect((await stored(page)).structureStrip).toBe(true);
    // The palette doesn't offer it.
    await page.keyboard.press('ControlOrMeta+k');
    await palette(page).locator('input').fill(TOGGLE);
    await expect(palette(page).getByRole('option', { name: new RegExp(TOGGLE) })).toHaveCount(0);
    await page.keyboard.press('Escape');
    // Back in a screenplay, the strip is back.
    await page.keyboard.press('ControlOrMeta+Alt+n');
    await expect(strip(page)).toBeVisible();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(button).not.toHaveAttribute('title', /./);
  });

  test('turned on after the Script pane has scrolled, the marker shows where it is', async ({
    page,
  }) => {
    await start(page);
    await setText(page, longScript(40));
    await page.keyboard.press('ControlOrMeta+Home');
    await expect(scriptHost(page).locator('.drafter-page').nth(10)).toBeAttached();
    await wheel(page, '.script-host', 8000);
    await structureButton(page).click();
    await paged(page);
    const marker = strip(page).locator('.ruler .in-view');
    await expect(marker).toBeVisible();
    const [at, track] = await Promise.all([
      marker.evaluate((el) => el.getBoundingClientRect().left),
      strip(page)
        .locator('.track')
        .evaluate((el) => el.getBoundingClientRect().left),
    ]);
    expect(at - track).toBeGreaterThan(50);
  });
});

test.describe('turning it on and off, with the strip on', () => {
  test.use(withStrip);
  test.beforeEach(() => {
    test.skip(test.info().project.name.startsWith('phone'), 'a phone shows no strip');
  });

  test('focus mode hides it, and it is back after', async ({ page }) => {
    await start(page);
    await setText(page, await readFile(SAMPLE, 'utf8'));
    await expect(scenes(page)).toHaveCount(2);
    await page.keyboard.press('ControlOrMeta+Shift+Enter');
    await expect(page.getByRole('button', { name: 'Leave focus mode' })).toBeVisible();
    await expect(strip(page)).toHaveCount(0);
    await expect(structureButton(page)).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+Shift+Enter');
    await expect(scenes(page)).toHaveCount(2);
    await expect(structureButton(page)).toHaveAttribute('aria-pressed', 'true');
    // Entered with a block focused, focus goes to the editor.
    await scenes(page).first().focus();
    await page.keyboard.press('ControlOrMeta+Shift+Enter');
    await expect(strip(page)).toHaveCount(0);
    await expect(editor(page)).toBeFocused();
    await page.keyboard.press('ControlOrMeta+Shift+Enter');
  });

  test('puts focus in the editor when the strip goes with focus in it', async ({ page }) => {
    await start(page);
    await setText(page, await readFile(SAMPLE, 'utf8'));
    // Mod+Alt+O with a block focused.
    await scenes(page).nth(1).focus();
    expect(await inStrip(page)).toBe(true);
    await pressToggle(page);
    await expect(strip(page)).toHaveCount(0);
    await expect(editor(page)).toBeFocused();
    // A switch to Markdown with a block focused: the palette gives focus back to the block, and
    // the new document takes the strip away.
    await pressToggle(page);
    await expect(scenes(page)).toHaveCount(2);
    await scenes(page).first().focus();
    await runCommand(page, 'New Markdown document');
    await expect(editor(page)).toContainText('# Untitled');
    await expect(strip(page)).toHaveCount(0);
    await expect(editor(page)).toBeFocused();
  });
});

test.describe('on a phone', () => {
  test.use(withStrip);

  test('is not shown on a phone, and neither is its button', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await start(page);
    await expect(editor(page)).toContainText('The Call');
    await expect(strip(page)).toHaveCount(0);
    // The button is there, but the phone's styles hide it.
    const button = page.getByRole('banner').locator('.act.structure');
    await expect(button).toHaveCount(1);
    await expect(button).toHaveCSS('display', 'none');
    await expect(structureButton(page)).toBeHidden();
    // The key does nothing there, and the setting stays as it was (Call 16).
    await pressToggle(page);
    await expect(strip(page)).toHaveCount(0);
    expect((await stored(page)).structureStrip).toBe(true);
  });
});

// The Structure button is the fifth action, so at the narrowest wide screen the toolbar must still
// fit one row: the template chip gives way first, cut short with an ellipsis.
test.describe('the toolbar at 1024 px', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name.startsWith('phone'), 'a phone has the icon toolbar');
  });

  async function fitsOneRow(page: Page) {
    const fit = await page.evaluate(() => {
      const toolbar = document.querySelector('header.toolbar') as HTMLElement;
      const controls = Array.from(toolbar.querySelectorAll<HTMLElement>('.act, .chip')).filter(
        (el) => el.offsetParent !== null,
      );
      const boxes = controls.map((el) => el.getBoundingClientRect());
      return {
        page: document.documentElement.scrollWidth,
        width: innerWidth,
        toolbar: [toolbar.scrollWidth, toolbar.clientWidth],
        right: Math.max(...boxes.map((b) => b.right)),
        tallest: Math.max(...boxes.map((b) => b.height)),
        tops: boxes.map((b) => Math.round(b.top + b.height / 2)),
      };
    });
    expect(fit.page).toBeLessThanOrEqual(fit.width);
    expect(fit.toolbar[0]).toBeLessThanOrEqual(fit.toolbar[1] as number);
    expect(fit.right).toBeLessThanOrEqual(fit.width);
    // One row: no control's label wraps, and every control sits on the same line.
    expect(fit.tallest).toBeLessThanOrEqual(30);
    expect(Math.max(...fit.tops) - Math.min(...fit.tops)).toBeLessThanOrEqual(2);
  }

  test('keeps the toolbar on one row in a Markdown document', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await start(page);
    await newMarkdown(page);
    await expect(structureButton(page)).toHaveAttribute('aria-disabled', 'true');
    await fitsOneRow(page);
    // The chip is cut short on screen, but its name is whole.
    await expect(page.getByRole('banner').locator('.chip.template')).toHaveAccessibleName(
      /^Document: /,
    );
  });

  test('keeps the toolbar on one row for a fallback screenplay', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await start(page);
    await setText(
      page,
      'INT. HALL - DAY\n\nShe waits.\n\n/* drafter\n{"v":1,"template":"my-own"}\n*/\n',
    );
    const chip = page.getByRole('banner').locator('.chip.template');
    await expect(chip).toHaveText('Screenplay (fallback)');
    await fitsOneRow(page);
    await expect(chip).toHaveAccessibleName('Template: Screenplay (fallback)');
  });
});
