import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { COMMAND_DATA } from '../../web/app/commands/data';
import {
  ABOUT_PATH,
  aboutShown,
  answerDialogs,
  chooseMenuItem,
  dialogsAsked,
  editor,
  editorText,
  expect,
  MENU_BAR,
  menuBar,
  menuItems,
  openedExternally,
  QUIT_PATH,
  settledMenu,
  stored,
  test,
} from './helpers';

// The menu bar (Plan 6 Task 4): built in the main process from the command list the page sends
// (the same data the palette uses), every item running the page's registered command. A menu item
// is chosen here from the main process (`MenuItem.click`), as a click on it would.

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
const dialog = (page: Page, name: string) => page.getByRole('dialog', { name });

test('has File, Edit, View, Go, and Help, with an item for every command', async ({ desktop }) => {
  const { app, errors } = await desktop();
  await expect.poll(() => menuBar(app)).toEqual(MENU_BAR);
  // The page's list has arrived: every command Drafter has is in the menu, once.
  await expect
    .poll(async () => (await menuItems(app)).map((i) => i.id), { timeout: 15_000 })
    .toEqual(expect.arrayContaining(COMMAND_DATA.map((c) => c.id)));
  const ids = (await menuItems(app)).map((i) => i.id);
  expect(new Set(ids).size).toBe(ids.length);
  // Keys are shown, not registered, so the page's own handlers keep them.
  const items = new Map((await menuItems(app)).map((i) => [i.id, i]));
  for (const data of COMMAND_DATA.filter((c) => c.keys)) {
    const item = items.get(data.id);
    expect(item?.accelerator, data.id).not.toBe('');
    expect(item?.registerAccelerator, data.id).toBe(false);
  }
  expect(items.get('save')?.accelerator).toBe('CmdOrCtrl+S');
  expect(items.get('new-screenplay')?.accelerator).toBe('CmdOrCtrl+Alt+N');
  expect(errors).toEqual([]);
});

test('the File menu has Open as Screenplay…', async ({ desktop }) => {
  const { app } = await desktop();
  // On once the first script has opened, as Open is.
  const state = async (id: string) => (await menuItems(app)).find((i) => i.id === id)?.enabled;
  await expect.poll(() => state('open-as-screenplay'), { timeout: 15_000 }).toBe(true);
  const items = await menuItems(app);
  const at = items.findIndex((i) => i.id === 'open');
  expect(items[at + 1]).toMatchObject({ id: 'open-as-screenplay', label: 'Open as Screenplay…' });
});

test('runs a command from the menu', async ({ desktop }) => {
  const { app, page } = await desktop();
  await expect
    .poll(async () => (await menuItems(app)).some((i) => i.id === 'new-screenplay'))
    .toBe(true);
  expect((await stored(page)).length).toBe(1);
  await chooseMenuItem(app, ['File', 'New screenplay']);
  await expect.poll(async () => (await stored(page)).length).toBe(2);
  // A second command, from another menu: the page does what the palette would do.
  await chooseMenuItem(app, ['Go', 'Go to scene or command']);
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
});

test('runs a Markdown document’s commands only when the page says they apply', async ({
  desktop,
}) => {
  const { app, page } = await desktop();
  const state = async (id: string) => (await menuItems(app)).find((i) => i.id === id)?.enabled;
  // A Fountain script: Show Script applies, Show Preview doesn't.
  await expect.poll(() => state('show-script')).toBe(true);
  expect(await state('show-preview')).toBe(false);
  await chooseMenuItem(app, ['File', 'New Markdown document']);
  await expect.poll(() => state('show-preview')).toBe(true);
  expect(await state('show-script')).toBe(false);
  // A menu item the page says is off does nothing when it is chosen late (before the menu catches up).
  const before = (await stored(page)).length;
  await app.evaluate(({ BrowserWindow }) => {
    const [window] = BrowserWindow.getAllWindows();
    window?.webContents.send('drafter:menu:run', 'show-script');
  });
  expect((await stored(page)).length).toBe(before);
});

test('follows what the page can do: undo, saving, and sprints', async ({ desktop }) => {
  const { app, page } = await desktop();
  const state = async (id: string) => (await menuItems(app)).find((i) => i.id === id)?.enabled;
  await expect.poll(() => state('sprint-stop')).toBe(false);
  expect(await state('sprint-15')).toBe(true);
  await chooseMenuItem(app, ['View', 'Sprint', 'Start a 15-minute sprint']);
  await expect.poll(() => state('sprint-stop')).toBe(true);
  expect(await state('sprint-15')).toBe(false);
  await chooseMenuItem(app, ['View', 'Sprint', 'Stop sprint']);
  await expect.poll(() => state('sprint-stop')).toBe(false);
  await expect(page.locator('.cm-content')).toBeVisible();
});

test('saves once on Mod+S', async ({ desktop, profile }) => {
  const { app, page } = await desktop();
  await expect.poll(async () => (await menuItems(app)).some((i) => i.id === 'save')).toBe(true);
  const folder = join(profile.home, 'Scripts');
  mkdirSync(folder, { recursive: true });
  const target = join(folder, 'Once.fountain');
  // The first Save of an unsaved script asks where; a second run of the command would ask again.
  answerDialogs(profile, [target, join(folder, 'Twice.fountain')]);
  await editor(page).click();
  await page.keyboard.press(`${MOD}+End`);
  await page.keyboard.insertText('\nSAVED ONCE.\n');
  await page.keyboard.press(`${MOD}+s`);
  await expect.poll(() => existsSync(target)).toBe(true);
  await expect.poll(() => readFileSync(target, 'utf8')).toContain('SAVED ONCE.');
  await page.waitForTimeout(800);
  expect(dialogsAsked(profile).filter((d) => d.kind === 'save')).toHaveLength(1);
  expect(existsSync(join(folder, 'Twice.fountain'))).toBe(false);
});

test('File › Export › Markdown file exports a script', async ({ desktop, profile }) => {
  const { app, page } = await desktop();
  const state = async (id: string) => (await menuItems(app)).find((i) => i.id === id)?.enabled;
  // On for a screenplay as for a Markdown document: one command for both (Call 24).
  await expect.poll(() => state('export-md')).toBe(true);
  const folder = join(profile.home, 'Exports');
  mkdirSync(folder, { recursive: true });
  const target = join(folder, 'The Call (outline).md');
  answerDialogs(profile, [target]);
  await chooseMenuItem(app, ['File', 'Export', 'Markdown file']);
  await expect(page.locator('.toast [role="status"]').filter({ hasText: 'Exported' })).toHaveText(
    'Exported The Call (outline).md.',
  );
  // The whole script, as Markdown: its title, its section, and its first scene.
  const written = readFileSync(target, 'utf8');
  expect(written.startsWith('# The Call\n')).toBe(true);
  expect(written).toContain('\n### INT. KITCHEN - NIGHT\n');
  expect(written).toContain('**MARGARET**');
  expect(dialogsAsked(profile)[0]).toMatchObject({ kind: 'save', extension: '.md' });
  expect(dialogsAsked(profile)[0]?.defaultPath).toMatch(/The Call\.md$/);
});

test('File › Export › HTML saves a script as one .html page', async ({ desktop, profile }) => {
  const { app, page } = await desktop();
  const state = async (id: string) => (await menuItems(app)).find((i) => i.id === id)?.enabled;
  await expect.poll(() => state('export-html')).toBe(true);
  const folder = join(profile.home, 'Exports');
  mkdirSync(folder, { recursive: true });
  // Typed without its extension: the Save dialog's type adds it.
  const target = join(folder, 'The Call page');
  answerDialogs(profile, [target]);
  await chooseMenuItem(app, ['File', 'Export', 'HTML']);
  await expect(page.locator('.toast [role="status"]').filter({ hasText: 'Exported' })).toHaveText(
    'Exported The Call page.html.',
  );
  const written = readFileSync(`${target}.html`, 'utf8');
  expect(written.startsWith('<!DOCTYPE html>')).toBe(true);
  expect(written).toContain('<h1 class="title">The Call</h1>');
  expect(written).toContain('Screenplay · ');
  expect(written).toMatch(/<meta name="generator" content="Drafter \d+\.\d+\.\d+" \/>/);
  expect(dialogsAsked(profile)[0]).toMatchObject({ kind: 'save', extension: '.html' });
  expect(dialogsAsked(profile)[0]?.defaultPath).toMatch(/The Call\.html$/);
});

test('creates one script on Mod+Alt+N, and the editor’s Mod+Alt keys still work', async ({
  desktop,
}) => {
  const { app, page } = await desktop();
  await expect
    .poll(async () => (await menuItems(app)).some((i) => i.id === 'new-screenplay'))
    .toBe(true);
  expect((await stored(page)).length).toBe(1);
  // Mod+Alt+1 makes the line a scene heading (`INT. ` and capitals): the editor's own key, with the
  // menu bar showing. (In the sample: a script of one's own, unsaved, would ask before the app closes.)
  await editor(page).click();
  await page.keyboard.press(`${MOD}+End`);
  await page.keyboard.insertText('\nthe roof');
  await page.keyboard.press(`${MOD}+Alt+1`);
  await expect.poll(() => editorText(page)).toContain('INT. THE ROOF');
  // Mod+Alt+N, the menu's key for New screenplay, makes one script, not two.
  await page.keyboard.press(`${MOD}+Alt+n`);
  await expect.poll(async () => (await stored(page)).length).toBe(2);
  await page.waitForTimeout(800);
  expect((await stored(page)).length).toBe(2);
});

test('opens a help page in its own window', async ({ desktop }) => {
  const { app, page } = await desktop();
  await expect
    .poll(async () => (await menuItems(app)).some((i) => i.id === 'help-shortcuts'))
    .toBe(true);
  const opened = app.waitForEvent('window');
  await chooseMenuItem(app, ['Help', 'Keyboard Shortcuts']);
  const help = await opened;
  await expect.poll(() => help.url()).toBe('app://drafter/docs/shortcuts/');
  await expect(help.getByRole('heading', { level: 1 })).toContainText('Keyboard shortcuts');
  // The editor is still there, and untouched.
  expect(page.url()).toBe('app://drafter/');
  expect(app.windows()).toHaveLength(2);
  // The other two pages.
  for (const [label, path] of [
    ['Saving', '/docs/saving/'],
    ['Privacy', '/docs/privacy/'],
  ] as const) {
    const next = app.waitForEvent('window');
    await chooseMenuItem(app, ['Help', label]);
    await expect.poll(async () => (await next).url()).toBe(`app://drafter${path}`);
  }
});

test('chooses a menu item from the help window as well, and the editor answers', async ({
  desktop,
}) => {
  const { app, page } = await desktop();
  await expect
    .poll(async () => (await menuItems(app)).some((i) => i.id === 'help-privacy'))
    .toBe(true);
  const opened = app.waitForEvent('window');
  await chooseMenuItem(app, ['Help', 'Privacy']);
  await opened;
  await chooseMenuItem(app, ['File', 'New screenplay']);
  await expect.poll(async () => (await stored(page)).length).toBe(2);
});

test('takes its command list only from the editor window, not from a help window', async ({
  desktop,
}) => {
  const { app, page } = await desktop();
  await expect.poll(async () => (await menuItems(app)).some((i) => i.id === 'save')).toBe(true);
  const before = await settledMenu(app);
  // A help window that asks for a menu of its own (its page is the app's, with the app's preload).
  const [help] = await Promise.all([
    app.waitForEvent('window'),
    page.evaluate(() => {
      window.open('/docs/privacy/', '_blank');
    }),
  ]);
  await help.waitForLoadState('domcontentloaded');
  await help.evaluate(() => {
    window.drafterDesktop?.menu.setCommands([
      { id: 'palette', title: 'Not yours', group: 'Go', enabled: true },
    ]);
  });
  expect(await settledMenu(app)).toEqual(before);
});

test('a help window that becomes an editor does not take the menu over', async ({ desktop }) => {
  const { app, page } = await desktop();
  await expect.poll(async () => (await menuItems(app)).some((i) => i.id === 'palette')).toBe(true);
  const [help] = await Promise.all([
    app.waitForEvent('window'),
    page.evaluate(() => {
      window.open('/docs/privacy/', '_blank');
    }),
  ]);
  await help.waitForLoadState('domcontentloaded');
  // Its "Back to Drafter" link, with no opener to go back to: the help window becomes an editor,
  // which sends the menu its own commands.
  await help.evaluate(() => {
    window.location.href = '/';
  });
  await expect(editor(help)).toBeVisible({ timeout: 30_000 });
  await help.waitForTimeout(1500);
  await settledMenu(app);

  await chooseMenuItem(app, ['Go', 'Go to scene or command']);
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
  await expect(help.getByRole('dialog', { name: 'Command palette' })).toBeHidden();
});

test('Back to Drafter in a help window brings the editor forward and closes the help window', async ({
  desktop,
}) => {
  const { app, page } = await desktop();
  await expect.poll(async () => (await menuItems(app)).some((i) => i.id === 'palette')).toBe(true);
  const [help] = await Promise.all([
    app.waitForEvent('window'),
    page.evaluate(() => {
      window.open('/docs/privacy/', '_blank');
    }),
  ]);
  await help.waitForLoadState('domcontentloaded');
  // Hydrated: before that the link is a plain link, which is what a page without JavaScript gets.
  await expect
    .poll(() => help.evaluate(() => '__vue_app__' in (document.getElementById('__nuxt') ?? {})))
    .toBe(true);
  await expect.poll(() => app.windows().length).toBe(2);
  const closed = help.waitForEvent('close');
  // From the keyboard: the link is the first thing on the page.
  const back = help.getByRole('link', { name: /Back to Drafter/ });
  await back.focus();
  // The window may be gone before the press is done (on Linux it is): that is the point.
  await help.keyboard.press('Enter').catch((error: Error) => {
    if (!/closed/.test(error.message)) throw error;
  });
  await closed;
  await expect.poll(() => app.windows().length).toBe(1);
  // The editor is still the one script, as it was: no second editor was loaded anywhere.
  expect(page.url()).toBe('app://drafter/');
  await expect(editor(page)).toBeVisible();
});

test('takes the tour and resets the sample from Help and File', async ({ desktop }) => {
  const { app, page } = await desktop();
  await expect
    .poll(async () => (await menuItems(app)).some((i) => i.id === 'take-the-tour'))
    .toBe(true);
  await chooseMenuItem(app, ['Help', 'Take the tour']);
  await expect(dialog(page, 'Fountain in 30 seconds')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog(page, 'Fountain in 30 seconds')).toBeHidden();

  await editor(page).click();
  await page.keyboard.press(`${MOD}+End`);
  await page.keyboard.insertText('\nMY OWN EDIT.\n');
  await expect.poll(() => editorText(page)).toContain('MY OWN EDIT.');
  await expect
    .poll(async () => (await menuItems(app)).find((i) => i.id === 'reset-sample')?.enabled)
    .toBe(true);
  await chooseMenuItem(app, ['File', 'Reset sample']);
  await expect.poll(() => editorText(page)).not.toContain('MY OWN EDIT.');
});

test('shows About Drafter with Electron’s version, and opens its links outside the app', async ({
  desktop,
  profile,
}) => {
  const { app, page } = await desktop();
  const version = await page.evaluate(() => window.drafterDesktop?.version);
  const [appVersion, electron, chrome] = await app.evaluate(({ app }) => [
    app.getVersion(),
    process.versions.electron,
    process.versions.chrome,
  ]);
  expect(version).toBe(appVersion);
  // The page's own command, once its list is in the menu: About is its dialog, not the native box.
  await expect
    .poll(async () => (await menuItems(app)).some((i) => i.id === 'about-drafter'))
    .toBe(true);
  await chooseMenuItem(app, ABOUT_PATH);
  const about = page.getByRole('dialog', { name: 'Drafter', exact: true });
  await expect(about).toBeVisible();
  await expect(about.locator('[data-about-version]')).toHaveText(`v${appVersion}`);
  await expect(about).toContainText('The desktop app');
  await expect(about.locator('[data-about-runtime]')).toHaveText(
    `Electron ${electron}, Chromium ${chrome}`,
  );
  expect(aboutShown(profile)).toEqual([]);
  // A link goes to the system browser; the app's window stays where it is.
  await about.getByRole('link', { name: 'Source code on GitHub' }).click();
  await expect
    .poll(() => openedExternally(profile))
    .toEqual(['https://github.com/cschweda/drafter']);
  expect(page.url()).toBe('app://drafter/');
  expect(app.windows()).toHaveLength(1);
  await page.keyboard.press('Escape');
  await expect(about).toBeHidden();
});

test('opens a sample script from Help as a new script', async ({ desktop }) => {
  const { app, page } = await desktop();
  const before = (await stored(page)).length;
  await chooseMenuItem(app, ['Help', 'Sample Scripts', 'Stage play']);
  await expect.poll(() => editorText(page)).toContain('Sample: Stage play');
  await expect.poll(async () => (await stored(page)).length).toBe(before + 1);
});

test('opens the releases page in the browser, not the app', async ({ desktop, profile }) => {
  const { app, page } = await desktop();
  await chooseMenuItem(app, ['Help', 'Open the Releases Page']);
  await expect
    .poll(() => openedExternally(profile))
    .toEqual(['https://github.com/cschweda/drafter/releases']);
  expect(page.url()).toBe('app://drafter/');
  expect(app.windows()).toHaveLength(1);
});

test('quits through app.quit(), where Task 5 can stop it', async ({ desktop }) => {
  const { app } = await desktop();
  // Held on every quit, not once: the app's own close flow asks, finds nothing unsaved, and
  // quits again, which a one-time hook would let through.
  await app.evaluate(({ app: electron }) => {
    type Held = { beforeQuit: number; holdQuit: (event: { preventDefault(): void }) => void };
    const g = globalThis as unknown as Held;
    g.beforeQuit = 0;
    g.holdQuit = (event) => {
      g.beforeQuit++;
      event.preventDefault();
    };
    electron.on('before-quit', g.holdQuit);
  });
  await chooseMenuItem(app, QUIT_PATH);
  await expect
    .poll(() => app.evaluate(() => (globalThis as unknown as { beforeQuit: number }).beforeQuit))
    .toBeGreaterThanOrEqual(1);
  // Read again until it answers: on Windows the stopped quit can still be settling.
  await expect
    .poll(async () => (await menuItems(app)).some((i) => i.id === 'quit' || i.label === 'Quit'))
    .toBe(true);
  // The hook stopped it: the app is still there.
  expect(app.windows()).toHaveLength(1);
  await app.evaluate(({ app: electron }) => {
    electron.off('before-quit', (globalThis as unknown as { holdQuit: () => void }).holdQuit);
  });
});

test('keeps its menu when the page sends nonsense, and ignores a page that isn’t the app’s', async ({
  desktop,
}) => {
  const { app, page } = await desktop();
  await expect.poll(async () => (await menuItems(app)).some((i) => i.id === 'save')).toBe(true);
  const before = await settledMenu(app);
  await page.evaluate(() => {
    const menu = window.drafterDesktop?.menu;
    const send = menu?.setCommands as unknown as (list: unknown) => void;
    send([{ id: 'evil', title: 'x', group: 'File', enabled: true, keys: 'Mod-s' }]);
    send('not a list');
    send(
      Array.from({ length: 5000 }, (_, i) => ({
        id: `c${i}`,
        title: 't',
        group: 'File',
        enabled: true,
      })),
    );
    send([{ id: 'x'.repeat(10_000), title: 't', group: 'File', enabled: true }]);
  });
  expect(await settledMenu(app)).toEqual(before);
});

test('rebuilds the menu when a good list arrives, and drops what is no longer there', async ({
  desktop,
}) => {
  const { app, page } = await desktop();
  await expect.poll(async () => (await menuItems(app)).some((i) => i.id === 'save')).toBe(true);
  // The page sends its list again as its commands settle (the dictionary loading, the window's
  // width), which would replace the list sent here: wait for that first.
  await settledMenu(app);
  await page.evaluate(() => {
    window.drafterDesktop?.menu.setCommands([
      { id: 'only-one', title: 'Only one', group: 'View', enabled: false },
    ]);
  });
  // One reading of the menu answers all three questions.
  await expect
    .poll(async () => {
      const items = await menuItems(app);
      return {
        there: items.some((i) => i.id === 'only-one'),
        enabled: items.find((i) => i.id === 'only-one')?.enabled,
        save: items.some((i) => i.id === 'save'),
      };
    })
    .toEqual({ there: true, enabled: false, save: false });
  // The page sends its own list again when something changes: a reload starts it afresh.
  await page.reload();
  await expect.poll(async () => (await menuItems(app)).some((i) => i.id === 'save')).toBe(true);
});
