import {
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import {
  answerDialogs,
  dialogsAsked,
  editor,
  expect,
  type Launched,
  newProfile,
  type Profile,
  test,
} from './helpers';

// Files (Plan 6 Task 2): the OS's own Open and Save dialogs (answered here from a queue,
// DRAFTER_E2E_DIALOG), real files read and written by the main process, atomically, and a watch
// on the open file.

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

const openButton = (page: Page) => page.getByRole('button', { name: 'Open', exact: true });
const saveButton = (page: Page) => page.getByRole('button', { name: 'Save', exact: true });
const scriptsMenu = (page: Page) => page.getByRole('group', { name: 'Scripts' });
const fileBar = (page: Page) => page.locator('[data-file-bar]');

/** A folder of the test's own for the writer's files. */
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

/** Open a file… answered with `path`. */
async function openPath(page: Page, profile: Profile, path: string) {
  answerDialogs(profile, [path]);
  await chooseInScripts(page, 'Open a file…');
}

/** Types at the end of the script. */
async function typeAtEnd(page: Page, text: string) {
  await editor(page).click();
  await page.keyboard.press(`${MOD}+End`);
  await page.keyboard.type(text);
}

/** Clicks Save. */
async function saveNow(page: Page) {
  await saveButton(page).click();
}

const text = (path: string) => readFileSync(path, 'utf8');

test('saves a new script to a real file and reopens it', async ({ desktop, profile }) => {
  const scripts = folder(profile);
  const path = join(scripts, 'First Draft.fountain');
  const first = await desktop();
  await chooseInScripts(first.page, 'New screenplay');
  await typeAtEnd(first.page, '\nINT. LIGHTHOUSE - NIGHT\n');

  answerDialogs(profile, [path]);
  await saveNow(first.page);
  await expect
    .poll(() => (lstatSync(path, { throwIfNoEntry: false }) ? text(path) : ''))
    .toContain('INT. LIGHTHOUSE - NIGHT');
  const asked = dialogsAsked(profile);
  expect(asked).toHaveLength(1);
  expect(asked[0]).toMatchObject({ kind: 'save', extension: '.fountain' });
  expect(asked[0]?.defaultPath).toMatch(/Untitled Screenplay\.fountain$/);

  // Saved again: in place, with no dialog.
  await typeAtEnd(first.page, '\nThe lamp turns.\n');
  await saveNow(first.page);
  await expect.poll(() => text(path)).toContain('The lamp turns.');
  expect(dialogsAsked(profile)).toHaveLength(1);

  // The next dialog starts in the folder last used.
  answerDialogs(profile, [null]);
  await chooseInScripts(first.page, 'Open a file…');
  await expect.poll(() => dialogsAsked(profile).length).toBe(2);
  expect(dialogsAsked(profile)[1]).toEqual({ kind: 'open', defaultPath: scripts });
  await first.close();

  // After a restart the script still saves to its file, without asking (no permission prompt).
  const again = await desktop({ profile });
  await expect(editor(again.page)).toContainText('INT. LIGHTHOUSE - NIGHT');
  await typeAtEnd(again.page, '\nThe keeper wakes.\n');
  await saveNow(again.page);
  await expect.poll(() => text(path)).toContain('The keeper wakes.');
  expect(dialogsAsked(profile)).toHaveLength(2);
  await again.close();

  // Anyone else opening the file gets what was saved.
  await elsewhere(desktop, async (other) => {
    await openPath(other.page, other.profile, path);
    await expect(editor(other.page)).toContainText('INT. LIGHTHOUSE - NIGHT');
    await typeAtEnd(other.page, '');
    await expect(editor(other.page)).toContainText('The keeper wakes.');
  });
});

/** Runs `use` in the app started with a profile of its own (another person's, say), then removes it. */
async function elsewhere(
  desktop: (options?: { profile?: Profile }) => Promise<Launched>,
  use: (app: Launched) => Promise<void>,
) {
  const profile = await newProfile();
  try {
    const app = await desktop({ profile });
    try {
      await use(app);
    } finally {
      await app.close();
    }
  } finally {
    await rm(profile.dir, { recursive: true, force: true });
  }
}

test('opens a file of another type as a new script, and says why', async ({ desktop, profile }) => {
  const scripts = folder(profile);
  const letter = join(scripts, 'letter.rtf');
  writeFileSync(letter, 'INT. POST OFFICE - DAY\n\nA letter arrives.\n');
  const { page } = await desktop();
  await openPath(page, profile, letter);
  await expect(editor(page)).toContainText('A letter arrives.');
  await expect(page.locator('[role="alert"].failed')).toContainText(
    '“letter.rtf” opened as a new script',
  );
  // Save asks where to put it, and leaves the original alone.
  const saved = join(scripts, 'letter.fountain');
  answerDialogs(profile, [saved]);
  await saveNow(page);
  await expect
    .poll(() => (lstatSync(saved, { throwIfNoEntry: false }) ? text(saved) : ''))
    .toContain('A letter arrives.');
  expect(text(letter)).toBe('INT. POST OFFICE - DAY\n\nA letter arrives.\n');
  expect(dialogsAsked(profile).filter((asked) => asked.kind === 'save')).toHaveLength(1);
});

test('saves and reopens files with unusual names', async ({ desktop, profile }) => {
  const scripts = folder(profile, 'Scripts — été');
  const real = folder(profile, 'real folder');
  const linked = join(profile.home, 'linked folder');
  symlinkSync(real, linked);
  const paths = [
    join(scripts, 'My Script (2).fountain'),
    join(scripts, 'Café — draft.fountain'),
    join(scripts, '脚本.fountain'),
    join(scripts, '.hidden.fountain'),
    join(linked, 'Through a link.fountain'),
  ];

  const app = await desktop();
  for (const [index, path] of paths.entries()) {
    await chooseInScripts(app.page, 'New screenplay');
    await typeAtEnd(app.page, `\nLINE ${index} OF ${path.split('/').pop()}\n`);
    answerDialogs(profile, [path]);
    await saveNow(app.page);
    await expect
      .poll(() => (lstatSync(path, { throwIfNoEntry: false }) ? text(path) : ''))
      .toContain(`LINE ${index} OF`);
  }
  // The folder behind the link holds the file; the link is still a link.
  expect(text(join(real, 'Through a link.fountain'))).toContain('LINE 4 OF');
  expect(lstatSync(linked).isSymbolicLink()).toBe(true);

  // A script that is itself a link: saving writes through it, and the link stays.
  const target = join(real, 'Target.fountain');
  writeFileSync(target, 'Title: Linked\n\nINT. ROOM - DAY\n');
  const link = join(scripts, 'Link to target.fountain');
  symlinkSync(target, link);
  await openPath(app.page, profile, link);
  await expect(editor(app.page)).toContainText('INT. ROOM - DAY');
  await typeAtEnd(app.page, '\nThrough the link.\n');
  await saveNow(app.page);
  await expect.poll(() => text(target)).toContain('Through the link.');
  expect(lstatSync(link).isSymbolicLink()).toBe(true);
  await app.close();

  // Reopened elsewhere, each comes back with what was saved.
  await elsewhere(desktop, async (other) => {
    for (const [index, path] of paths.entries()) {
      await openPath(other.page, other.profile, path);
      await typeAtEnd(other.page, '');
      await expect(editor(other.page)).toContainText(`LINE ${index} OF`);
    }
    expect(other.errors).toEqual([]);
  });
});

test('keeps line breaks and the byte-order mark', async ({ desktop, profile }) => {
  const path = join(folder(profile), 'Windows.fountain');
  const original = '﻿Title: Windows\r\n\r\nINT. OFFICE - DAY\r\n\r\nA fan hums.\r\n';
  writeFileSync(path, original, 'utf8');
  const app = await desktop();
  await openPath(app.page, profile, path);
  await expect(editor(app.page)).toContainText('INT. OFFICE - DAY');
  await typeAtEnd(app.page, '\nThe fan stops.\n');
  await saveNow(app.page);
  await expect.poll(() => text(path)).toContain('The fan stops.');
  const bytes = readFileSync(path);
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const saved = bytes.toString('utf8');
  expect(saved.startsWith('﻿Title: Windows\r\n\r\nINT. OFFICE - DAY\r\n')).toBe(true);
  // Every line break is the file's own.
  expect(saved.replace(/\r\n/g, '')).not.toContain('\n');
});

test('notices the file changed by another program', async ({ desktop, profile }) => {
  const path = join(folder(profile), 'Shared.fountain');
  writeFileSync(path, 'Title: Shared\n\nINT. CAFE - DAY\n\nFirst version.\n');
  const app = await desktop();
  await openPath(app.page, profile, path);
  await expect(editor(app.page)).toContainText('First version.');

  // Another program writes the file in place (a sync from another computer).
  writeFileSync(path, 'Title: Shared\n\nINT. CAFE - DAY\n\nSecond version.\n');
  await expect(editor(app.page)).toContainText('Second version.');
  await expect(fileBar(app.page)).toContainText('Updated from Shared.fountain.');

  // Another replaces it by renaming a new file over it, as many editors save: still noticed.
  const temp = join(profile.home, 'Scripts', '.Shared.fountain.swp');
  writeFileSync(temp, 'Title: Shared\n\nINT. CAFE - DAY\n\nThird version.\n');
  renameSync(temp, path);
  await expect(editor(app.page)).toContainText('Third version.');
  writeFileSync(path, 'Title: Shared\n\nINT. CAFE - DAY\n\nFourth version.\n');
  await expect(editor(app.page)).toContainText('Fourth version.');
});

test('exports a PDF to a chosen path', async ({ desktop, profile }) => {
  const path = join(folder(profile, 'Exports'), 'The Call (final).pdf');
  const app = await desktop();
  answerDialogs(profile, [path]);
  await app.page.getByRole('button', { name: 'Export', exact: true }).click();
  await app.page
    .getByRole('group', { name: 'Export' })
    .getByRole('button', { name: 'PDF' })
    .click();
  await expect(
    app.page.locator('.toast [role="status"]').filter({ hasText: 'Exported' }),
  ).toHaveText('Exported The Call (final).pdf.');
  expect(readFileSync(path).subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect(dialogsAsked(profile)[0]).toMatchObject({ kind: 'save', extension: '.pdf' });
  expect(dialogsAsked(profile)[0]?.defaultPath).toMatch(/The Call\.pdf$/);
});

test('opens a dropped file', async ({ desktop, profile }) => {
  const path = join(folder(profile), 'Dropped Script.fountain');
  writeFileSync(path, 'Title: Dropped\n\nEXT. FIELD - DAY\n\nWind.\n');
  const app = await desktop();
  const { page } = app;
  // A file from disk, as the OS hands one to a drop: a file input gives the page a real one.
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'e2e-drop-source';
    input.hidden = true;
    document.body.append(input);
  });
  await page.setInputFiles('#e2e-drop-source', path);
  await page.evaluate(() => {
    const input = document.getElementById('e2e-drop-source') as HTMLInputElement;
    const file = input.files?.[0] as File;
    input.remove();
    const data = new DataTransfer();
    data.items.add(file);
    for (const type of ['dragenter', 'dragover', 'drop']) {
      document.body.dispatchEvent(
        new DragEvent(type, { dataTransfer: data, bubbles: true, cancelable: true }),
      );
    }
  });
  await expect(editor(page)).toContainText('EXT. FIELD - DAY');
  // It came with its path, so it saves in place, with no dialog.
  await typeAtEnd(page, '\nThe grass bends.\n');
  await saveNow(page);
  await expect.poll(() => text(path)).toContain('The grass bends.');
  expect(dialogsAsked(profile)).toEqual([]);
});

test('says so when the file can’t be written, and leaves it as it was', async ({
  desktop,
  profile,
}) => {
  test.skip(process.platform === 'win32' || process.getuid?.() === 0, 'POSIX permissions');
  const scripts = folder(profile, 'Locked');
  const path = join(scripts, 'Locked.fountain');
  writeFileSync(path, 'Title: Locked\n\nINT. VAULT - NIGHT\n');
  const app = await desktop();
  await openPath(app.page, profile, path);
  await expect(editor(app.page)).toContainText('INT. VAULT - NIGHT');
  const { chmodSync } = await import('node:fs');
  chmodSync(path, 0o444);
  try {
    await typeAtEnd(app.page, '\nNot saved.\n');
    await saveNow(app.page);
    await expect(
      app.page.getByRole('alert').filter({ hasText: 'Drafter isn’t allowed to write that file' }),
    ).toBeVisible();
    expect(text(path)).toBe('Title: Locked\n\nINT. VAULT - NIGHT\n');
  } finally {
    chmodSync(path, 0o644);
  }
  // Writable again, it saves.
  await saveNow(app.page);
  await expect.poll(() => text(path)).toContain('Not saved.');
});

test('refuses files the writer didn’t choose', async ({ desktop, profile }) => {
  const secret = join(profile.home, 'id_rsa');
  writeFileSync(secret, 'PRIVATE KEY');
  const bashrc = join(profile.home, '.bashrc');
  writeFileSync(bashrc, 'export PATH');
  const script = join(folder(profile), 'Chosen.fountain');
  writeFileSync(script, 'Title: Chosen\n');
  const { page } = await desktop();
  // What a page made to run someone else's code could ask the desktop app for.
  const asked = await page.evaluate(
    async ({ secret, bashrc, script }) => {
      const files = window.drafterDesktop?.files;
      const outcome = (work: Promise<unknown>) =>
        work.then(
          () => 'done',
          (error: Error) => error.message,
        );
      return {
        read: await outcome(files?.read(secret) as Promise<unknown>),
        write: await outcome(
          files?.write(bashrc, new TextEncoder().encode('rm -rf ~')) as Promise<unknown>,
        ),
        newFile: await outcome(
          files?.write(`${bashrc}.fountain`, new TextEncoder().encode('x')) as Promise<unknown>,
        ),
        realPath: await outcome(files?.realPath(secret) as Promise<unknown>),
        notChosenYet: await outcome(files?.read(script) as Promise<unknown>),
      };
    },
    { secret, bashrc, script },
  );
  expect(asked).toEqual({
    read: 'not-allowed: not chosen',
    write: 'not-allowed: not chosen',
    newFile: 'not-allowed: not chosen',
    realPath: 'not-allowed: not chosen',
    notChosenYet: 'not-allowed: not chosen',
  });
  expect(readFileSync(bashrc, 'utf8')).toBe('export PATH');
  expect(lstatSync(`${bashrc}.fountain`, { throwIfNoEntry: false })).toBeUndefined();
  // Chosen in the Open dialog, the same file may be read.
  await openPath(page, profile, script);
  await expect(editor(page)).toContainText('Title: Chosen');
  const read = await page.evaluate(
    async (path) =>
      new TextDecoder().decode((await window.drafterDesktop?.files.read(path))?.bytes),
    script,
  );
  expect(read).toBe('Title: Chosen\n');
});

test('refuses a chosen file swapped for a link to another', async ({ desktop, profile }) => {
  test.skip(process.platform === 'win32', 'symlinks');
  const scripts = folder(profile);
  const path = join(scripts, 'Swapped.fountain');
  writeFileSync(path, 'Title: Swapped\n\nINT. ROOM - DAY\n');
  const victim = join(folder(profile, 'Elsewhere'), 'victim.fountain');
  writeFileSync(victim, 'VICTIM');
  const app = await desktop();
  await openPath(app.page, profile, path);
  await expect(editor(app.page)).toContainText('INT. ROOM - DAY');
  unlinkSync(path);
  symlinkSync(victim, path);
  await typeAtEnd(app.page, '\nNot here.\n');
  await saveNow(app.page);
  await expect(
    app.page.getByRole('alert').filter({ hasText: 'Drafter isn’t allowed to write that file' }),
  ).toBeVisible();
  expect(readFileSync(victim, 'utf8')).toBe('VICTIM');
  // Saved somewhere the writer chooses, it is kept (and the window may close).
  answerDialogs(profile, [join(scripts, 'Kept.fountain')]);
  await chooseInScripts(app.page, 'Save As…');
  await expect
    .poll(() =>
      lstatSync(join(scripts, 'Kept.fountain'), { throwIfNoEntry: false })
        ? text(join(scripts, 'Kept.fountain'))
        : '',
    )
    .toContain('Not here.');
  expect(readFileSync(victim, 'utf8')).toBe('VICTIM');
});
