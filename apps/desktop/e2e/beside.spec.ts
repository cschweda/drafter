import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import {
  type CutEntry,
  cutsFile,
  draftFile,
  draftFileName,
  readCutsFile,
  readDraftFile,
} from '../../../packages/history/src/index';
import { editor, editorDocument, expect, type Profile, test } from './helpers';

// Drafts and cuts beside the script (Drafts and Cuts Task 6): the page's bridge calls
// (`writeBeside`, `readBeside`, `listBeside`) through the preload to the main process, on real
// files next to a script the writer opened. The app's own use of them (when a draft is frozen or a
// cut recorded, and merging on open) comes with Task 7; these check what the desktop gives it:
// files in the right place, never over a draft file, never through a link.

const posix = process.platform !== 'win32';
const BOCA = 'Title: Boca\n\nINT. HALL - DAY\n\nMara waits by the door.\n';
const DRAFTS = 'Boca drafts';
const DRAFT_01 = `${DRAFTS}/${draftFileName('Boca', 1, 'fountain')}`;
const CUTS = 'Boca.fountain.cuts.md';

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

/** `Boca.fountain` in a Scripts folder of the profile's home. */
function boca(profile: Profile): { folder: string; script: string } {
  const folder = join(profile.home, 'Scripts');
  mkdirSync(folder, { recursive: true });
  const script = join(folder, 'Boca.fountain');
  writeFileSync(script, BOCA);
  return { folder, script };
}

/** The app with `script` opened from the command line (so it is granted). */
async function opened(desktop: (o: { args: string[] }) => Promise<{ page: Page }>, script: string) {
  const { page } = await desktop({ args: [script] });
  await expect(editor(page)).toContainText('Mara waits by the door.');
  return page;
}

/** `writeBeside`, from the page: what it resolved with, or the error's message. */
function writeBeside(page: Page, script: string, rel: string, text: string, mode: string) {
  return page.evaluate(
    async ([script, rel, text, mode]) => {
      try {
        return await window.drafterDesktop?.files.writeBeside(
          script as string,
          rel as string,
          new TextEncoder().encode(text as string),
          mode as 'create' | 'replace',
        );
      } catch (error) {
        return `error: ${(error as Error).message}`;
      }
    },
    [script, rel, text, mode],
  );
}

function readBeside(page: Page, script: string, rel: string) {
  return page.evaluate(
    async ([script, rel]) => {
      try {
        const bytes = await window.drafterDesktop?.files.readBeside(
          script as string,
          rel as string,
        );
        return bytes ? new TextDecoder().decode(bytes) : null;
      } catch (error) {
        return `error: ${(error as Error).message}`;
      }
    },
    [script, rel],
  );
}

function listBeside(page: Page, script: string, folder: string) {
  return page.evaluate(
    async ([script, folder]) => {
      try {
        return await window.drafterDesktop?.files.listBeside(script as string, folder as string);
      } catch (error) {
        return `error: ${(error as Error).message}`;
      }
    },
    [script, folder],
  );
}

test('a draft of the open script is written as "Boca drafts/Boca – Draft 01.fountain" beside it, and the file verifies', async ({
  desktop,
  profile,
}) => {
  const { folder, script } = boca(profile);
  const page = await opened(desktop, script);
  const text = await editorDocument(page);
  const facts = { draft: 1, id: sha256(text), frozen: new Date().toISOString(), note: 'first' };
  const file = draftFile(text, facts, 'fountain');

  expect(await writeBeside(page, script, DRAFT_01, file, 'create')).toBe('written');

  const path = join(folder, DRAFT_01);
  expect(lstatSync(join(folder, DRAFTS)).isDirectory()).toBe(true);
  const read = readDraftFile(readFileSync(path, 'utf8'), 'fountain');
  expect(read.facts).toEqual(facts);
  expect(sha256(read.text)).toBe(facts.id);
  // Read back through the page, and listed.
  expect(await readBeside(page, script, DRAFT_01)).toBe(file);
  expect(await listBeside(page, script, DRAFTS)).toEqual(['Boca – Draft 01.fountain']);
  // Nothing left over: no temp file in either folder.
  expect(readdirSync(folder).sort()).toEqual(['Boca drafts', 'Boca.fountain']);
  expect(readdirSync(join(folder, DRAFTS))).toEqual(['Boca – Draft 01.fountain']);
});

test('a cut writes Boca.fountain.cuts.md beside the script, replaced whole each time', async ({
  desktop,
  profile,
}) => {
  const { folder, script } = boca(profile);
  const page = await opened(desktop, script);
  const cut = (text: string, at: string): CutEntry => ({
    id: sha256(text),
    title: text.split('\n')[0] as string,
    text,
    kind: 'fountain',
    cuts: [{ at, draft: 1 }],
    where: { after: 'INT. HALL - DAY', before: null },
  });
  const first = cut('EXT. PORCH - NIGHT\n\nRain on the steps.', '2026-11-01T10:00:00.000Z');
  const second = cut('INT. ATTIC - DAY\n\nDust in the light.', '2026-11-01T11:00:00.000Z');

  expect(await writeBeside(page, script, CUTS, cutsFile('Boca.fountain', [first]), 'replace')).toBe(
    'written',
  );
  expect(readCutsFile(readFileSync(join(folder, CUTS), 'utf8')).entries).toEqual([first]);

  const both = cutsFile('Boca.fountain', [first, second]);
  expect(await writeBeside(page, script, CUTS, both, 'replace')).toBe('written');
  expect(readFileSync(join(folder, CUTS), 'utf8')).toBe(both);
  expect(readCutsFile(both).entries.map((e) => e.id)).toEqual([second.id, first.id]);
  expect(await readBeside(page, script, CUTS)).toBe(both);
  expect(readdirSync(folder).sort()).toEqual(['Boca.fountain', CUTS]);
});

test('a pre-existing draft file is never overwritten', async ({ desktop, profile }) => {
  const { folder, script } = boca(profile);
  mkdirSync(join(folder, DRAFTS));
  // Another computer's Draft 01, synced in before this one froze its own.
  writeFileSync(join(folder, DRAFT_01), 'Draft 01 from another computer\n');
  const page = await opened(desktop, script);

  expect(await writeBeside(page, script, DRAFT_01, 'Draft 01 from here\n', 'create')).toBe(
    'exists',
  );
  expect(await writeBeside(page, script, DRAFT_01, 'Draft 01 from here\n', 'replace')).toMatch(
    /^error: not-allowed/,
  );
  expect(readFileSync(join(folder, DRAFT_01), 'utf8')).toBe('Draft 01 from another computer\n');
  // The second name is free, and is written.
  const second = `${DRAFTS}/Boca – Draft 01 (2).fountain`;
  expect(await writeBeside(page, script, second, 'Draft 01 from here\n', 'create')).toBe('written');
  expect(readdirSync(join(folder, DRAFTS)).sort()).toEqual([
    'Boca – Draft 01 (2).fountain',
    'Boca – Draft 01.fountain',
  ]);
});

test('a symlinked drafts folder is refused, and nothing is written through it', async ({
  desktop,
  profile,
}) => {
  test.skip(!posix, 'a symbolic link needs privileges on Windows');
  const { folder, script } = boca(profile);
  const outside = join(profile.home, 'Outside');
  mkdirSync(outside);
  symlinkSync(outside, join(folder, DRAFTS));
  const page = await opened(desktop, script);

  expect(await writeBeside(page, script, DRAFT_01, 'x', 'create')).toMatch(/^error: not-allowed/);
  expect(await readBeside(page, script, DRAFT_01)).toMatch(/^error: not-allowed/);
  expect(await listBeside(page, script, DRAFTS)).toMatch(/^error: not-allowed/);
  expect(readdirSync(outside)).toEqual([]);
  // A link where the cuts file would be is refused too, and its target left alone.
  const victim = join(profile.home, 'victim.txt');
  writeFileSync(victim, 'keep');
  symlinkSync(victim, join(folder, CUTS));
  expect(await writeBeside(page, script, CUTS, 'x', 'replace')).toMatch(/^error: not-allowed/);
  expect(readFileSync(victim, 'utf8')).toBe('keep');
});

test('nothing is written beside a script the writer never opened, or under another name', async ({
  desktop,
  profile,
}) => {
  const { folder, script } = boca(profile);
  const other = join(folder, 'Other.fountain');
  writeFileSync(other, 'INT. ELSEWHERE - DAY\n');
  const page = await opened(desktop, script);

  expect(await writeBeside(page, other, CUTS, 'x', 'replace')).toMatch(/^error: not-allowed/);
  for (const rel of [
    '../escape.cuts.md',
    'Boca drafts/../x.fountain',
    'Other.fountain',
    'a/b/c.md',
  ]) {
    expect(await writeBeside(page, script, rel, 'x', 'replace'), rel).toMatch(
      /^error: not-allowed/,
    );
  }
  expect(readdirSync(folder).sort()).toEqual(['Boca.fountain', 'Other.fountain']);
  expect(readFileSync(other, 'utf8')).toBe('INT. ELSEWHERE - DAY\n');
  expect(existsSync(join(profile.home, 'escape.cuts.md'))).toBe(false);
});
