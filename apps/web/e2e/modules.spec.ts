import { expect, test } from '@playwright/test';
import {
  chooseTab,
  closeSettings,
  consentDialog,
  countScenes,
  editor,
  expectTabOffered,
  fixtureSwitch,
  fixtureTab,
  lastPane,
  openSettings,
  palette,
  paletteInput,
  problemsList,
  problemsTab,
  runCommand,
  setText,
  settingsDialog,
  showProblems,
  showSource,
  start,
  textOf,
  turnOnFixture,
} from './modules';

const SCRIPT = [
  'INT. HALL - DAY',
  '',
  'Rain on the glass.',
  '',
  'EXT. YARD - NIGHT',
  '',
  'Quiet.',
].join('\n');

test.describe('script modules', () => {
  test('turns a module on after its network consent, and off again', async ({ page }) => {
    await start(page);
    // Off to begin with: no button, no tab, no command.
    await expect(countScenes(page)).toHaveCount(0);
    await expect(fixtureTab(page)).toHaveCount(0);

    await openSettings(page);
    const modules = settingsDialog(page).getByRole('region', { name: 'Modules' });
    await expect(modules).toContainText('Fixture');
    await expect(modules).toContainText('example.invalid');
    await expect(fixtureSwitch(page)).not.toBeChecked();

    // The question comes first, in plain words; Cancel leaves it off.
    await fixtureSwitch(page).click();
    await expect(consentDialog(page)).toContainText(
      'Fixture sends your script to example.invalid when you ask it to. Turn it on?',
    );
    await consentDialog(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(consentDialog(page)).toBeHidden();
    await expect(fixtureSwitch(page)).not.toBeChecked();
    await expect(fixtureSwitch(page)).toBeFocused();

    // Escape is no too.
    await fixtureSwitch(page).click();
    await expect(consentDialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(consentDialog(page)).toBeHidden();
    await expect(fixtureSwitch(page)).not.toBeChecked();
    await expect(settingsDialog(page)).toBeVisible();

    // Yes turns it on.
    await fixtureSwitch(page).click();
    await consentDialog(page).getByRole('button', { name: 'Turn on' }).click();
    await expect(fixtureSwitch(page)).toBeChecked();
    await closeSettings(page);

    // Its parts: the button, the tab, and the command.
    await expect(countScenes(page)).toBeVisible();
    // Offered in the tab row, under More until it is chosen (Phase 2 design §5.8).
    await expectTabOffered(page, 'Fixture');
    await page.keyboard.press('ControlOrMeta+k');
    await expect(paletteInput(page)).toBeFocused();
    await page.keyboard.insertText('Fixture');
    await expect(
      palette(page).getByRole('option', { name: 'Fixture: add a note', exact: true }),
    ).toBeVisible();
    // Under the module's name.
    await expect(palette(page).getByText('Fixture', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(palette(page)).toBeHidden();

    // Its problems go with it.
    await countScenes(page).click();
    await showProblems(page);
    await expect(
      problemsList(page).getByRole('button', { name: /Fixture Info: Scene 1/ }),
    ).toBeVisible();

    // Off takes the parts away, and the problems; no question is asked.
    await openSettings(page);
    await fixtureSwitch(page).click();
    await expect(fixtureSwitch(page)).not.toBeChecked();
    await expect(consentDialog(page)).toBeHidden();
    await closeSettings(page);
    await expect(countScenes(page)).toHaveCount(0);
    await expect(fixtureTab(page)).toHaveCount(0);
    // Nor under More, which has only Cards, Notes, and Stats now.
    await page.locator('[data-pane]').first().getByRole('button', { name: 'More tabs' }).click();
    await expect(page.getByRole('menu', { name: 'More tabs' }).getByRole('menuitem')).toHaveText([
      'Cards',
      /^Notes, \d+ open$/,
      'Stats',
    ]);
    await page.keyboard.press('Escape');
    await expect(page.getByText('Fixture Info:')).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+k');
    await expect(paletteInput(page)).toBeFocused();
    await page.keyboard.insertText('Fixture');
    await expect(
      palette(page).getByRole('option', { name: 'Fixture: add a note', exact: true }),
    ).toHaveCount(0);
  });

  test('closes the module tab when the module is turned off', async ({ page }) => {
    await start(page);
    await turnOnFixture(page);
    await chooseTab(page, 'Fixture');
    await expect(page.getByRole('tabpanel', { name: 'Fixture' })).toBeVisible();
    await openSettings(page);
    await fixtureSwitch(page).click();
    await closeSettings(page);
    await expect(fixtureTab(page)).toHaveCount(0);
    // A pane is showing one of the core tabs again, and the editor is still there.
    await expect(page.getByRole('tabpanel')).not.toHaveCount(0);
    await showSource(page);
  });

  test("runs the module's button and lists its problems with their lines", async ({ page }) => {
    await start(page);
    await turnOnFixture(page);
    await setText(page, SCRIPT);
    await showProblems(page);
    const before = await problemsTab(page).textContent();

    await countScenes(page).click();
    await showProblems(page);
    const list = problemsList(page);
    await expect(list.getByRole('button', { name: 'Fixture Info: Scene 1 Line 1' })).toBeVisible();
    await expect(list.getByRole('button', { name: 'Fixture Info: Scene 2 Line 5' })).toBeVisible();
    // The module's items aren't counted.
    expect(await problemsTab(page).textContent()).toBe(before);

    // Choosing one selects its text in the Source pane.
    await list.getByRole('button', { name: /Scene 2/ }).click();
    await expect(editor(page)).toBeFocused();
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('EXT. YARD - NIGHT');

    // The line follows the text: a line added above moves the item down, and it stays attached.
    await page.keyboard.press('ControlOrMeta+Home');
    await page.keyboard.insertText('Title: x\n\n');
    await showProblems(page);
    await expect(list.getByRole('button', { name: 'Fixture Info: Scene 2 Line 7' })).toBeVisible();
    await expect(lastPane(page)).toBeVisible();
  });

  test('moves focus on after a fix while a module has items in the list', async ({ page }) => {
    await start(page);
    await turnOnFixture(page);
    await setText(page, "INT. HALL - DAY\n\nMARGARET\nHi.\n\nMARGARET (CONT'D)\nHi again.\n");
    await countScenes(page).click();
    await showProblems(page);
    const fix = problemsList(page).getByRole('button', { name: "Remove (CONT'D)" });
    await fix.focus();
    await page.keyboard.press('Space');
    await expect
      .poll(() => textOf(page))
      .toBe('INT. HALL - DAY\n\nMARGARET\nHi.\n\nMARGARET\nHi again.\n');
    // The module's item, which follows the one that went, takes focus; the edit didn't disturb it.
    await expect(
      problemsList(page).getByRole('button', { name: 'Fixture Info: Scene 1 Line 1' }),
    ).toBeFocused();
  });

  test("applies a module's change as one undoable step", async ({ page }) => {
    await start(page);
    await turnOnFixture(page);
    await setText(page, SCRIPT);
    await page.keyboard.press('ControlOrMeta+Home');
    // Typing just before, which a change would otherwise be grouped with.
    await page.keyboard.insertText('Typed. ');
    await runCommand(page, 'Fixture: add a note');
    await expect.poll(() => textOf(page)).toMatch(/^Typed\. \[\[fixture\]\]INT\. HALL - DAY/);

    // One undo takes the module's change away and nothing else.
    await editor(page).focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => textOf(page)).toMatch(/^Typed\. INT\. HALL - DAY/);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect.poll(() => textOf(page)).toMatch(/^Typed\. \[\[fixture\]\]INT\. HALL/);
  });

  test('shows a module that throws as a toast and goes on', async ({ page }) => {
    await start(page);
    await turnOnFixture(page);
    await runCommand(page, 'Fixture: fail on purpose');
    await expect(
      page.getByRole('alert').filter({ hasText: 'Fixture couldn’t finish' }),
    ).toContainText('this module always fails');
    // The editor still works.
    await setText(page, SCRIPT);
    await expect.poll(() => textOf(page)).toContain('Rain on the glass.');
  });

  test('remembers which modules are on after a reload', async ({ page }) => {
    await start(page);
    await turnOnFixture(page);
    await page.reload();
    await expect(editor(page)).toBeAttached();
    await expect(countScenes(page)).toBeVisible();
    await expectTabOffered(page, 'Fixture');
    await openSettings(page);
    await expect(fixtureSwitch(page)).toBeChecked();
    // Off is remembered too.
    await fixtureSwitch(page).click();
    await expect(fixtureSwitch(page)).not.toBeChecked();
    await closeSettings(page);
    await page.reload();
    await expect(editor(page)).toBeAttached();
    await openSettings(page);
    await expect(fixtureSwitch(page)).not.toBeChecked();
    await closeSettings(page);
    await expect(countScenes(page)).toHaveCount(0);
  });

  test("reaches the module's button, tab, and command from the keyboard", async ({
    page,
    browserName,
  }) => {
    await start(page);
    await openSettings(page);
    // The switch with the keyboard: Space asks, the dialog's buttons answer.
    await fixtureSwitch(page).focus();
    await page.keyboard.press('Space');
    await expect(consentDialog(page)).toBeVisible();
    await expect(consentDialog(page).getByRole('button', { name: 'Cancel' })).toBeFocused();
    await consentDialog(page).getByRole('button', { name: 'Turn on' }).focus();
    await page.keyboard.press('Enter');
    await expect(fixtureSwitch(page)).toBeChecked();
    await expect(fixtureSwitch(page)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(settingsDialog(page)).toBeHidden();

    await setText(page, SCRIPT);

    // The button: Enter runs it.
    await countScenes(page).focus();
    await page.keyboard.press('Enter');
    await showProblems(page);
    await expect(
      problemsList(page).getByRole('button', { name: 'Fixture Info: Scene 1 Line 1' }),
    ).toBeVisible();
    // Space does too.
    await countScenes(page).focus();
    await page.keyboard.press('Space');
    await expect(
      problemsList(page).getByRole('button', { name: 'Fixture Info: Scene 1 Line 1' }),
    ).toBeVisible();

    // The tab: More, after the tab row, offers it (no tab is in the slot yet); the arrow keys reach
    // it there, and Enter chooses it, with focus on its tab.
    await lastPane(page).getByRole('tab', { selected: true }).focus();
    // WebKit's Tab skips buttons unless Alt is held, as Safari's does by default.
    await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
    const more = lastPane(page).getByRole('button', { name: 'More tabs' });
    await expect(more).toBeFocused();
    await page.keyboard.press('Enter');
    const item = page.getByRole('menu', { name: 'More tabs' }).getByRole('menuitem', {
      name: 'Fixture',
    });
    await page.keyboard.press('End');
    await expect(item).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(fixtureTab(page).last()).toBeFocused();
    const panel = page.getByRole('tabpanel', { name: 'Fixture' });
    await expect(panel).toBeVisible();
    // It lists the title of the script.
    await expect(panel).toContainText('Title of this script');
    await expect(panel.getByRole('listitem')).not.toHaveText('');
    await panel.focus();
    await expect(panel).toBeFocused();

    // The command: the palette, with the keyboard alone.
    await showSource(page);
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+Home');
    await runCommand(page, 'Fixture: add a note');
    await expect.poll(() => textOf(page)).toMatch(/^\[\[fixture\]\]INT\./);
  });

  test('lets a run that waited finish only in the script and text it began in', async ({
    page,
  }) => {
    await start(page);
    await turnOnFixture(page);
    const later = (reported: boolean, changed: boolean) =>
      page
        .getByRole('status')
        .filter({ hasText: `Later: reported ${reported}, changed ${changed}` });
    const title = 'Fixture: add a note after a pause';

    // Left alone, it reports and changes.
    await setText(page, SCRIPT);
    await page.keyboard.press('ControlOrMeta+Home');
    await runCommand(page, title);
    await expect(later(true, true)).toBeAttached({ timeout: 5000 });
    await expect.poll(() => textOf(page)).toMatch(/^\[\[later\]\]INT\. HALL/);

    // Text edited while it waited: it may report, but not change what it never saw.
    await runCommand(page, title);
    await showSource(page);
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.insertText(' Edited meanwhile.');
    await expect(later(true, false)).toBeAttached({ timeout: 5000 });
    expect(await textOf(page)).not.toMatch(/\[\[later\]\]\[\[later\]\]/);
  });

  test('keeps a run that waited out of the next script', async ({ page }) => {
    await start(page);
    await turnOnFixture(page);
    await runCommand(page, 'Fixture: add a note after a pause');
    await runCommand(page, 'New stage play');
    await expect(
      page.getByRole('status').filter({ hasText: 'Later: reported false, changed false' }),
    ).toBeAttached({ timeout: 5000 });
    await showSource(page);
    expect(await textOf(page)).not.toContain('[[later]]');
    await showProblems(page);
    await expect(problemsList(page)).not.toContainText('Added later');
  });

  test('keeps a run that waited from acting after its module is turned off', async ({ page }) => {
    await start(page);
    await turnOnFixture(page);
    await setText(page, SCRIPT);
    await runCommand(page, 'Fixture: add a note after a pause');
    await openSettings(page);
    await fixtureSwitch(page).click();
    await closeSettings(page);
    await expect(
      page.getByRole('status').filter({ hasText: 'Later: reported false, changed false' }),
    ).toBeAttached({ timeout: 5000 });
    expect(await textOf(page)).not.toContain('[[later]]');
    await showProblems(page);
    await expect(problemsList(page)).not.toContainText('Added later');
  });

  test('shows a notice, not a broken page, when a module’s tab or settings throws', async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem('drafter-fixture-throw', '1'));
    await start(page);
    await openSettings(page);
    await fixtureSwitch(page).click();
    await consentDialog(page).getByRole('button', { name: 'Turn on' }).click();
    // Its settings component threw while it drew: the section says so, and the dialog still works.
    await expect(settingsDialog(page)).toContainText('Fixture’s settings couldn’t be shown.');
    await expect(fixtureSwitch(page)).toBeChecked();
    await closeSettings(page);

    await chooseTab(page, 'Fixture');
    const panel = page.getByRole('tabpanel', { name: 'Fixture' });
    await expect(panel).toContainText('Fixture’s tab couldn’t be shown.');
    await expect(
      page.getByRole('alert').filter({ hasText: 'Fixture’s tab couldn’t be shown.' }),
    ).toBeAttached();
    // The editor is untouched.
    await setText(page, SCRIPT);
    await expect.poll(() => textOf(page)).toContain('Rain on the glass.');
  });

  test('keeps a module off whose network origins grew since the writer agreed', async ({
    page,
  }) => {
    await start(page);
    // As if the writer had agreed to the Fixture when it declared no network origin.
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('drafter');
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const tx = open.result.transaction('settings', 'readwrite');
            tx.objectStore('settings').put({
              key: 'modules:enabled',
              value: [{ id: 'fixture', origins: [] }],
            });
            tx.oncomplete = () => {
              open.result.close();
              resolve();
            };
          };
        }),
    );
    await page.reload();
    await expect(editor(page)).toBeAttached();
    await openSettings(page);
    await expect(fixtureSwitch(page)).not.toBeChecked();
    await expect(settingsDialog(page)).toContainText(
      'asks for network access you haven’t agreed to',
    );
    await expect(countScenes(page)).toHaveCount(0);
    // Agreeing again turns it on.
    await fixtureSwitch(page).click();
    await consentDialog(page).getByRole('button', { name: 'Turn on' }).click();
    await expect(fixtureSwitch(page)).toBeChecked();
    await closeSettings(page);
    await expect(countScenes(page)).toBeVisible();
  });

  test('gives a module no scenes and no pages in a Markdown document', async ({ page }) => {
    await start(page);
    await turnOnFixture(page);
    await runCommand(page, 'New Markdown document');
    await expect(page.getByRole('tab', { name: 'Preview' }).first()).toBeVisible();
    // The module's tab reads the title (the first heading); its button finds no Fountain scenes.
    await chooseTab(page, 'Fixture');
    const panel = page.getByRole('tabpanel', { name: 'Fixture' });
    await expect(panel).toContainText('Untitled');
    await countScenes(page).click();
    // With spellcheck off there are no checks at all for a Markdown document.
    await openSettings(page);
    await settingsDialog(page).getByRole('switch', { name: 'Spellcheck', exact: true }).uncheck();
    await closeSettings(page);
    await showProblems(page);
    await expect(problemsList(page)).toContainText('No checks for Markdown documents.');
    await expect(problemsList(page)).not.toContainText('Spelling');
    await expect(problemsList(page).locator('.problem-list button')).toHaveCount(0);
  });

  test('fits the toolbar at 320px with a module on', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await start(page);
    await turnOnFixture(page);
    const button = countScenes(page);
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    // A round icon button, the size of the others.
    expect(Math.round(box?.width ?? 0)).toBe(24);
    expect(Math.round(box?.height ?? 0)).toBe(24);
    const overflow = await page.evaluate(() => {
      const toolbar = document.querySelector('header.toolbar') as HTMLElement;
      const right = Math.max(
        ...Array.from(toolbar.querySelectorAll('button')).map(
          (b) => b.getBoundingClientRect().right,
        ),
      );
      return {
        page: document.documentElement.scrollWidth,
        toolbarScroll: toolbar.scrollWidth,
        toolbarClient: toolbar.clientWidth,
        right,
      };
    });
    expect(overflow.page).toBeLessThanOrEqual(320);
    expect(overflow.toolbarScroll).toBeLessThanOrEqual(overflow.toolbarClient);
    expect(overflow.right).toBeLessThanOrEqual(320);
    // The settings dialog fits too, with the module's section in it.
    await openSettings(page);
    const dialog = await settingsDialog(page).boundingBox();
    expect((dialog?.x ?? -1) >= 0 && (dialog?.x ?? 0) + (dialog?.width ?? 999) <= 320).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    );
    await closeSettings(page);
  });

  test('uses no other origin while a module is on', async ({ page }) => {
    await start(page);
    const home = new URL(page.url()).origin;
    const outside: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.protocol.startsWith('http') && url.origin !== home) outside.push(request.url());
    });
    await turnOnFixture(page);
    await countScenes(page).click();
    await runCommand(page, 'Fixture: add a note');
    expect(outside).toEqual([]);
  });
});
