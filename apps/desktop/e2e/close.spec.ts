import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ElectronApplication, Page } from '@playwright/test';
import {
  answerClose,
  answerDialogs,
  chooseMenuItem,
  closeAsked,
  closeRequested,
  editor,
  editorDocument,
  editorText,
  expect,
  type Launched,
  type Profile,
  QUIT_PATH,
  stored,
  test,
} from './helpers';

// Closing and quitting (Plan 6 Task 5): the editor's window is not closed, and the app does not
// quit, until the page has been asked whether closing would lose text; with changes the app asks
// in its own native dialog (answered here from a queue, DRAFTER_E2E_CLOSE) and the recovery copy is
// written before the window goes, whichever the answer.

const CHANGES = 'Save the changes to';
const DETAIL = "Your unsaved changes stay in Drafter's recovery copy either way.";

const openButton = (page: Page) => page.getByRole('button', { name: 'Open', exact: true });
const scriptsMenu = (page: Page) => page.getByRole('group', { name: 'Scripts' });

function folder(profile: Profile, name = 'Scripts'): string {
  const path = join(profile.home, name);
  mkdirSync(path, { recursive: true });
  return path;
}

async function chooseInScripts(page: Page, item: string) {
  await openButton(page).click();
  await scriptsMenu(page).getByRole('button', { name: item }).click();
  await expect(scriptsMenu(page)).toBeHidden();
}

async function typeAtEnd(page: Page, text: string) {
  await editor(page).click();
  // Control+End goes to the end of the text on every platform (the long sample shows only its
  // visible lines, so text typed anywhere else wouldn't be in the page to find).
  await page.keyboard.press('Control+End');
  await page.keyboard.type(text);
}

/** Closes the editor's window as the close button does. */
function closeWindow(app: ElectronApplication) {
  return app.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.webContents.getURL() === 'app://drafter/') window.close();
    }
  });
}

/** How many windows the app has. */
const windowCount = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);

/** Resolves when the app has exited. */
const exited = (launched: Launched) => launched.app.waitForEvent('close');

/**
 * Resolves when closing the editor's window has ended the app. A Mac app keeps running with no
 * window (mac.spec.ts tests that), so there, once the windows are gone, it is quit as well, which
 * asks nothing: no page holds a script. Elsewhere closing the last window quits.
 */
async function closedForGood(launched: Launched): Promise<void> {
  const gone = exited(launched);
  if (process.platform === 'darwin') {
    await expect.poll(() => windowCount(launched.app), { timeout: 30_000 }).toBe(0);
    await launched.app.evaluate(({ app }) => app.quit());
  }
  await gone;
}

/** A moment for something that should not happen to have happened. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 700));

test('closes at once with nothing unsaved', async ({ desktop, profile }) => {
  const launched = await desktop();
  const gone = closedForGood(launched);
  await closeWindow(launched.app);
  await gone;
  expect(closeAsked(profile)).toEqual([]);
});

test('closes at once when only a sample was edited, and keeps the edit', async ({
  desktop,
  profile,
}) => {
  const first = await desktop();
  // The first visit opens the sample.
  await typeAtEnd(first.page, '\nA line in the sample.\n');
  const gone = closedForGood(first);
  await closeWindow(first.app);
  await gone;
  expect(closeAsked(profile)).toEqual([]);
  const again = await desktop();
  // The end of the sample, where the line went, may be below what the editor has drawn.
  await expect.poll(() => editorDocument(again.page)).toContain('A line in the sample.');
});

test('asks before closing with unsaved changes', async ({ desktop, profile }) => {
  const first = await desktop();
  await chooseInScripts(first.page, 'New screenplay');
  await typeAtEnd(first.page, '\nINT. LIGHTHOUSE - NIGHT\n');

  // Cancel keeps the window, and the text.
  answerClose(profile, ['cancel']);
  await closeWindow(first.app);
  await expect.poll(() => closeAsked(profile).length).toBe(1);
  const [asked] = closeAsked(profile);
  expect(asked?.message).toMatch(new RegExp(`^${CHANGES} “.+” before closing\\?$`));
  expect(asked?.detail).toBe(DETAIL);
  expect(asked?.buttons).toEqual(['Save', "Don't Save", 'Cancel']);
  await settle();
  expect(await windowCount(first.app)).toBe(1);
  await expect(editor(first.page)).toContainText('INT. LIGHTHOUSE - NIGHT');

  // It still asks the next time.
  answerClose(profile, ['cancel']);
  await closeWindow(first.app);
  await expect.poll(() => closeAsked(profile).length).toBe(2);
  expect(await windowCount(first.app)).toBe(1);

  // Don't Save closes; the recovery copy has the text on the next launch.
  answerClose(profile, ['discard']);
  const gone = closedForGood(first);
  await closeWindow(first.app);
  await gone;
  expect(closeAsked(profile)).toHaveLength(3);

  const again = await desktop();
  await expect(editor(again.page)).toContainText('INT. LIGHTHOUSE - NIGHT');
  expect((await stored(again.page)).some((p) => p.source.includes('INT. LIGHTHOUSE - NIGHT'))).toBe(
    true,
  );
});

test('Save writes the file, then closes', async ({ desktop, profile }) => {
  const path = join(folder(profile), 'The Call.fountain');
  const first = await desktop();
  await chooseInScripts(first.page, 'New screenplay');
  await typeAtEnd(first.page, '\nINT. LIGHTHOUSE - NIGHT\n');

  // A new script asks where; the answer is the dialog queue's.
  answerDialogs(profile, [path]);
  answerClose(profile, ['save']);
  const gone = closedForGood(first);
  await closeWindow(first.app);
  await gone;
  expect(readFileSync(path, 'utf8')).toContain('INT. LIGHTHOUSE - NIGHT');
  expect(closeAsked(profile)).toHaveLength(1);
});

test('stays open when Save is cancelled or fails, and says why', async ({ desktop, profile }) => {
  test.skip(process.platform === 'win32' || process.getuid?.() === 0, 'POSIX permissions');
  const first = await desktop();
  await chooseInScripts(first.page, 'New screenplay');
  await typeAtEnd(first.page, '\nINT. LIGHTHOUSE - NIGHT\n');

  // The Save As picker is cancelled (an empty queue): nothing is written and the window stays.
  answerClose(profile, ['save']);
  await closeWindow(first.app);
  await expect.poll(() => closeAsked(profile).length).toBe(1);
  await settle();
  expect(await windowCount(first.app)).toBe(1);
  await expect(editor(first.page)).toContainText('INT. LIGHTHOUSE - NIGHT');

  // A file that can't be written: the error is on the page, and the window stays.
  const path = join(folder(profile, 'Locked'), 'Locked.fountain');
  writeFileSync(path, 'Title: Locked\n\nINT. VAULT - NIGHT\n');
  answerDialogs(profile, [path]);
  await chooseInScripts(first.page, 'Open a file…');
  await expect(editor(first.page)).toContainText('INT. VAULT - NIGHT');
  chmodSync(path, 0o444);
  try {
    await typeAtEnd(first.page, '\nNot saved.\n');
    answerClose(profile, ['save']);
    await closeWindow(first.app);
    await expect(
      first.page.getByRole('alert').filter({ hasText: 'Drafter isn’t allowed to write that file' }),
    ).toBeVisible();
    await settle();
    expect(await windowCount(first.app)).toBe(1);
    expect(readFileSync(path, 'utf8')).toBe('Title: Locked\n\nINT. VAULT - NIGHT\n');
  } finally {
    chmodSync(path, 0o644);
  }
  // Writable again, Save and close goes through.
  answerClose(profile, ['save']);
  const gone = closedForGood(first);
  await closeWindow(first.app);
  await gone;
  expect(readFileSync(path, 'utf8')).toContain('Not saved.');
});

test('asks when the app is quit from the menu, and once for all the windows', async ({
  desktop,
  profile,
}) => {
  const first = await desktop();
  await chooseInScripts(first.page, 'New screenplay');
  await typeAtEnd(first.page, '\nINT. LIGHTHOUSE - NIGHT\n');
  // A help window beside the editor.
  const help = first.app.waitForEvent('window');
  await first.app.evaluate(({ BrowserWindow }) => {
    const window = new BrowserWindow({ show: true });
    void window.loadURL('app://drafter/docs/saving/');
  });
  await help;

  answerClose(profile, ['cancel']);
  await chooseMenuItem(first.app, QUIT_PATH);
  await expect.poll(() => closeAsked(profile).length).toBe(1);
  await settle();
  expect(await windowCount(first.app)).toBe(2);

  answerClose(profile, ['discard']);
  const gone = exited(first);
  await chooseMenuItem(first.app, QUIT_PATH);
  await gone;
  expect(closeAsked(profile)).toHaveLength(2);
  const again = await desktop();
  await expect(editor(again.page)).toContainText('INT. LIGHTHOUSE - NIGHT');
});

test('closes a help window without asking, even with unsaved changes in the editor', async ({
  desktop,
  profile,
}) => {
  const first = await desktop();
  await chooseInScripts(first.page, 'New screenplay');
  await typeAtEnd(first.page, '\nINT. LIGHTHOUSE - NIGHT\n');
  const help = first.app.waitForEvent('window');
  await first.app.evaluate(({ BrowserWindow }) => {
    const window = new BrowserWindow({ show: true });
    void window.loadURL('app://drafter/docs/saving/');
  });
  const helpPage = await help;
  const closed = helpPage.waitForEvent('close');
  await first.app.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.webContents.getURL().includes('/docs/')) window.close();
    }
  });
  await closed;
  expect(closeAsked(profile)).toEqual([]);
  expect(await windowCount(first.app)).toBe(1);
});

test('flushes the recovery copy when the app is told to quit', async ({ desktop }) => {
  test.skip(process.platform === 'win32', 'POSIX signals');
  const first = await desktop();
  await chooseInScripts(first.page, 'New screenplay');
  await typeAtEnd(first.page, '\nINT. LIGHTHOUSE - NIGHT\n');
  // At once: the page's own write comes 750 ms after the last key, so only the flush saves this.
  const pid = first.app.process().pid;
  expect(pid).toBeGreaterThan(0);
  const gone = exited(first);
  process.kill(pid as number, 'SIGTERM');
  await gone;
  // No question, no dialog: the recovery copy was told to write, and nothing else.
  expect(closeAsked(first.profile)).toEqual([]);
  expect(closeRequested(first.profile)).toEqual(['flush']);

  const again = await desktop();
  await expect(editor(again.page)).toContainText('INT. LIGHTHOUSE - NIGHT');
  expect(await editorText(again.page)).toContain('INT. LIGHTHOUSE - NIGHT');
});

test('says the page isn’t responding, and closes or stays as asked', async ({
  desktop,
  profile,
}) => {
  const first = await desktop({ env: { DRAFTER_E2E_CLOSE_ASK_MS: '500' } });
  await chooseInScripts(first.page, 'New screenplay');
  await typeAtEnd(first.page, '\nINT. LIGHTHOUSE - NIGHT\n');
  await expect.poll(async () => (await stored(first.page)).length).toBeGreaterThan(1);
  // The page stops answering.
  await first.page.evaluate(() => {
    setTimeout(() => {
      for (;;);
    }, 0);
  });

  answerClose(profile, ['cancel']);
  await closeWindow(first.app);
  await expect.poll(() => closeAsked(profile).length).toBe(1);
  const [asked] = closeAsked(profile);
  expect(asked?.message).toMatch(/isn’t responding/);
  expect(asked?.buttons).toEqual(["Don't Save", 'Cancel']);
  await settle();
  expect(await windowCount(first.app)).toBe(1);

  answerClose(profile, ['discard']);
  const gone = closedForGood(first);
  await closeWindow(first.app);
  await gone;
});

test('the recovery copy is on disk after any way out', async ({ desktop, profile }) => {
  // Quit from the menu with nothing to ask about still writes what was typed a moment ago.
  const first = await desktop();
  await typeAtEnd(first.page, '\nTyped just now.\n');
  const gone = exited(first);
  await chooseMenuItem(first.app, QUIT_PATH);
  await gone;
  expect(closeAsked(profile)).toEqual([]);
  // Asked whether it held anything, then told to write, before the window went.
  expect(closeRequested(profile)).toEqual(['state', 'flush']);
  const again = await desktop();
  await expect.poll(() => editorDocument(again.page)).toContain('Typed just now.');
});
