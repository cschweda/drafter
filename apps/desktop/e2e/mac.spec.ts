import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ElectronApplication, Page } from '@playwright/test';
import {
  answerClose,
  answerDialogs,
  chooseMenuItem,
  closeAsked,
  dialogsAsked,
  editor,
  expect,
  type Launched,
  menuItems,
  type Profile,
  QUIT_PATH,
  ready,
  stored,
  test,
} from './helpers';

// Drafter as a Mac app (docs/desktop-install-macos.md): the window's close button leaves the app
// running, as a Mac app's does, and the Dock icon brings the window back; Finder names files with
// `open-file`, which goes the way a launch's files go (granted, then sent to the page); the app's
// own menu holds About, Settings…, Hide, and Quit. macOS only: elsewhere these are not the rules.

test.skip(process.platform !== 'darwin', 'Mac behaviour');

const DOOR = 'Title: The Open Door\n\nINT. HALL - DAY\n\nA door opens.\n';
const LAMP = 'Title: The Lamp\n\nEXT. LIGHTHOUSE - NIGHT\n\nThe lamp turns.\n';

function script(profile: Profile, name: string, text: string): string {
  const dir = join(profile.home, 'Scripts');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, text);
  return path;
}

const windowCount = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);

/** Closes the editor's window as its close button does. */
const closeWindow = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.webContents.getURL() === 'app://drafter/') window.close();
    }
  });

/** Finder (or the Dock, or `open -a Drafter`) names a file, as macOS does. */
const openFile = (app: ElectronApplication, path: string) =>
  app.evaluate(({ app }, file) => {
    app.emit('open-file', { preventDefault() {} }, file);
  }, path);

/** The Dock icon is clicked with no window on show. */
const clickDock = (app: ElectronApplication) =>
  app.evaluate(({ app }) => {
    app.emit('activate', {}, false);
  });

/** The window that opens next, once its editor is ready. */
async function nextWindow(launched: Launched, action: () => Promise<unknown>): Promise<Page> {
  const opened = launched.app.waitForEvent('window');
  await action();
  const page = await opened;
  await ready(page);
  return page;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 700));

test('keeps running when its window is closed, and the Dock icon brings the window back', async ({
  desktop,
  profile,
}) => {
  const launched = await desktop();
  await closeWindow(launched.app);
  await expect.poll(() => windowCount(launched.app)).toBe(0);
  await settle();
  // Still running: the main process answers, and nothing was asked (nothing was unsaved).
  expect(await windowCount(launched.app)).toBe(0);
  expect(closeAsked(profile)).toEqual([]);

  const page = await nextWindow(launched, () => clickDock(launched.app));
  await expect(editor(page)).toBeVisible();
  expect(await windowCount(launched.app)).toBe(1);
  // The menu follows the new page: its commands are on again.
  await expect
    .poll(async () => (await menuItems(launched.app)).find((i) => i.id === 'save')?.enabled)
    .toBe(true);
  // A click on the Dock icon with the window on show opens no second one.
  await launched.app.evaluate(({ app }) => {
    app.emit('activate', {}, true);
  });
  await settle();
  expect(await windowCount(launched.app)).toBe(1);
});

test('asks before the window closes with unsaved text, and Quit with no window asks nothing', async ({
  desktop,
  profile,
}) => {
  const first = await desktop();
  await first.page.getByRole('button', { name: 'Open', exact: true }).click();
  await first.page
    .getByRole('group', { name: 'Scripts', exact: true })
    .getByRole('button', { name: 'New screenplay' })
    .click();
  await editor(first.page).click();
  await first.page.keyboard.press('Control+End');
  await first.page.keyboard.type('\nINT. LIGHTHOUSE - NIGHT\n');

  answerClose(profile, ['cancel']);
  await closeWindow(first.app);
  await expect.poll(() => closeAsked(profile).length).toBe(1);
  await settle();
  expect(await windowCount(first.app)).toBe(1);

  answerClose(profile, ['discard']);
  await closeWindow(first.app);
  await expect.poll(() => windowCount(first.app)).toBe(0);
  expect(closeAsked(profile)).toHaveLength(2);

  // The app is still running with no window; Quit has no page to ask, so it just goes.
  const gone = first.app.waitForEvent('close');
  await chooseMenuItem(first.app, QUIT_PATH);
  await gone;
  expect(closeAsked(profile)).toHaveLength(2);

  // The recovery copy kept the text.
  const again = await desktop();
  await expect(editor(again.page)).toContainText('INT. LIGHTHOUSE - NIGHT');
});

test('opens a file Finder names, in the window, or in a new one when it was closed', async ({
  desktop,
  profile,
}) => {
  const door = script(profile, 'The Open Door.fountain', DOOR);
  const lamp = script(profile, 'The Lamp.fountain', LAMP);
  const launched = await desktop();

  await openFile(launched.app, door);
  await expect(editor(launched.page)).toContainText('A door opens.');
  expect(await windowCount(launched.app)).toBe(1);
  // Granted as the launch's files are: the page may read it, and only it.
  expect(
    await launched.page.evaluate(
      async (path) => (await window.drafterDesktop?.files.read(path))?.bytes.length,
      door,
    ),
  ).toBe(DOOR.length);
  await expect(
    launched.page.evaluate(
      async (path) => (await window.drafterDesktop?.files.read(path))?.bytes.length,
      lamp,
    ),
  ).rejects.toThrow();

  // With the window closed, the file brings a window back, and opens there.
  await closeWindow(launched.app);
  await expect.poll(() => windowCount(launched.app)).toBe(0);
  const page = await nextWindow(launched, () => openFile(launched.app, lamp));
  await expect(editor(page)).toContainText('The lamp turns.');
  await expect
    .poll(async () => (await stored(page)).map((row) => row.title))
    .toEqual(expect.arrayContaining(['The Open Door', 'The Lamp']));
});

test('says why a file Finder names was not opened', async ({ desktop, profile }) => {
  const picture = script(profile, 'poster.png', 'not a script');
  const { app, page } = await desktop();
  await openFile(app, picture);
  const alert = page.locator('[role="alert"].failed');
  await expect(alert).toContainText('Drafter can’t open “poster.png”');
  await expect(alert).toContainText('isn’t a script');
});

test('has a Mac app menu: About, Settings… (⌘,), Hide, Quit (⌘Q); Close Window (⌘W) in File', async ({
  desktop,
}) => {
  const { app, page } = await desktop();
  await expect.poll(async () => (await menuItems(app)).some((i) => i.id === 'settings')).toBe(true);
  const top = await app.evaluate(({ Menu }) => {
    const bar = Menu.getApplicationMenu();
    const list = (label: string) =>
      bar?.items
        .find((i) => i.label === label)
        ?.submenu?.items.map((i) => ({
          label: i.label,
          role: i.role ?? '',
          accelerator: i.accelerator ? String(i.accelerator) : '',
        })) ?? [];
    return { drafter: list('Drafter'), file: list('File'), window: list('Window') };
  });
  const labels = top.drafter.map((i) => i.label).filter(Boolean);
  expect(labels).toEqual(expect.arrayContaining(['About Drafter', 'Settings…', 'Quit Drafter']));
  expect(top.drafter.find((i) => i.label === 'Settings…')?.accelerator).toBe('CmdOrCtrl+,');
  expect(top.drafter.find((i) => i.label === 'Quit Drafter')?.accelerator).toBe('CmdOrCtrl+Q');
  expect(top.drafter.some((i) => i.role === 'hide')).toBe(true);
  expect(top.file.some((i) => i.label === 'Settings…' || i.label === 'Quit')).toBe(false);
  expect(top.file.at(-1)).toMatchObject({ label: 'Close Window', role: 'close' });
  expect(top.window.length).toBeGreaterThan(0);

  // Settings… runs the page's own command, and says how updates go on a Mac.
  await chooseMenuItem(app, ['Drafter', 'Settings…']);
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await expect(settings).toBeVisible();
  await expect(settings).toContainText('On a Mac, Drafter can’t update itself yet');
});

test('with no window, New, Open…, and Settings… stay on, bring the window back, and run there once', async ({
  desktop,
  profile,
}) => {
  const lamp = script(profile, 'The Lamp.fountain', LAMP);
  const launched = await desktop();
  const { app } = launched;
  await expect.poll(async () => (await menuItems(app)).some((i) => i.id === 'open')).toBe(true);
  const before = (await stored(launched.page)).length;

  await closeWindow(app);
  await expect.poll(() => windowCount(app)).toBe(0);
  // On, with their keys registered (no page to take them); the rest off.
  await expect
    .poll(async () => {
      const items = new Map((await menuItems(app)).map((i) => [i.id, i]));
      return ['new-screenplay', 'open', 'settings', 'save'].map((id) => [
        id,
        items.get(id)?.enabled,
        items.get(id)?.registerAccelerator,
      ]);
    })
    .toEqual([
      ['new-screenplay', true, true],
      ['open', true, true],
      ['settings', true, true],
      ['save', false, false],
    ]);

  // New screenplay: a window, and one new screenplay in it.
  const page = await nextWindow(launched, () => chooseMenuItem(app, ['File', 'New screenplay']));
  await expect.poll(async () => (await stored(page)).length).toBe(before + 1);
  await settle();
  expect((await stored(page)).length).toBe(before + 1);
  // The window's page has the keys again.
  await expect
    .poll(async () => (await menuItems(app)).find((i) => i.id === 'open')?.registerAccelerator)
    .toBe(false);

  // Open…: the window comes back and asks once.
  await closeWindow(app);
  await expect.poll(() => windowCount(app)).toBe(0);
  answerDialogs(profile, [lamp]);
  const second = await nextWindow(launched, () => chooseMenuItem(app, ['File', 'Open…']));
  await expect(editor(second)).toContainText('The lamp turns.');
  expect(dialogsAsked(profile).filter((d) => d.kind === 'open')).toHaveLength(1);

  // Settings…, from the app menu.
  await closeWindow(app);
  await expect.poll(() => windowCount(app)).toBe(0);
  const third = await nextWindow(launched, () => chooseMenuItem(app, ['Drafter', 'Settings…']));
  await expect(third.getByRole('dialog', { name: 'Settings' })).toBeVisible();
});

test('reopened without a restart, the window has the text, can be edited, and Quit asks', async ({
  desktop,
  profile,
}) => {
  const launched = await desktop();
  await launched.page.getByRole('button', { name: 'Open', exact: true }).click();
  await launched.page
    .getByRole('group', { name: 'Scripts', exact: true })
    .getByRole('button', { name: 'New screenplay' })
    .click();
  await editor(launched.page).click();
  await launched.page.keyboard.press('Control+End');
  await launched.page.keyboard.type('\nINT. LIGHTHOUSE - NIGHT\n');

  answerClose(profile, ['discard']);
  await closeWindow(launched.app);
  await expect.poll(() => windowCount(launched.app)).toBe(0);

  const page = await nextWindow(launched, () => clickDock(launched.app));
  // (a) the text is there,
  await expect(editor(page)).toContainText('INT. LIGHTHOUSE - NIGHT');
  // (b) the editor isn't read-only: the closed page's lock on the script was let go,
  await expect(editor(page)).toHaveAttribute('contenteditable', 'true');
  await editor(page).click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('The lamp turns.\n');
  await expect(editor(page)).toContainText('The lamp turns.');
  // (c) and Quit asks about it.
  answerClose(profile, ['cancel']);
  await chooseMenuItem(launched.app, QUIT_PATH);
  await expect.poll(() => closeAsked(profile).length).toBe(2);
  await settle();
  expect(await windowCount(launched.app)).toBe(1);
});
