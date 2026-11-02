import { statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { refusalMessage } from '@drafter/archive';
import { afterEach, describe, expect, it } from 'vitest';
import { ABOUT, MAX_ANSWER_CHARS } from '../src/envelope';
import { __setBudgetForTests } from '../src/paging';
import { __setListReadLimitForTests } from '../src/tools/list';
import { type Connected, connect } from './connect';
import { EPISODE_101, EPISODE_102, EPISODE_103, EXPORT, makeLibrary } from './library';
import { put, tempFolder } from './temp';

interface Listed {
  path: string;
  format: string;
  kind: string | null;
  title: string | null;
  scenes: number | null;
  modified: string;
  bytes: number;
  drafts: number | null;
  cuts: number | null;
  content: string;
  matches_name: boolean | null;
  refused: string | null;
}
interface Listing {
  about: string;
  files: Listed[];
  manifest: {
    files: number;
    by_content: Record<string, number>;
    mismatched: number;
    refused: number;
  };
  truncated: boolean;
  next?: string;
  restarted?: boolean;
}

let open: Connected | undefined;
afterEach(async () => {
  __setBudgetForTests(undefined);
  await open?.close();
  open = undefined;
});

async function start(folders: string[]): Promise<Connected> {
  open = await connect({ folders });
  return open;
}

async function list(args: object): Promise<Listing> {
  const result = await (open as Connected).call('list_scripts', args);
  expect(result.isError).toBeFalsy();
  const text = (result.content[0] as { text: string }).text;
  expect(text.length).toBeLessThanOrEqual(MAX_ANSWER_CHARS);
  expect(JSON.parse(text)).toEqual(result.structuredContent);
  return result.structuredContent as unknown as Listing;
}

describe('list_scripts', () => {
  it('lists every script with its kind, title, scenes, drafts, and cuts', async () => {
    const dir = tempFolder();
    const { scripts, plays } = makeLibrary(dir);
    await start([scripts, plays]);
    const listing = await list({});
    expect(listing.about).toBe(ABOUT);
    expect(listing.truncated).toBe(false);
    expect(listing.next).toBeUndefined();
    const episode = join(scripts, 'Signal Hill', EPISODE_101);
    const info = statSync(episode);
    expect(listing.files).toEqual([
      expect.objectContaining({
        path: 'Scripts/Pitch.txt',
        format: 'text',
        kind: 'screenplay',
        title: 'Signal Hill: A Pitch',
        scenes: 1,
        drafts: null,
        cuts: null,
      }),
      expect.objectContaining({
        path: 'Scripts/Signal Hill/Series bible.md',
        format: 'markdown',
        kind: 'markdown',
        title: 'Signal Hill: the bible',
        scenes: 3,
        drafts: null,
        cuts: null,
      }),
      {
        path: `Scripts/Signal Hill/${EPISODE_101}`,
        format: 'fountain',
        kind: 'screenplay',
        title: 'Signal Hill',
        scenes: 13,
        modified: new Date(info.mtimeMs).toISOString(),
        bytes: info.size,
        drafts: 3,
        cuts: 3,
        content: 'fountain',
        matches_name: true,
        refused: null,
      },
      expect.objectContaining({ path: 'Scripts/Signal Hill/Signal Hill – 101.html' }),
      expect.objectContaining({
        path: `Scripts/Signal Hill/${EPISODE_102}`,
        title: 'Signal Hill Episode 102',
        scenes: 6,
      }),
      expect.objectContaining({
        path: `Scripts/Signal Hill/${EPISODE_103}`,
        title: 'Signal Hill Episode 103',
        scenes: 6,
      }),
      expect.objectContaining({
        path: 'Plays/The Long Watch.fountain',
        format: 'fountain',
        kind: 'stage play',
        title: 'The Long Watch',
        scenes: 3,
      }),
    ]);
  });

  it('a subfolder lists only what is under it', async () => {
    const { scripts, plays } = makeLibrary(tempFolder());
    await start([scripts, plays]);
    const listing = await list({ folder: 'Scripts/Signal Hill' });
    expect(listing.files.map((file) => file.path)).toEqual([
      'Scripts/Signal Hill/Series bible.md',
      `Scripts/Signal Hill/${EPISODE_101}`,
      'Scripts/Signal Hill/Signal Hill – 101.html',
      `Scripts/Signal Hill/${EPISODE_102}`,
      `Scripts/Signal Hill/${EPISODE_103}`,
    ]);
  });

  it('recursive false stays in the folder', async () => {
    const { scripts, plays } = makeLibrary(tempFolder());
    await start([scripts, plays]);
    expect((await list({ folder: 'Scripts', recursive: false })).files.map((f) => f.path)).toEqual([
      'Scripts/Pitch.txt',
    ]);
    expect((await list({ recursive: false })).files.map((f) => f.path)).toEqual([
      'Scripts/Pitch.txt',
      'Plays/The Long Watch.fountain',
    ]);
  });

  it('an export is listed with the script inside it, and no drafts or cuts', async () => {
    const { scripts, plays } = makeLibrary(tempFolder());
    await start([scripts, plays]);
    const listing = await list({ folder: 'Scripts/Signal Hill' });
    const exported = listing.files.find((file) => file.format === 'html');
    const info = statSync(join(scripts, 'Signal Hill', 'Signal Hill – 101.html'));
    expect(exported).toEqual({
      path: 'Scripts/Signal Hill/Signal Hill – 101.html',
      format: 'html',
      kind: 'screenplay',
      title: 'Read From The Export',
      scenes: 1,
      modified: new Date(info.mtimeMs).toISOString(),
      bytes: info.size,
      drafts: null,
      cuts: null,
      content: 'html export',
      matches_name: true,
      refused: null,
    });
  });

  it('a title page’s Contact never shows', async () => {
    const { scripts, plays } = makeLibrary(tempFolder());
    await start([scripts, plays]);
    const result = await (open as Connected).call('list_scripts', { folder: 'Scripts' });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('Signal Hill: A Pitch');
    expect(text).not.toContain('Hollow Creek');
    expect(text).not.toContain('555-0199');
  });

  it('a folder that isn’t there, or a file, is refused', async () => {
    const { scripts, plays } = makeLibrary(tempFolder());
    await start([scripts, plays]);
    for (const folder of ['Scripts/Nowhere', 'Scripts/Pitch.txt', 'Elsewhere', '../Scripts']) {
      const result = await (open as Connected).call('list_scripts', { folder });
      expect(result.isError).toBe(true);
      expect(JSON.parse((result.content[0] as { text: string }).text).about).toBe(ABOUT);
    }
  });

  it('500 files a call, then truncated', async () => {
    const dir = tempFolder();
    for (let i = 0; i < 503; i++)
      put(
        join(dir, 'Many', `Scene ${String(i).padStart(3, '0')}.fountain`),
        `INT. ROOM ${i} - DAY\n`,
      );
    await start([join(dir, 'Many')]);
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const listing = await list(cursor ? { cursor } : {});
      expect(listing.truncated).toBe(true);
      expect(listing.restarted).toBeUndefined();
      seen.push(...listing.files.map((file) => file.path));
      cursor = listing.next;
      pages++;
    } while (cursor && pages < 50);
    expect(pages).toBeGreaterThan(1);
    expect(seen).toHaveLength(500);
    expect(new Set(seen).size).toBe(500);
    expect(seen[0]).toBe('Many/Scene 000.fountain');
    expect(seen[499]).toBe('Many/Scene 499.fountain');
  });

  it('a cursor for a file that changed starts again', async () => {
    const dir = tempFolder();
    for (let i = 0; i < 30; i++)
      put(
        join(dir, 'Many', `Scene ${String(i).padStart(2, '0')}.fountain`),
        `INT. ROOM ${i} - DAY\n`,
      );
    await start([join(dir, 'Many')]);
    __setBudgetForTests(2_000);
    const first = await list({});
    expect(first.next).toBeDefined();
    expect(first.files.length).toBeLessThan(30);
    // Unchanged, the next page carries on where the first stopped.
    const second = await list({ cursor: first.next });
    expect(second.restarted).toBeUndefined();
    expect(second.files[0]?.path).toBe(
      `Many/Scene ${String(first.files.length).padStart(2, '0')}.fountain`,
    );

    // The writer saves a file: the same cursor starts again from the beginning.
    const changed = join(dir, 'Many', 'Scene 03.fountain');
    utimesSync(changed, new Date('2026-11-02T12:00:00Z'), new Date('2026-11-02T12:00:00Z'));
    const again = await list({ cursor: first.next });
    expect(again.restarted).toBe(true);
    expect(again.files[0]?.path).toBe('Many/Scene 00.fountain');

    // A cursor for other arguments, or a made-up one, starts again too.
    expect((await list({ cursor: first.next, recursive: false })).restarted).toBe(true);
    expect((await list({ cursor: 'made.up' })).restarted).toBe(true);
  });
});

describe('list_scripts never shows where the folders are on disk', () => {
  it('a ~1,000-character folder path is refused without the real path', async () => {
    const dir = tempFolder();
    const { scripts, plays } = makeLibrary(dir);
    await start([scripts, plays]);
    for (const folder of [
      `Scripts/${'a'.repeat(1_000)}`,
      `Scripts/${Array.from({ length: 4 }, () => 'b'.repeat(240)).join('/')}`,
    ]) {
      const result = await (open as Connected).call('list_scripts', { folder });
      expect(result.isError).toBe(true);
      const text = (result.content[0] as { text: string }).text;
      expect(text).not.toContain(dir);
      expect(text).not.toContain(tmpdir());
      expect(JSON.parse(text).error).not.toMatch(/\/(private|var|tmp|Users|home)\//);
    }
    for (const line of (open as Connected).logged) {
      expect(line).not.toContain(dir);
      expect(line).not.toContain(tmpdir());
    }
  });
});

describe('list_scripts says what is inside each file', () => {
  const PDF = '%PDF-1.7\nINT. HALL - DAY\n';

  it('the manifest says what is inside each file', async () => {
    const dir = tempFolder();
    const { scripts, plays } = makeLibrary(dir);
    const series = join(scripts, 'Signal Hill');
    put(join(series, 'Printed.fountain'), PDF);
    put(join(series, 'Exported.txt'), EXPORT);
    await start([scripts, plays]);
    const listing = await list({ folder: 'Scripts/Signal Hill' });
    const by = (name: string) =>
      listing.files.find((file) => file.path === `Scripts/Signal Hill/${name}`) as Listed;
    expect(by(EPISODE_101)).toMatchObject({
      content: 'fountain',
      matches_name: true,
      refused: null,
    });
    expect(by('Series bible.md')).toMatchObject({
      content: 'markdown',
      matches_name: true,
      refused: null,
    });
    expect(by('Signal Hill – 101.html')).toMatchObject({
      content: 'html export',
      matches_name: true,
      refused: null,
    });
    expect(by('Printed.fountain')).toEqual(
      expect.objectContaining({
        format: 'fountain',
        content: 'not a script',
        matches_name: false,
        refused: refusalMessage('Printed.fountain', {
          format: 'a PDF',
          advice: 'Open the script it was made from instead, or copy its text into a new script.',
        }),
        kind: null,
        title: null,
        scenes: null,
      }),
    );
    expect(by('Exported.txt')).toEqual(
      expect.objectContaining({
        format: 'text',
        content: 'html export',
        matches_name: false,
        refused: null,
        title: 'Read From The Export',
        scenes: 1,
      }),
    );
    expect(listing.manifest).toEqual({
      files: 7,
      by_content: { fountain: 3, markdown: 1, 'html export': 2, 'not a script': 1 },
      mismatched: 2,
      refused: 1,
    });
  });

  it('exports are read for title and scenes', async () => {
    const { scripts, plays } = makeLibrary(tempFolder());
    await start([scripts, plays]);
    const listing = await list({ folder: 'Scripts/Signal Hill' });
    const exported = listing.files.find((file) => file.format === 'html');
    expect(exported).toMatchObject({
      path: 'Scripts/Signal Hill/Signal Hill – 101.html',
      kind: 'screenplay',
      title: 'Read From The Export',
      scenes: 1,
      drafts: null,
      cuts: null,
    });
  });

  it('a refused file is listed with why, and the call still answers', async () => {
    const dir = tempFolder();
    put(join(dir, 'Lib', 'a.fountain'), 'INT. HALL - DAY\n');
    writeFileSync(join(dir, 'Lib', 'b.fountain'), Buffer.from([0x49, 0xc9, 0x0a]));
    put(join(dir, 'Lib', 'c.md'), '<!doctype html>\n<html><body>Hi</body></html>\n');
    await start([join(dir, 'Lib')]);
    const listing = await list({});
    expect(listing.files.map((f) => [f.path, f.content, f.refused])).toEqual([
      ['Lib/a.fountain', 'fountain', null],
      ['Lib/b.fountain', 'not a script', 'Can’t read that file: it isn’t UTF-8 text.'],
      [
        'Lib/c.md',
        'not a script',
        expect.stringMatching(/^Drafter can’t open a web page \(c\.md\)\. /),
      ],
    ]);
    expect(listing.manifest).toMatchObject({ files: 3, refused: 2, mismatched: 2 });
    expect(JSON.stringify(listing)).not.toContain(dir);
  });

  it('past the read budget a file is not read, and its content is unknown', async () => {
    const dir = tempFolder();
    put(join(dir, 'Lib', 'a.fountain'), 'INT. HALL - DAY\n');
    await start([join(dir, 'Lib')]);
    __setListReadLimitForTests(0);
    try {
      const listing = await list({});
      expect(listing.files[0]).toMatchObject({
        content: 'not read',
        matches_name: null,
        refused: null,
        title: null,
      });
      expect(listing.manifest).toEqual({
        files: 1,
        by_content: { 'not read': 1 },
        mismatched: 0,
        refused: 0,
      });
    } finally {
      __setListReadLimitForTests(undefined);
    }
  });

  it('the manifest pages with the list, every page under the cap', async () => {
    const dir = tempFolder();
    for (let i = 0; i < 40; i++)
      put(
        join(dir, 'Many', `Scene ${String(i).padStart(2, '0')}.fountain`),
        i % 3 ? `INT. ROOM ${i} - DAY\n` : PDF,
      );
    await start([join(dir, 'Many')]);
    __setBudgetForTests(3_000);
    let cursor: string | undefined;
    let total = 0;
    let refused = 0;
    do {
      const result = await (open as Connected).call('list_scripts', cursor ? { cursor } : {});
      const text = (result.content[0] as { text: string }).text;
      expect(text.length).toBeLessThanOrEqual(3_000);
      const page = result.structuredContent as unknown as Listing;
      expect(page.manifest.files).toBe(page.files.length);
      total += page.manifest.files;
      refused += page.manifest.refused;
      cursor = page.next;
    } while (cursor);
    expect(total).toBe(40);
    expect(refused).toBe(14);
  });
});
