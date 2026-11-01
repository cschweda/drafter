import { expect, type Locator, type Page } from '@playwright/test';

// Helpers for the specs that try the module host. `pnpm e2e` builds with the test module, the
// Fixture, which has a button ("Count scenes"), a tab ("Fixture"), a command ("Fixture: add a
// note"), and asks for the network (example.invalid) before it is turned on.

export const editor = (page: Page) => page.locator('.cm-content');
export const settingsDialog = (page: Page) => page.getByRole('dialog', { name: 'Settings' });
export const consentDialog = (page: Page) => page.getByRole('dialog', { name: 'Turn on Fixture?' });
export const fixtureSwitch = (page: Page) =>
  settingsDialog(page).getByRole('switch', { name: 'Fixture' });
export const countScenes = (page: Page) => page.getByRole('button', { name: 'Count scenes' });
export const fixtureTab = (page: Page) => page.getByRole('tab', { name: 'Fixture' });
export const palette = (page: Page) => page.getByRole('dialog', { name: 'Command palette' });
export const paletteInput = (page: Page) => palette(page).locator('input');

/** Loads the app and waits until the script is open and the module choices have been read. */
export async function start(page: Page) {
  await page.goto('/');
  await expect(editor(page)).toBeAttached();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<boolean>((resolve) => {
            const open = indexedDB.open('drafter');
            open.onerror = () => resolve(false);
            open.onsuccess = () => {
              const db = open.result;
              const ok = db.objectStoreNames.contains('projects');
              db.close();
              resolve(ok);
            };
          }),
      ),
    )
    .toBe(true);
}

/** The Source tab, which a phone doesn't show to begin with. */
export async function showSource(page: Page) {
  if (!(await editor(page).isVisible())) await showView(page, 'Source');
  await expect(editor(page)).toBeVisible();
}

export async function openSettings(page: Page) {
  await page.keyboard.press('ControlOrMeta+,');
  await expect(settingsDialog(page)).toBeVisible();
}

export async function closeSettings(page: Page) {
  await settingsDialog(page).getByRole('button', { name: 'Done' }).click();
  await expect(settingsDialog(page)).toBeHidden();
}

/** Turns the Fixture on in Settings, saying yes to the question about the network. */
export async function turnOnFixture(page: Page) {
  await openSettings(page);
  await fixtureSwitch(page).click();
  await expect(consentDialog(page)).toBeVisible();
  await consentDialog(page).getByRole('button', { name: 'Turn on' }).click();
  await expect(fixtureSwitch(page)).toBeChecked();
  await closeSettings(page);
  await expect(countScenes(page)).toBeVisible();
}

/** Replaces the script with `text`, typed in one go. */
export async function setText(page: Page, text: string) {
  await showSource(page);
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(text);
}

/**
 * Clicks `target`, a line of the Source or something in one, as a writer's click lands: scrolled
 * into view first, then two frames, then the click. Playwright's own click on a line off screen
 * scrolls and presses in the same frame, before the scroll event; CodeMirror's focus handler then
 * puts back the scroll position it had, and the release lands on another line, selecting a range
 * from the cursor (CodeMirror view 6.43, the focus handler that restores `lastScrollTop`). A real
 * scroll comes frames before the press, so this waits as one would.
 */
export async function clickInSource(
  page: Page,
  target: Locator,
  options?: Parameters<Locator['click']>[0],
) {
  await target.scrollIntoViewIfNeeded();
  await page.evaluate(
    () =>
      new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  );
  await target.click(options);
}

/** The script's text, line by line. */
export const textOf = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('.cm-content .cm-line'))
      .map((line) => line.textContent ?? '')
      .join('\n'),
  );

/** Opens the palette from the keyboard and runs the command called `title`. */
export async function runCommand(page: Page, title: string) {
  await page.keyboard.press('ControlOrMeta+k');
  await expect(palette(page)).toBeVisible();
  await expect(paletteInput(page)).toBeFocused();
  await expect(palette(page).locator('[role="option"][data-highlighted]')).toHaveCount(1);
  await page.keyboard.insertText(title);
  const row = palette(page).getByRole('option', { name: title, exact: true });
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute('data-highlighted', '');
  await page.keyboard.press('Enter');
  await expect(palette(page)).toBeHidden();
}

/**
 * The pane with the tabs: the Inspector on a wide screen (the editor's pane has none, fresh-look
 * design §3.2), or a phone's one pane.
 */
export const lastPane = (page: Page) => page.locator('[data-pane]').last();
export const problemsTab = (page: Page) => lastPane(page).getByRole('tab', { name: /^Problems/ });
export const problemsList = (page: Page) => page.getByRole('tabpanel', { name: /^Problems/ });

/** Shows Problems: its tab on a phone, or from the Inspector's More (Call 14), where it waits. */
export async function showProblems(page: Page) {
  if ((await problemsTab(page).count()) > 0) {
    await problemsTab(page).click();
  } else {
    await lastPane(page).getByRole('button', { name: 'More tabs' }).click();
    await page
      .getByRole('menu', { name: 'More tabs' })
      .getByRole('menuitem', { name: /^Problems/ })
      .click();
    // Focus goes to the chosen tab once the menu has closed; wait for it, so it can't take focus
    // from whatever the test does next.
    await expect(problemsTab(page)).toBeFocused();
  }
  await expect(problemsList(page)).toBeVisible();
}

/**
 * Chooses the tab called `name` in the pane with the tabs: from the tab row, or from More when it
 * isn't in the row (the Inspector's row and More by kind, Call 14; a phone's core tabs, one slot,
 * then More).
 */
export async function chooseTab(page: Page, name: string) {
  const pane = lastPane(page);
  const tab = pane.getByRole('tab', { name, exact: true });
  if ((await tab.count()) > 0) {
    await tab.click();
    return;
  }
  await pane.getByRole('button', { name: 'More tabs' }).click();
  await page
    .getByRole('menu', { name: 'More tabs' })
    .getByRole('menuitem', { name, exact: true })
    .click();
  // Focus goes to the chosen tab once the menu has closed; wait for it, so it can't take focus
  // from whatever the test does next.
  await expect(pane.getByRole('tab', { name, exact: true })).toBeFocused();
}

/**
 * Expects the pane with the tabs to offer the tab called `name`: in its tab row, or under More (a
 * tab that isn't in the row shows there only once it is chosen). The More menu is closed again.
 */
export async function expectTabOffered(page: Page, name: string) {
  const pane = lastPane(page);
  if ((await pane.getByRole('tab', { name, exact: true }).count()) > 0) return;
  const more = pane.getByRole('button', { name: 'More tabs' });
  const menu = page.getByRole('menu', { name: 'More tabs' });
  // On the emulated phone WebKit a tap is now and then ignored (the Plan 4 deferred list), so More
  // is tapped again until its menu is open.
  await expect(async () => {
    if (!(await menu.isVisible())) await more.click();
    await expect(menu).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(menu.getByRole('menuitem', { name, exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
}

/** What the settings table holds, a row to a setting. */
export function stored(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(
    () =>
      new Promise<Record<string, unknown>>((resolve) => {
        const open = indexedDB.open('drafter');
        open.onerror = () => resolve({});
        open.onsuccess = () => {
          const db = open.result;
          const request = db.transaction('settings').objectStore('settings').getAll();
          request.onsuccess = () => {
            db.close();
            resolve(
              Object.fromEntries(
                (request.result as Array<{ key: string; value: unknown }>)
                  // The samples met, which the tests start with (playwright.config.ts), are not settings.
                  .filter((r) => !r.key.startsWith('sample-seen:'))
                  .map((r) => [r.key, r.value]),
              ),
            );
          };
          request.onerror = () => {
            db.close();
            resolve({});
          };
        };
      }),
  );
}

/**
 * The script's whole text, from the editor's state: `textOf` reads the lines drawn, and CodeMirror
 * draws only those near the view. Reads CodeMirror's own link from its content element (`cmTile`, `cmView` before 6.40).
 */
export const wholeText = (page: Page) =>
  page.evaluate(() => {
    type Linked = { view?: { state: { doc: { toString(): string } } } };
    const content = document.querySelector('.cm-content') as
      | (Element & { cmTile?: Linked; cmView?: Linked })
      | null;
    return (content?.cmTile ?? content?.cmView)?.view?.state.doc.toString() ?? null;
  });

/**
 * Expects keys typed with focus in `panel` (a tab that isn't the editor) to leave the script as it
 * was, and the cursor to be where it was when the editor has focus again. Safari would otherwise
 * type into the editor, whose selection is still in the page (decided 2026-10-29). The cursor is put
 * at the script's end first.
 */
export async function expectTypingLeavesScript(page: Page, panel: Locator) {
  await showSource(page);
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+End');
  const before = await wholeText(page);
  await panel.focus();
  // A tab may hand its focus on to its list (Cards does).
  const inPanel = () => panel.evaluate((el) => el.contains(document.activeElement));
  await expect.poll(inPanel).toBe(true);
  await page.keyboard.type('xyz');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('n');
  // Backspace doesn't take the page back, as WebKit's Backspace can.
  expect(new URL(page.url()).pathname).toBe('/');
  expect(await wholeText(page)).toBe(before);
  // Focus stays in the tab (Compare's N moves it to a change there).
  expect(await inPanel()).toBe(true);
  // Back in the editor, the cursor is where it was: at the end.
  await editor(page).focus();
  await page.keyboard.type('Q');
  await expect.poll(() => wholeText(page)).toBe(`${before}Q`);
}

/**
 * Makes `tool`, one of the Inspector's view tools (fresh-look design §3.3, Call 15), reachable:
 * it is in the header, or, when the header is too narrow for it, folded behind "⋯" (More tools),
 * which is opened. Returns `tool`. A phone's slim bar has every tool; nothing is opened there.
 * `optional`: a tool that may not be drawn at all (a layout a narrow pane hasn't room for).
 */
export async function viewTool(
  page: Page,
  tool: Locator,
  { optional = false }: { optional?: boolean } = {},
): Promise<Locator> {
  // The header is measured a frame after a view shows.
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
  if (await tool.isVisible()) return tool;
  const fold = page.getByRole('button', { name: 'More tools' });
  if ((await fold.isVisible()) && (await fold.getAttribute('aria-expanded')) !== 'true') {
    await fold.click();
  }
  if (!optional) await expect(tool).toBeVisible();
  return tool;
}

/**
 * Shows the view called `name` ("Source", "Script", "Preview", "Problems", …) where it isn't up:
 * on a wide screen the Source is the editor, always on the left, and the other views are the
 * Inspector's tabs, in its row or under More (fresh-look design §3.2, §3.3); on a phone, the one
 * pane's tabs.
 */
export async function showView(page: Page, view: string) {
  // A wide screen's editor is always there (it may still be mounting after a reload).
  const wide = (page.viewportSize()?.width ?? 0) >= 1024;
  if (view === 'Source' && wide) return;
  // Below 1024px the bottom tab bar calls the Source "Write" (fresh-look design §6, Task 9).
  const name = view === 'Source' ? 'Write' : view;
  const pane = lastPane(page);
  const pattern = new RegExp(`^${name}\\b`);
  const shown = pane.getByRole('tab', { name: pattern, selected: true });
  if ((await shown.count()) > 0) return;
  const tab = pane.getByRole('tab', { name: pattern });
  if ((await tab.count()) > 0) {
    await tab.first().click();
  } else {
    await pane.getByRole('button', { name: 'More tabs' }).click();
    await page
      .getByRole('menu', { name: 'More tabs' })
      .getByRole('menuitem', { name: pattern })
      .click();
    // As chooseTab: focus goes to the chosen tab once the menu has closed.
    await expect(pane.getByRole('tab', { name: pattern, selected: true })).toBeFocused();
  }
  await expect(pane.getByRole('tab', { name: pattern, selected: true })).toBeVisible();
}

/**
 * The top bar's save state (fresh-look Task 6): `data-save-state` is `unsaved` while the text has
 * changes its file doesn't, `saved` once it is in its file, and `clean` for a script in no file
 * that hasn't been edited. The status bar no longer says it.
 */
export const saveState = (page: Page) => page.locator('[data-save-state]');

/** Waits for the script to be saved in its file, with nothing changed since. */
export async function expectSaved(page: Page) {
  await expect(saveState(page)).toHaveAttribute('data-save-state', 'saved');
}

/** Waits for the script to have changes its file (or no file) doesn't have. */
export async function expectUnsaved(page: Page) {
  await expect(saveState(page)).toHaveAttribute('data-save-state', 'unsaved');
}

/**
 * Opens the Counts panel: from the status bar's counts item where the bar is shown, from the
 * palette where it isn't (below 640px, Task 6).
 */
export async function openCountsPanel(page: Page) {
  const item = page.locator('[data-tour="status"] .counts-button');
  if (await item.isVisible()) await item.click();
  else {
    await page.keyboard.press('ControlOrMeta+k');
    await expect(paletteInput(page)).toBeFocused();
    await paletteInput(page).fill('Counts and daily goal');
    await palette(page)
      .getByRole('option', { name: 'Counts and daily goal…', exact: true })
      .click();
    await expect(palette(page)).toBeHidden();
  }
  await expect(page.getByRole('dialog', { name: 'Counts' })).toBeVisible();
}
