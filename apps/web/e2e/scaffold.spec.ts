import { expect, type Page, test } from '@playwright/test';
import { editor, palette, paletteInput, runCommand, setText, start } from './modules';
import { drafterDatabase, sampleSeenRows } from './seed';

// Scaffold (seeing-the-script design §5): a tab beside the Source showing who is in the cursor's
// scene, following the cursor as it rests (or a scene pinned from the Outline, the Cards, the strip,
// or the grid), with the scene's facts, a row for each character in it, and Go to. Its
// accessibility tests are in a11y.spec.ts, its budgets in cast-budget.spec.ts.

const scaffold = (page: Page) => page.getByRole('tabpanel', { name: 'Scaffold', exact: true });
const heading = (page: Page) => scaffold(page).getByRole('heading', { level: 2 });
const people = (page: Page) => scaffold(page).getByRole('table', { name: /^In this scene/ });
const followButton = (page: Page) =>
  page.getByRole('button', { name: 'Follow the cursor', exact: true });
const openMenu = (page: Page) => page.getByRole('menu').and(page.locator('[data-state="open"]'));

// A night ferry, written for these tests: a gull before the first scene, then three scenes.
const FERRY = `Title: Low Water

A gull cries over the mud.

INT. FERRY CABIN - NIGHT

BRAM sleeps on a bench. Ines watches the dark window. A steward, KOLL, passes.

INES
Are we nearly there?

KOLL
Twenty minutes, if the fog holds off.

INES
It won't.

KOLL
Then forty.

EXT. FERRY DECK - NIGHT

BRAM stands at the rail, alone. The horn sounds.

BRAM
Ines! Come and see the lights.

INT. HARBOUR OFFICE - DAY

KOLL stamps a ticket. INES waits.

INES
One more crossing.
`;

const CABIN = 'Scene 1 · INT. FERRY CABIN - NIGHT';
const DECK = 'Scene 2 · EXT. FERRY DECK - NIGHT';
const OFFICE = 'Scene 3 · INT. HARBOUR OFFICE - DAY';

/**
 * Puts the cursor at the start of the ferry's line holding `text`, by the palette's Go to line (a
 * click on a line just after the palette has closed can select from there instead).
 */
async function cursorOn(page: Page, text: string) {
  const line = FERRY.split('\n').findIndex((l) => l.includes(text)) + 1;
  await page.keyboard.press('ControlOrMeta+k');
  await expect(paletteInput(page)).toBeFocused();
  await paletteInput(page).fill(String(line));
  await expect(palette(page).getByRole('option').first()).toHaveAccessibleName(
    new RegExp(`^Go to line ${line}\\b`),
  );
  await expect(palette(page).locator('[role="option"][data-highlighted]')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(palette(page)).toBeHidden();
  await expect(editor(page)).toBeFocused();
}

/** The ferry in the editor, the cursor at its end, then Scaffold shown from the palette. */
async function showFerry(page: Page) {
  await start(page);
  await setText(page, FERRY);
  await runCommand(page, 'Show Scaffold');
  await expect(scaffold(page)).toBeVisible();
}

/**
 * Replaces the script's text from the first `from` up to the first `to` (or inserts at `from`, with
 * no `to`), through the editor itself (CodeMirror's link from its content to its view, which
 * `EditorView.findFromDOM` reads), so focus stays where it is, as another edit would leave it.
 */
async function editScript(page: Page, from: string, to: string, insert: string) {
  await page.evaluate(
    ([a, b, text]) => {
      type View = { state: { doc: { toString(): string } }; dispatch(spec: unknown): void };
      const content = document.querySelector('.cm-content') as unknown as {
        cmTile: { root: { view: View } };
      };
      const view = content.cmTile.root.view;
      const doc = view.state.doc.toString();
      const start = doc.indexOf(a);
      view.dispatch({ changes: { from: start, to: b ? doc.indexOf(b) : start, insert: text } });
    },
    [from, to, insert] as const,
  );
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

test.describe('Scaffold', () => {
  test.describe('beside the Source', () => {
    test.skip(({ isMobile }) => !!isMobile, 'two panes need a wide screen');

    test('Show Scaffold opens it beside the Source', async ({ page }) => {
      await showFerry(page);
      // In the pane that isn't showing the Source, which stays.
      await expect(editor(page)).toBeVisible();
      const right = page.locator('[data-pane="right"]');
      await expect(right.getByRole('tab', { name: 'Scaffold', exact: true })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      // Focus is on the page's heading: the cursor's scene, the last.
      await expect(heading(page)).toHaveText(OFFICE);
      await expect(heading(page)).toBeFocused();
      await expect(followButton(page)).toHaveAttribute('aria-pressed', 'true');
      const facts = scaffold(page).locator('dl');
      await expect(facts.locator('dt')).toHaveText(['Where', 'When', 'Length']);
      await expect(facts.locator('dd').nth(0)).toContainText('HARBOUR OFFICE · Inside');
      await expect(facts.locator('dd').nth(1)).toHaveText('DAY');
      await expect(facts.locator('dd').nth(2)).toContainText(/page \d+ · about \d/);
    });

    test('it follows the cursor into the next scene', async ({ page }) => {
      await showFerry(page);
      await cursorOn(page, 'Are we nearly there?');
      await expect(heading(page)).toHaveText(CABIN);
      // Focus stays in the Source as it follows.
      await expect(editor(page)).toBeFocused();
      await cursorOn(page, 'The horn sounds.');
      await expect(heading(page)).toHaveText(DECK);
      await expect(editor(page)).toBeFocused();
      await expect(people(page).getByRole('rowheader')).toHaveText(['BRAM']);
    });

    test('it shows who speaks and who is silent, with words and time', async ({ page }) => {
      await showFerry(page);
      await cursorOn(page, 'Are we nearly there?');
      await expect(heading(page)).toHaveText(CABIN);
      await expect(people(page)).toHaveAccessibleName('In this scene (3)');
      await expect(people(page).getByRole('columnheader')).toHaveText([
        'Character',
        'Speeches',
        'Words',
        'Time speaking',
        'Other scenes',
      ]);
      // Speakers in the order they first speak, then BRAM, asleep, silent.
      const rows = people(page).locator('tbody tr');
      await expect(rows.nth(0)).toHaveText(
        /^INES.*2\s*6\s*about 5 s \(27%\).*1 more scene with INES$/,
      );
      await expect(rows.nth(1)).toHaveText(
        /^KOLL.*2\s*9\s*about 5 s \(40%\).*1 more scene with KOLL$/,
      );
      await expect(rows.nth(2)).toHaveText(/^BRAM.*Silent\s*0\s*—.*1 more scene with BRAM$/);
      // Each name is a link to the character's page, and "1 more" to their scenes there.
      await expect(rows.nth(0).getByRole('link', { name: 'INES', exact: true })).toBeVisible();
      await expect(
        rows.nth(0).getByRole('link', { name: '1 more scene with INES', exact: true }),
      ).toBeVisible();
      // A screen reader hears the time in words, and Silent where there is none.
      await expect(rows.nth(0).getByRole('cell').nth(2)).toHaveAccessibleName(
        'about 5 seconds, 27% of the scene',
      );
      await expect(rows.nth(2).getByRole('cell').nth(2)).toHaveAccessibleName('Silent');
    });

    test('first seen here is listed', async ({ page }) => {
      await showFerry(page);
      await cursorOn(page, 'Are we nearly there?');
      await expect(heading(page)).toHaveText(CABIN);
      await expect(people(page).getByText('First seen here')).toHaveCount(3);
      await expect(scaffold(page).getByText('First seen here: INES, KOLL, BRAM.')).toBeVisible();
      // On the deck, BRAM is seen again: no tag, and no line.
      await cursorOn(page, 'The horn sounds.');
      await expect(heading(page)).toHaveText(DECK);
      await expect(people(page).getByText('First seen here')).toHaveCount(0);
      await expect(scaffold(page).getByText(/^First seen here:/)).toHaveCount(0);
    });

    test('Follow the cursor off keeps the scene', async ({ page }) => {
      await showFerry(page);
      await expect(heading(page)).toHaveText(OFFICE);
      await followButton(page).click();
      await expect(followButton(page)).toHaveAttribute('aria-pressed', 'false');
      await cursorOn(page, 'Are we nearly there?');
      // Well past the rest: the page keeps its scene.
      await page.waitForTimeout(600);
      await expect(heading(page)).toHaveText(OFFICE);
      // On again, it is the cursor's scene.
      await followButton(page).click();
      await expect(heading(page)).toHaveText(CABIN);
    });

    test('Scaffold for this scene from the Outline, the Cards, and the grid pins it', async ({
      page,
    }) => {
      await showFerry(page);
      // The Outline's menu.
      await runCommand(page, 'Show Outline');
      const row = page
        .getByRole('tree', { name: 'Outline' })
        .getByRole('treeitem', { name: /^Scene 2, EXT\. FERRY DECK - NIGHT/ });
      await row.focus();
      await page.keyboard.press('Shift+F10');
      await openMenu(page).getByRole('menuitem', { name: 'Scaffold for this scene' }).click();
      await expect(heading(page)).toHaveText(DECK);
      await expect(heading(page)).toBeFocused();
      await expect(followButton(page)).toHaveAttribute('aria-pressed', 'false');
      // The cursor moving doesn't move a pinned page.
      await cursorOn(page, 'Are we nearly there?');
      await page.waitForTimeout(600);
      await expect(heading(page)).toHaveText(DECK);
      // The Cards' menu.
      await runCommand(page, 'Show Cards');
      const card = page
        .getByRole('listbox', { name: 'Cards' })
        .getByRole('option', { name: /^Scene 3, INT\. HARBOUR OFFICE - DAY/ });
      await card.focus();
      await page.keyboard.press('Shift+F10');
      await openMenu(page).getByRole('menuitem', { name: 'Scaffold for this scene' }).click();
      await expect(heading(page)).toHaveText(OFFICE);
      await expect(heading(page)).toBeFocused();
      // The grid's menu, in the Stats tab.
      await runCommand(page, 'Show stats');
      await page
        .getByRole('navigation', { name: 'Stats sections' })
        .getByRole('link', { name: 'Character by scene' })
        .click();
      const grid = page.getByRole('grid', { name: 'Character by scene' });
      await grid.getByRole('gridcell', { name: 'BRAM, scene 2, 1 speech', exact: true }).click();
      await page.keyboard.press('Shift+F10');
      await openMenu(page).getByRole('menuitem', { name: 'Scaffold for this scene' }).click();
      await expect(heading(page)).toHaveText(DECK);
      await expect(heading(page)).toBeFocused();
      await expect(followButton(page)).toHaveAttribute('aria-pressed', 'false');
    });

    test('Go to puts the cursor at the scene and focus stays in Scaffold', async ({ page }) => {
      await showFerry(page);
      await expect(heading(page)).toHaveText(OFFICE);
      await followButton(page).click();
      await cursorOn(page, 'Are we nearly there?');
      // From the keyboard (Safari doesn't focus a button it clicks).
      const go = scaffold(page).getByRole('button', { name: 'Go to scene 3' });
      await go.focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
      await expect(go).toBeFocused();
      expect(await cursorLine(page)).toBe('INT. HARBOUR OFFICE - DAY');
    });

    test('Show Scaffold follows the cursor again, as a fresh visit does', async ({ page }) => {
      await showFerry(page);
      await cursorOn(page, 'The horn sounds.');
      await runCommand(page, 'Scaffold for this scene');
      await expect(heading(page)).toHaveText(DECK);
      await expect(followButton(page)).toHaveAttribute('aria-pressed', 'false');
      await cursorOn(page, 'Are we nearly there?');
      await runCommand(page, 'Show Scaffold');
      await expect(followButton(page)).toHaveAttribute('aria-pressed', 'true');
      await expect(heading(page)).toHaveText(CABIN);
      await expect(heading(page)).toBeFocused();
    });

    test('a pinned scene deleted while Go to has focus leaves focus on the heading', async ({
      page,
    }) => {
      await showFerry(page);
      await cursorOn(page, 'The horn sounds.');
      await runCommand(page, 'Scaffold for this scene');
      await expect(heading(page)).toHaveText(DECK);
      const go = scaffold(page).getByRole('button', { name: 'Go to scene 2' });
      await go.focus();
      // The deck scene goes, from outside Scaffold (as another edit would), focus staying on Go to.
      await editScript(page, 'EXT. FERRY DECK', 'INT. HARBOUR OFFICE', '');
      await expect(
        scaffold(page).getByText('That scene isn’t in the script any more.'),
      ).toBeVisible();
      await expect(go).toHaveCount(0);
      await expect(heading(page)).toBeFocused();
    });

    test('a heading pasted above the shown scene never shows another scene’s people', async ({
      page,
    }) => {
      await showFerry(page);
      await cursorOn(page, 'The horn sounds.');
      await runCommand(page, 'Scaffold for this scene');
      await expect(heading(page)).toHaveText(DECK);
      await expect(people(page).getByRole('rowheader')).toHaveText(['BRAM']);
      // Every frame for a second and a half, from before the paste, while the cast catches up.
      const seen = page.evaluate(
        () =>
          new Promise<Array<[string, string]>>((resolve) => {
            const out: Array<[string, string]> = [];
            const end = performance.now() + 1500;
            const look = () => {
              const panel = document.getElementById('panel-scaffold');
              const h2 = panel?.querySelector('h2')?.textContent ?? '';
              const names = [...(panel?.querySelectorAll('tbody th') ?? [])]
                .map((th) => th.textContent?.trim() ?? '')
                .join('|');
              out.push([h2, names]);
              if (performance.now() < end) requestAnimationFrame(look);
              else resolve(out);
            };
            look();
          }),
      );
      // A whole scene pasted at the deck's first character.
      await editScript(page, 'EXT. FERRY DECK', '', 'INT. ATTIC - DAY\n\nDust on the trunks.\n\n');
      const frames = await seen;
      expect(frames.length).toBeGreaterThan(10);
      // The page keeps the deck, and no frame puts the deck's people under another heading.
      for (const [h2, names] of frames) {
        if (!h2.includes('FERRY DECK')) expect(names).not.toContain('BRAM');
      }
      await expect(heading(page)).toHaveText('Scene 3 · EXT. FERRY DECK - NIGHT');
      await expect(people(page).getByRole('rowheader')).toHaveText(['BRAM']);
    });

    test('Follow the cursor stays on before the first scene, and Show Scaffold follows', async ({
      page,
    }) => {
      await showFerry(page);
      await cursorOn(page, 'A gull cries over the mud.');
      await expect(scaffold(page).getByText('The cursor is before the first scene.')).toBeVisible();
      // Nothing to keep: following stays on.
      await followButton(page).click();
      await expect(followButton(page)).toHaveAttribute('aria-pressed', 'true');
      await runCommand(page, 'Show Scaffold');
      await expect(followButton(page)).toHaveAttribute('aria-pressed', 'true');
      await cursorOn(page, 'Are we nearly there?');
      await expect(heading(page)).toHaveText(CABIN);
    });

    test('Scaffold for this scene from the palette pins the cursor’s scene', async ({ page }) => {
      await showFerry(page);
      await cursorOn(page, 'The horn sounds.');
      await runCommand(page, 'Scaffold for this scene');
      await expect(heading(page)).toHaveText(DECK);
      await expect(followButton(page)).toHaveAttribute('aria-pressed', 'false');
    });

    test('before the first scene it says so', async ({ page }) => {
      await showFerry(page);
      await cursorOn(page, 'A gull cries over the mud.');
      await expect(scaffold(page).getByText('The cursor is before the first scene.')).toBeVisible();
      await expect(people(page)).toHaveCount(0);
      // And the palette's Scaffold for this scene has no scene to pin there.
      await page.keyboard.press('ControlOrMeta+k');
      await expect(paletteInput(page)).toBeFocused();
      await page.keyboard.insertText('Scaffold for this scene');
      await expect(
        palette(page).getByRole('option', { name: 'Scaffold for this scene', exact: true }),
      ).toHaveCount(0);
      await page.keyboard.press('Escape');
    });
  });

  test('a Markdown document has no Scaffold', async ({ page }) => {
    await start(page);
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await page
      .getByRole('group', { name: 'Scripts', exact: true })
      .getByRole('button', { name: 'New Markdown document' })
      .click();
    await expect(editor(page)).toContainText('# Untitled');
    // Not under More, and not in the palette.
    await expect(page.getByRole('tab', { name: 'Scaffold' })).toHaveCount(0);
    await page.locator('[data-pane]').first().getByRole('button', { name: 'More tabs' }).click();
    await expect(page.getByRole('menu', { name: 'More tabs' }).getByRole('menuitem')).toHaveText([
      'Stats',
    ]);
    await page.keyboard.press('Escape');
    await page.keyboard.press('ControlOrMeta+k');
    await expect(paletteInput(page)).toBeFocused();
    await page.keyboard.insertText('Show Scaffold');
    await expect(palette(page).getByRole('option', { name: 'Show Scaffold' })).toHaveCount(0);
    await page.keyboard.press('Escape');
  });

  test('the palette finds it by "cast"', async ({ page }) => {
    await start(page);
    await setText(page, FERRY);
    await page.keyboard.press('ControlOrMeta+k');
    await expect(paletteInput(page)).toBeFocused();
    await page.keyboard.insertText('cast');
    const option = palette(page).getByRole('option', { name: 'Show Scaffold', exact: true });
    await expect(option).toBeVisible();
    await option.click();
    await expect(scaffold(page)).toBeVisible();
    await expect(heading(page)).toHaveText(OFFICE);
  });

  test('on a phone it is the pane’s tab', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'a phone’s one pane');
    await showFerry(page);
    const pane = page.locator('[data-pane="phone"]');
    await expect(pane.getByRole('tab', { name: 'Scaffold', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(heading(page)).toHaveText(OFFICE);
    await expect(heading(page)).toBeFocused();
    await expect(people(page).getByRole('rowheader')).toHaveText(['INES', 'KOLL']);
    // Go to shows the Source, the one pane, at the scene.
    await scaffold(page).getByRole('button', { name: 'Go to scene 3' }).click();
    await expect(editor(page)).toBeFocused();
    // Nothing is wider than the phone.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()?.width ?? 0,
    );
  });
});

// The strip's block menu (structure strip design §4, Call 31): off by default, so these tests start
// with the setting stored on, as strip.spec.ts does.
const port = Number(process.env.E2E_PORT ?? 4173);
test.describe('Scaffold from the strip', () => {
  test.use({
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
  });
  test.skip(({ isMobile }) => !!isMobile, 'the strip is for a wide screen');

  test('Scaffold for this scene from the strip pins it', async ({ page }) => {
    await showFerry(page);
    const deck = page
      .getByRole('group', { name: 'Structure strip' })
      .getByRole('group', { name: 'Scenes', exact: true })
      .getByRole('button', { name: /^Scene 2, EXT\. FERRY DECK - NIGHT/ });
    await deck.click({ button: 'right' });
    await openMenu(page).getByRole('menuitem', { name: 'Scaffold for this scene' }).click();
    await expect(heading(page)).toHaveText(DECK);
    await expect(heading(page)).toBeFocused();
    await expect(followButton(page)).toHaveAttribute('aria-pressed', 'false');
  });
});
