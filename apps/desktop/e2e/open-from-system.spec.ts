import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { editor, expect, launchAgain, type Profile, stored, test } from './helpers';

// Opening files from the system (Plan 6 Task 3): named on the command line, or in a second launch
// (which hands them to the first instance and quits). One window, brought forward; a file that is
// already open is shown, not opened twice.

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

const DOOR = 'Title: The Open Door\n\nINT. HALL - DAY\n\nA door opens.\n';
const LAMP = 'Title: The Lamp\n\nEXT. LIGHTHOUSE - NIGHT\n\nThe lamp turns.\n';

/** A file of the test's own, in its own folder. */
function script(profile: Profile, name: string, text: string, folder = 'Scripts'): string {
  const dir = join(profile.home, folder);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, text);
  return path;
}

/** The scripts that are the writer's own (the app also keeps its samples). */
async function mine(page: Page) {
  return (await stored(page)).filter((row) => !('sample' in row && row.sample));
}

const statusAlert = (page: Page) => page.locator('[role="alert"].failed');

test('opens a file named on the command line', async ({ desktop, profile }) => {
  const path = script(profile, 'The Open Door.fountain', DOOR);
  const { page } = await desktop({ args: [path] });
  await expect(editor(page)).toContainText('A door opens.');
  await expect
    .poll(async () => (await mine(page)).map((row) => row.title))
    .toContain('The Open Door');
});

test('opens a file from a second launch in the first window', async ({ desktop, profile }) => {
  const path = script(profile, 'The Lamp.fountain', LAMP);
  const { app, page } = await desktop();
  await expect(editor(page)).not.toContainText('The lamp turns.');

  expect(await launchAgain(profile, [path])).toBe(0);
  await expect(editor(page)).toContainText('The lamp turns.');
  // The one window, still: the second launch opened nothing of its own.
  expect(app.windows()).toHaveLength(1);
  // A file the second launch names later is opened too, in the same way.
  const door = script(profile, 'The Open Door.fountain', DOOR);
  expect(await launchAgain(profile, [door])).toBe(0);
  await expect(editor(page)).toContainText('A door opens.');
  expect(app.windows()).toHaveLength(1);
});

test('opens a file that is already open in the same window, once', async ({ desktop, profile }) => {
  const path = script(profile, 'The Lamp.fountain', LAMP);
  const link = join(profile.home, 'Lamp link.fountain');
  symlinkSync(path, link);
  const { app, page } = await desktop({ args: [path] });
  await expect(editor(page)).toContainText('The lamp turns.');
  const count = (await mine(page)).length;

  // Another script is on show; the file is named again, by its own name and by a link to it.
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page
    .getByRole('group', { name: 'Scripts' })
    .getByRole('button', { name: 'New screenplay' })
    .click();
  await expect(editor(page)).not.toContainText('The lamp turns.');
  const withNew = (await mine(page)).length;
  expect(withNew).toBe(count + 1);

  expect(await launchAgain(profile, [path])).toBe(0);
  await expect(editor(page)).toContainText('The lamp turns.');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page
    .getByRole('group', { name: 'Scripts' })
    .getByRole('button', { name: 'New screenplay' })
    .click();
  await expect(editor(page)).not.toContainText('The lamp turns.');
  const afterSecondNew = (await mine(page)).length;

  expect(await launchAgain(profile, [link])).toBe(0);
  await expect(editor(page)).toContainText('The lamp turns.');
  expect((await mine(page)).length).toBe(afterSecondNew);
  expect((await mine(page)).filter((row) => row.title === 'The Lamp')).toHaveLength(1);
  expect(app.windows()).toHaveLength(1);
});

test('keeps the script on show when another file is opened over it', async ({
  desktop,
  profile,
}) => {
  const path = script(profile, 'The Lamp.fountain', LAMP);
  const { page } = await desktop();
  await editor(page).click();
  await page.keyboard.press(`${MOD}+End`);
  await page.keyboard.type('\nA draft nobody saved.\n');

  expect(await launchAgain(profile, [path])).toBe(0);
  await expect(editor(page)).toContainText('The lamp turns.');
  // The unsaved draft is still kept, as it is when Open is chosen from the menu.
  await expect
    .poll(async () =>
      (await stored(page)).some((row) => row.source.includes('A draft nobody saved.')),
    )
    .toBe(true);
});

test('says why a file it can’t open was not opened', async ({ desktop, profile }) => {
  const picture = script(profile, 'poster.png', 'not a script');
  const missing = join(profile.home, 'Scripts', 'Gone.fountain');
  const { page } = await desktop();

  expect(await launchAgain(profile, [picture])).toBe(0);
  await expect(statusAlert(page)).toContainText('Drafter can’t open “poster.png”');
  await expect(statusAlert(page)).toContainText('isn’t a script');

  expect(await launchAgain(profile, [missing])).toBe(0);
  await expect(statusAlert(page)).toContainText('Drafter can’t open “Gone.fountain”');
  await expect(statusAlert(page)).toContainText('isn’t there');
  // Nothing was opened in their place.
  expect((await mine(page)).map((row) => row.title)).not.toContain('Gone');
});

test('ignores the options it was started with, and opens the file among them', async ({
  desktop,
  profile,
}) => {
  const path = script(profile, 'The Open Door.fountain', DOOR);
  const { page } = await desktop({ args: ['--disable-gpu', '--lang=en-US', path] });
  await expect(editor(page)).toContainText('A door opens.');
  await expect(statusAlert(page)).toHaveCount(0);
});

test('only a file named by the system can be read, not one the page names', async ({
  desktop,
  profile,
}) => {
  const named = script(profile, 'Named.fountain', LAMP);
  const other = script(profile, 'Other.fountain', DOOR);
  const { page } = await desktop({ args: [named] });
  await expect(editor(page)).toContainText('The lamp turns.');
  const result = await page.evaluate(
    async ([a, b]) => {
      const files = window.drafterDesktop?.files;
      const read = async (path: string) => {
        try {
          return (await files?.read(path ?? ''))?.bytes.length ?? -1;
        } catch (error) {
          return (error as Error).message;
        }
      };
      return { named: await read(a ?? ''), other: await read(b ?? '') };
    },
    [named, other],
  );
  expect(result.named).toBeGreaterThan(0);
  expect(result.other).toMatch(/not-allowed/);
});

test('has a bridge call for it', async ({ desktop }) => {
  const { page } = await desktop();
  expect(await page.evaluate(() => typeof window.drafterDesktop?.onOpenFile)).toBe('function');
});
