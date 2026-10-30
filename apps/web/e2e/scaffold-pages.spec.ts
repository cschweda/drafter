import { expect, type Locator, type Page, test } from '@playwright/test';
import { chooseTab, editor, palette, paletteInput, runCommand, setText, start } from './modules';

// Scaffold's character and location pages, and its Cast and Places (seeing-the-script design
// §5.3–§5.7): links from the scene page, the lists, and the Stats tab; Back and Alt+Left; a line
// that goes to its cue; and figures that agree with the Stats tab's. The scene page's own tests are
// in scaffold.spec.ts, the accessibility tests in a11y.spec.ts.

const scaffold = (page: Page) => page.getByRole('tabpanel', { name: 'Scaffold', exact: true });
const heading = (page: Page) => scaffold(page).getByRole('heading', { level: 2 });
const table = (page: Page, name: RegExp | string) =>
  scaffold(page).getByRole('table', { name: typeof name === 'string' ? name : name });
const link = (page: Page, name: string) => scaffold(page).getByRole('link', { name, exact: true });
const backButton = (page: Page) => page.getByRole('button', { name: 'Back', exact: true });
const followButton = (page: Page) =>
  page.getByRole('button', { name: 'Follow the cursor', exact: true });
/** A fact of a page's list, by its term. */
const fact = (page: Page, term: string) =>
  scaffold(page)
    .locator('dt', { hasText: new RegExp(`^${term}$`) })
    .locator('+ dd');

/** A line of the lighthouse keeper's, numbered, of invented words. */
const said = (n: number) => `Wick ${n} glims and the brasswort settles.`;

/**
 * A lighthouse, written for these tests. NELL speaks 212 times: once in each of the first two
 * scenes, then 21 times in each of ten lamp room scenes (one of them out on its rail). ÉLODIE comes
 * and goes; FENN is named asleep in the first scene, then speaks twice.
 */
function lighthouse(): string {
  const out = [
    'Title: The Long Light',
    '',
    'INT. LAMP ROOM - NIGHT',
    '',
    'NELL trims the wick. FENN sleeps below the stair.',
    '',
    'NELL',
    'Light it.',
    '',
    'ÉLODIE',
    '(climbing up)',
    'The supply boat is late.',
    '',
    'EXT. GALLERY - DAWN',
    '',
    'NELL',
    'Fog on the water.',
    '',
    'FENN',
    'Always fog.',
    '',
    'INT. SUPPLY BOAT - DAY',
    '',
    'FENN',
    'Hand me the crate.',
    '',
    'ÉLODIE',
    'It is heavier than it looks.',
  ];
  let n = 0;
  for (let s = 0; s < 10; s++) {
    out.push('', s === 4 ? 'EXT. LAMP ROOM - NIGHT' : 'INT. LAMP ROOM - NIGHT', '');
    for (let i = 0; i < 21; i++) out.push('NELL', said(++n), '');
    out.push('ÉLODIE', `Night ${s + 1}.`);
  }
  return `${out.join('\n')}\n`;
}

/** The lighthouse in the editor, the cursor in its first scene, Scaffold shown from the palette. */
async function showLighthouse(page: Page) {
  await start(page);
  await setText(page, lighthouse());
  await cursorOnLine(page, 'Light it.');
  await runCommand(page, 'Show Scaffold');
  await expect(heading(page)).toHaveText('Scene 1 · INT. LAMP ROOM - NIGHT');
}

/** Puts the cursor on the line holding `text`, by the palette's Go to line. */
async function cursorOnLine(page: Page, text: string) {
  const line = lighthouse().split('\n').indexOf(text) + 1;
  await page.keyboard.press('ControlOrMeta+k');
  await expect(paletteInput(page)).toBeFocused();
  await paletteInput(page).fill(String(line));
  await expect(palette(page).getByRole('option').first()).toHaveAccessibleName(
    new RegExp(`^Go to line ${line}\\b`),
  );
  await expect(palette(page).locator('[role="option"][data-highlighted]')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(palette(page)).toBeHidden();
}

/** The text of the line holding the cursor, once the editor has focus (it keeps its selection). */
async function cursorLine(page: Page) {
  await editor(page).focus();
  return page.evaluate(() => {
    const node = getSelection()?.anchorNode;
    const element = node instanceof Element ? node : node?.parentElement;
    return element?.closest('.cm-line')?.textContent ?? null;
  });
}

/** Opens a link or presses a button from the keyboard (Safari doesn't focus what it clicks). */
async function press(page: Page, target: Locator) {
  await target.focus();
  await page.keyboard.press('Enter');
}

test.describe('Scaffold’s pages', () => {
  test('a character’s name opens their page', async ({ page }) => {
    await showLighthouse(page);
    await link(page, 'NELL').click();
    await expect(heading(page)).toHaveText('NELL');
    await expect(heading(page)).toBeFocused();
    await expect(
      scaffold(page).getByText(/^In 12 of 13 scenes\. First in scene 1\b/),
    ).toBeVisible();
    await expect(scaffold(page).getByText(/last in scene 13\b/)).toBeVisible();
    await expect(fact(page, 'Dialogue')).toHaveText(
      /^212 speeches · 1,\d{3} words · \d+% of all dialogue$/,
    );
    // The bar names the page, and Back is there.
    await expect(page.getByText('NELL', { exact: true }).first()).toBeVisible();
    await expect(backButton(page)).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('the page lists scenes, shared scenes, locations, and lines', async ({ page }) => {
    await showLighthouse(page);
    await link(page, 'NELL').click();
    await expect(heading(page)).toHaveText('NELL');
    const shared = table(page, 'Shares scenes with (2)');
    await expect(shared.getByRole('rowheader')).toHaveText(['ÉLODIE', 'FENN']);
    await expect(shared.getByRole('cell')).toHaveText(['11', '2']);
    const places = table(page, 'Locations (2)');
    await expect(places.getByRole('rowheader')).toHaveText(['LAMP ROOM', 'GALLERY']);
    await expect(places.getByRole('cell')).toHaveText(['11', '1']);
    const scenes = table(page, 'Scenes (12)');
    await expect(scenes.getByRole('row')).toHaveCount(13);
    await expect(scenes.getByRole('row').nth(1)).toContainText('INT. LAMP ROOM - NIGHT');
    await expect(scenes.getByRole('row').nth(1)).toContainText('Speaks');
    await expect(scenes.getByRole('row').nth(2)).toContainText('EXT. GALLERY - DAWN');
    await expect(
      scaffold(page).getByRole('heading', { name: 'Lines (212)', level: 3 }),
    ).toBeVisible();
    // Grouped under each scene's heading.
    await expect(
      scaffold(page).getByRole('heading', { name: 'Scene 1 · INT. LAMP ROOM - NIGHT', level: 4 }),
    ).toBeVisible();
    await expect(scaffold(page).getByRole('button', { name: 'Go to: Light it.' })).toBeVisible();
  });

  test('a line goes to its cue', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'focus stays in Scaffold beside the Source');
    await showLighthouse(page);
    await link(page, 'NELL').click();
    const line = scaffold(page).getByRole('button', { name: `Go to: ${said(3)}` });
    await press(page, line);
    await page.waitForTimeout(300);
    await expect(line).toBeFocused();
    // The cue of the third of the lamp room's lines, in scene 4.
    expect(await cursorLine(page)).toBe('NELL');
    const at = await page.evaluate(() => {
      const view = (
        document.querySelector('.cm-content') as unknown as {
          cmTile: {
            root: {
              view: {
                state: {
                  doc: { lineAt(n: number): { number: number } };
                  selection: { main: { head: number } };
                };
              };
            };
          };
        }
      ).cmTile.root.view;
      return view.state.doc.lineAt(view.state.selection.main.head).number;
    });
    const lines = lighthouse().split('\n');
    expect(lines[at]).toBe(said(3));
  });

  test('Show all 212 speeches shows the rest', async ({ page }) => {
    await showLighthouse(page);
    await link(page, 'NELL').click();
    const lines = scaffold(page).getByRole('button', { name: /^Go to: / });
    await expect(lines).toHaveCount(100);
    const all = scaffold(page).getByRole('button', { name: 'Show all 212 speeches' });
    await press(page, all);
    await expect(lines).toHaveCount(212);
    await expect(all).toHaveCount(0);
    // Focus goes to the first of the lines just shown.
    await expect(lines.nth(100)).toBeFocused();
  });

  test('a location opens its page with its scenes and who appears', async ({ page }) => {
    await showLighthouse(page);
    await expect(fact(page, 'Where')).toHaveText(/^LAMP ROOM · Inside/);
    await link(page, 'LAMP ROOM').click();
    await expect(heading(page)).toHaveText('LAMP ROOM');
    await expect(heading(page)).toBeFocused();
    await expect(scaffold(page).getByText(/^11 scenes · .*inside 10, outside 1\.$/)).toBeVisible();
    await expect(scaffold(page).getByText('Times of day: NIGHT 11.')).toBeVisible();
    await expect(table(page, 'Scenes (11)').getByRole('row')).toHaveCount(12);
    const who = table(page, 'Who appears here (3)');
    await expect(who.getByRole('rowheader')).toHaveText(['NELL', 'ÉLODIE', 'FENN']);
    // FENN is named asleep there, and never speaks there.
    await expect(who.getByRole('row').nth(3).getByRole('cell')).toHaveText(['1', '0']);
    // A name there opens the character's page.
    await link(page, 'FENN').click();
    await expect(heading(page)).toHaveText('FENN');
  });

  test('Back and Alt+Left return', async ({ page }) => {
    await showLighthouse(page);
    await link(page, 'NELL').click();
    await link(page, 'LAMP ROOM').click();
    await expect(heading(page)).toHaveText('LAMP ROOM');
    await press(page, backButton(page));
    await expect(heading(page)).toHaveText('NELL');
    await expect(heading(page)).toBeFocused();
    await page.keyboard.press('Alt+ArrowLeft');
    await expect(heading(page)).toHaveText('Scene 1 · INT. LAMP ROOM - NIGHT');
    await expect(heading(page)).toBeFocused();
    // The page stayed where it was: Alt+Left is the browser's Back too.
    expect(page.url()).not.toMatch(/about:blank/);
    await expect(backButton(page)).toHaveAttribute('aria-disabled', 'true');
  });

  test('Back from a scene pinned on a first visit follows the cursor again', async ({
    page,
    isMobile,
  }) => {
    await start(page);
    await setText(page, lighthouse());
    await cursorOnLine(page, 'Fog on the water.');
    await runCommand(page, 'Scaffold for this scene');
    await expect(heading(page)).toHaveText('Scene 2 · EXT. GALLERY - DAWN');
    await expect(followButton(page)).toHaveAttribute('aria-pressed', 'false');
    // The page before it is the following one, so Back is there on the first page shown.
    await press(page, backButton(page));
    await expect(followButton(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(heading(page)).toBeFocused();
    await expect(heading(page)).toHaveText('Scene 2 · EXT. GALLERY - DAWN');
    await cursorOnLine(page, 'Light it.');
    // A phone's one pane shows the Source for Go to line: back to the Scaffold tab as it was.
    if (isMobile) await chooseTab(page, 'Scaffold');
    await expect(heading(page)).toHaveText('Scene 1 · INT. LAMP ROOM - NIGHT');
  });

  test('Cast and Places list everyone and every place, with a filter', async ({ page }) => {
    await showLighthouse(page);
    await runCommand(page, 'Show the cast');
    await expect(heading(page)).toHaveText('Cast');
    await expect(heading(page)).toBeFocused();
    const cast = table(page, /^Characters/);
    await expect(cast.getByRole('rowheader')).toHaveText(['NELL', 'ÉLODIE', 'FENN']);
    const filter = scaffold(page).getByRole('searchbox', { name: 'Filter the cast' });
    await filter.fill('elo');
    await expect(cast.getByRole('rowheader')).toHaveText(['ÉLODIE']);
    await expect(scaffold(page).getByRole('status')).toHaveText('1 of 3 shown.');
    await filter.fill('nobody');
    await expect(scaffold(page).getByText('Nothing matches “nobody”.')).toBeVisible();
    // Places, A to Z, from the bar's Pages menu.
    await page.getByRole('button', { name: 'Pages', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Places', exact: true }).click();
    await expect(heading(page)).toHaveText('Places');
    await expect(heading(page)).toBeFocused();
    const places = table(page, /^Locations/);
    await expect(places.getByRole('rowheader')).toHaveText(['GALLERY', 'LAMP ROOM', 'SUPPLY BOAT']);
    await scaffold(page).getByRole('searchbox', { name: 'Filter the places' }).fill('BOAT');
    await expect(places.getByRole('rowheader')).toHaveText(['SUPPLY BOAT']);
    await link(page, 'SUPPLY BOAT').click();
    await expect(heading(page)).toHaveText('SUPPLY BOAT');
    // And the palette's Show the places.
    await runCommand(page, 'Show the places');
    await expect(heading(page)).toHaveText('Places');
  });

  test('a name in the Stats tab opens the same page', async ({ page }) => {
    await start(page);
    await setText(page, lighthouse());
    await runCommand(page, 'Show stats');
    const stats = page.getByRole('tabpanel', { name: 'Stats', exact: true });
    await stats
      .getByRole('table', { name: /^Characters/ })
      .getByRole('link', { name: 'FENN', exact: true })
      .click();
    await expect(heading(page)).toHaveText('FENN');
    await expect(heading(page)).toBeFocused();
    await expect(fact(page, 'Dialogue')).toHaveText(
      /^2 speeches · 6 words · \d+% of all dialogue$/,
    );
  });

  test('the grid’s Scaffold for this character opens the page', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'the grid’s menu is tested on a wide screen');
    await start(page);
    await setText(page, lighthouse());
    await runCommand(page, 'Show stats');
    await page
      .getByRole('navigation', { name: 'Stats sections' })
      .getByRole('link', { name: 'Character by scene' })
      .click();
    const grid = page.getByRole('grid', { name: 'Character by scene' });
    await grid.getByRole('gridcell', { name: /^FENN, scene 2, / }).click();
    await page.keyboard.press('Shift+F10');
    await page
      .getByRole('menu')
      .and(page.locator('[data-state="open"]'))
      .getByRole('menuitem', { name: 'Scaffold for this character' })
      .click();
    await expect(heading(page)).toHaveText('FENN');
    await expect(heading(page)).toBeFocused();
  });

  test('Scaffold’s figures match the Stats tab’s', async ({ page }) => {
    await start(page);
    await setText(page, lighthouse());
    await runCommand(page, 'Show stats');
    const stats = page.getByRole('tabpanel', { name: 'Stats', exact: true });
    const rows = stats.getByRole('table', { name: /^Characters/ }).getByRole('row');
    await expect(rows).toHaveCount(4);
    // Screen time waits for the pages; once they're in, every row has it.
    await expect(stats.getByText('Screen time waits for the pages.')).toHaveCount(0, {
      timeout: 20_000,
    });
    const tab: Record<string, string[]> = {};
    /** Screen time as a screen reader hears it: "17 1/8 pages, about 17 minutes". */
    const heard: Record<string, string> = {};
    for (let r = 1; r < 4; r++) {
      const name = (await rows.nth(r).getByRole('rowheader').textContent())?.trim() ?? '';
      tab[name] = (await rows.nth(r).getByRole('cell').allTextContents()).map((t) => t.trim());
      heard[name] =
        (await rows.nth(r).getByRole('cell').nth(5).locator('.sr-only').textContent())?.trim() ??
        '';
    }
    expect(Object.keys(tab)).toEqual(['NELL', 'ÉLODIE', 'FENN']);
    // Speeches, Scenes, Speaks in, Words, Dialogue share, Screen time, Most often with.
    await runCommand(page, 'Show the cast');
    const cast = table(page, /^Characters/).getByRole('row');
    for (const [name, cells] of Object.entries(tab)) {
      const row = cast.filter({ has: page.getByRole('rowheader', { name, exact: true }) });
      // Scenes, Screen time, Dialogue share.
      await expect(row.getByRole('cell')).toHaveText([
        cells[1] ?? '',
        cells[5] ?? '',
        cells[4] ?? '',
      ]);
      await link(page, name).click();
      await expect(heading(page)).toHaveText(name);
      const [speeches, , , words, share] = cells;
      await expect(fact(page, 'Dialogue')).toHaveText(
        `${speeches} ${speeches === '1' ? 'speech' : 'speeches'} · ${words} words · ${share} of all dialogue`,
      );
      // The same pages and minutes, at the script's page rate.
      expect(heard[name]).toMatch(/ pages?, about /);
      await expect(fact(page, 'Screen time').locator('.sr-only')).toHaveText(
        `${heard[name]} at 1 minute a page`,
      );
      await press(page, backButton(page));
      await expect(heading(page)).toHaveText('Cast');
    }
  });

  test('a character gone from the script says so, with Back', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'the script is edited beside Scaffold');
    await showLighthouse(page);
    await link(page, 'FENN').first().click();
    await expect(heading(page)).toHaveText('FENN');
    // Focus on a link of the page, then every FENN taken out of the script.
    const gallery = link(page, 'GALLERY');
    await gallery.focus();
    await page.evaluate(() => {
      type View = { state: { doc: { toString(): string } }; dispatch(spec: unknown): void };
      const content = document.querySelector('.cm-content') as unknown as {
        cmTile: { root: { view: View } };
      };
      const view = content.cmTile.root.view;
      const text = view.state.doc.toString();
      const changes = [
        ' FENN sleeps below the stair.',
        'FENN\nAlways fog.\n\n',
        'FENN\nHand me the crate.\n\n',
      ].map((piece) => {
        const from = text.indexOf(piece);
        return { from, to: from + piece.length, insert: '' };
      });
      view.dispatch({ changes });
    });
    await expect(scaffold(page).getByText('No longer in the script.')).toBeVisible();
    await expect(heading(page)).toHaveText('FENN');
    await expect(heading(page)).toBeFocused();
    await press(page, scaffold(page).getByRole('button', { name: 'Back', exact: true }));
    await expect(heading(page)).toHaveText('Scene 1 · INT. LAMP ROOM - NIGHT');
  });

  test('before the first scene, the Cast and Places are a link away', async ({ page }) => {
    await start(page);
    await setText(page, lighthouse());
    await cursorOnLine(page, 'Title: The Long Light');
    await runCommand(page, 'Show Scaffold');
    await expect(scaffold(page).getByText('The cursor is before the first scene.')).toBeVisible();
    await link(page, 'Places').click();
    await expect(heading(page)).toHaveText('Places');
    await press(page, backButton(page));
    await link(page, 'Cast').click();
    await expect(heading(page)).toHaveText('Cast');
  });

  test('every page works by keyboard alone', async ({ page, browserName }) => {
    // WebKit's Tab skips links and buttons unless Option is held, as Safari's does by default.
    const tabKey = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
    await showLighthouse(page);
    await expect(heading(page)).toBeFocused();
    /** Tabs forward until `target` has focus, at most `limit` times. */
    const tabTo = async (target: Locator, limit = 40) => {
      for (let i = 0; i < limit; i++) {
        if (await target.evaluate((el) => el === document.activeElement)) return;
        await page.keyboard.press(tabKey);
      }
      await expect(target).toBeFocused();
    };
    // The scene page: a name, by Tab and Enter.
    await tabTo(link(page, 'NELL'));
    await page.keyboard.press('Enter');
    await expect(heading(page)).toHaveText('NELL');
    await expect(heading(page)).toBeFocused();
    // The character page: a place in Locations.
    await tabTo(link(page, 'GALLERY'));
    await page.keyboard.press('Enter');
    await expect(heading(page)).toHaveText('GALLERY');
    await expect(heading(page)).toBeFocused();
    // The location page: a name in Who appears here.
    await tabTo(link(page, 'FENN'));
    await page.keyboard.press('Enter');
    await expect(heading(page)).toHaveText('FENN');
    // Back, by its key, twice.
    await page.keyboard.press('Alt+ArrowLeft');
    await expect(heading(page)).toHaveText('GALLERY');
    await page.keyboard.press('Alt+ArrowLeft');
    await expect(heading(page)).toHaveText('NELL');
    // The bar's menu: Cast.
    const pages = page.getByRole('button', { name: 'Pages', exact: true });
    await pages.focus();
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu').and(page.locator('[data-state="open"]'));
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem')).toHaveText(['This scene', 'Cast', 'Places']);
    await expect(menu.getByRole('menuitem', { name: 'This scene' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('menuitem', { name: 'Cast' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(heading(page)).toHaveText('Cast');
    await expect(heading(page)).toBeFocused();
    // The cast: the filter, then a name.
    await page.keyboard.press(tabKey);
    await expect(scaffold(page).getByRole('searchbox', { name: 'Filter the cast' })).toBeFocused();
    await page.keyboard.type('fen');
    // Alt+Left in the filter moves by a word there, and leaves the page alone.
    await page.keyboard.press('Alt+ArrowLeft');
    await expect(heading(page)).toHaveText('Cast');
    await tabTo(link(page, 'FENN'));
    await page.keyboard.press('Enter');
    await expect(heading(page)).toHaveText('FENN');
    // And the menu's This scene: the cursor's scene, following.
    await pages.focus();
    await page.keyboard.press('Enter');
    await expect(menu.getByRole('menuitem').first()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(heading(page)).toHaveText('Scene 1 · INT. LAMP ROOM - NIGHT');
    await expect(heading(page)).toBeFocused();
    await expect(followButton(page)).toHaveAttribute('aria-pressed', 'true');
  });

  test('Alt+Left goes Back from the tab’s own panel too', async ({ page }) => {
    await showLighthouse(page);
    await link(page, 'NELL').click();
    await expect(heading(page)).toHaveText('NELL');
    // Focus on the panel itself, outside the page drawn in it.
    await scaffold(page).focus();
    await page.keyboard.press('Alt+ArrowLeft');
    await expect(heading(page)).toHaveText('Scene 1 · INT. LAMP ROOM - NIGHT');
  });

  test('a row taken away with focus on it leaves focus on its table’s heading', async ({
    page,
    isMobile,
  }) => {
    test.skip(!!isMobile, 'the script is edited beside Scaffold');
    await showLighthouse(page);
    await link(page, 'NELL').click();
    const gallery = table(page, 'Scenes (12)').getByRole('button', {
      name: /EXT\. GALLERY - DAWN$/,
    });
    await gallery.focus();
    // The gallery scene taken out of the script.
    await page.evaluate(() => {
      type View = { state: { doc: { toString(): string } }; dispatch(spec: unknown): void };
      const content = document.querySelector('.cm-content') as unknown as {
        cmTile: { root: { view: View } };
      };
      const view = content.cmTile.root.view;
      const text = view.state.doc.toString();
      const from = text.indexOf('EXT. GALLERY - DAWN');
      const to = text.indexOf('INT. SUPPLY BOAT - DAY');
      view.dispatch({ changes: { from, to, insert: '' } });
    });
    const caption = scaffold(page).getByRole('heading', { name: 'Scenes (11)', level: 3 });
    await expect(caption).toBeVisible();
    await expect(caption).toBeFocused();
  });

  test('the Cast’s filter is still there after Back', async ({ page }) => {
    await showLighthouse(page);
    await runCommand(page, 'Show the cast');
    await expect(heading(page)).toHaveText('Cast');
    const filter = scaffold(page).getByRole('searchbox', { name: 'Filter the cast' });
    await filter.fill('fen');
    await expect(scaffold(page).getByText('1 of 3 shown.')).toBeVisible();
    await link(page, 'FENN').click();
    await expect(heading(page)).toHaveText('FENN');
    await press(page, backButton(page));
    await expect(heading(page)).toHaveText('Cast');
    await expect(filter).toHaveValue('fen');
    await expect(scaffold(page).getByText('1 of 3 shown.')).toBeVisible();
  });
});
