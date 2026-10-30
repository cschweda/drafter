import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { makeZip } from '../../../packages/archive/test/make-zip';
import { answerDialogs, dialogsAsked, editor, expect, type Profile, stored, test } from './helpers';

// Highland and Fade In files in the desktop app (Imports and Markdown out): one named on the
// command line or dropped is imported as a new script that is not the file's, and the file is
// never written (Save asks for a .fountain). The archives are made by makeZip, with the tests' own
// text.

const FERRY = 'Title: The Night Ferry\n\nINT. FERRY CABIN - NIGHT\n\nThe engine knocks twice.\n';
const HIGHLAND = makeZip([
  { name: 'text.fountain', data: FERRY },
  { name: 'info.json', data: '{"type":"tests"}' },
]);
const FADE_IN = makeZip([
  {
    name: 'document.xml',
    data: `<?xml version="1.0" encoding="UTF-8"?>
<document type="Open Screenplay Format document" version="40">
  <paragraphs>
    <para><style basestyle="Scene Heading"/><text>INT. FERRY CABIN - NIGHT</text></para>
    <para><style basestyle="Cast List"/><text>ABEL, a deckhand</text></para>
  </paragraphs>
</document>
`,
  },
]);

function folder(profile: Profile): string {
  const path = join(profile.home, 'Scripts');
  mkdirSync(path, { recursive: true });
  return path;
}

const toast = (page: Page) => page.locator('.toast [role="status"]');

test('imports a Highland file named on the command line as a new script, and never writes it', async ({
  desktop,
  profile,
}) => {
  const scripts = folder(profile);
  const file = join(scripts, 'Ferry.highland');
  writeFileSync(file, HIGHLAND);
  const { page } = await desktop({ args: [file] });
  await expect(editor(page)).toContainText('INT. FERRY CABIN - NIGHT');
  await expect(toast(page)).toHaveText('Imported “Ferry.highland”.');
  // No "opened as a new script" notice: the import has said what happened.
  await expect(page.locator('[role="alert"].failed')).toHaveCount(0);
  await expect
    .poll(async () => (await stored(page)).map((row) => row.title))
    .toContain('The Night Ferry');

  // Save asks for a .fountain named after the title, and the .highland is left as it was.
  const saved = join(scripts, 'The Night Ferry.fountain');
  answerDialogs(profile, [saved]);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => existsSync(saved)).toBe(true);
  expect(readFileSync(saved, 'utf8')).toBe(FERRY);
  const asked = dialogsAsked(profile);
  expect(asked).toHaveLength(1);
  expect(asked[0]).toMatchObject({ kind: 'save', extension: '.fountain' });
  expect(asked[0]?.defaultPath).toMatch(/The Night Ferry\.fountain$/);
  expect(new Uint8Array(readFileSync(file))).toEqual(HIGHLAND);
});

test('imports a dropped Fade In file', async ({ desktop, profile }) => {
  const file = join(folder(profile), 'Cabin.fadein');
  writeFileSync(file, FADE_IN);
  const { page } = await desktop();
  await expect(editor(page)).toContainText('The Call');
  // A file from disk, as the OS hands one to a drop: a file input gives the page a real one.
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'e2e-drop-source';
    input.hidden = true;
    document.body.append(input);
  });
  await page.setInputFiles('#e2e-drop-source', file);
  await page.evaluate(() => {
    const input = document.getElementById('e2e-drop-source') as HTMLInputElement;
    const dropped = input.files?.[0] as File;
    input.remove();
    const data = new DataTransfer();
    data.items.add(dropped);
    for (const type of ['dragenter', 'dragover', 'drop']) {
      document.body.dispatchEvent(
        new DragEvent(type, { dataTransfer: data, bubbles: true, cancelable: true }),
      );
    }
  });
  await expect(editor(page)).toContainText('INT. FERRY CABIN - NIGHT');
  await expect(editor(page)).toContainText('ABEL, a deckhand [[osf: Cast List]]');
  await expect(toast(page)).toHaveText(
    'Imported “Cabin.fadein”. 1 item came in as a note; Problems lists it.',
  );
  await expect(page.locator('[role="alert"].failed')).toHaveCount(0);
  await expect.poll(async () => (await stored(page)).map((row) => row.title)).toContain('Cabin');
  // Not the file's script: it has no file of its own until it is saved.
  const row = (await stored(page)).find((r) => r.title === 'Cabin') as { fileName?: string };
  expect(row.fileName).toBeUndefined();
  expect(new Uint8Array(readFileSync(file))).toEqual(FADE_IN);
});
