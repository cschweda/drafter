import { statSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ABOUT, MAX_ANSWER_CHARS } from '../src/envelope';
import { __setBudgetForTests } from '../src/paging';
import { type Connected, connect } from './connect';
import { EPISODE_101, makeLibrary } from './library';
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
}
interface Listing {
  about: string;
  files: Listed[];
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
        drafts: 2,
        cuts: 2,
      },
      expect.objectContaining({ path: 'Scripts/Signal Hill/Signal Hill – 101.html' }),
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

  it('an export is listed but not read', async () => {
    const { scripts, plays } = makeLibrary(tempFolder());
    await start([scripts, plays]);
    const listing = await list({ folder: 'Scripts/Signal Hill' });
    const exported = listing.files.find((file) => file.format === 'html');
    const info = statSync(join(scripts, 'Signal Hill', 'Signal Hill – 101.html'));
    expect(exported).toEqual({
      path: 'Scripts/Signal Hill/Signal Hill – 101.html',
      format: 'html',
      kind: null,
      title: null,
      scenes: null,
      modified: new Date(info.mtimeMs).toISOString(),
      bytes: info.size,
      drafts: null,
      cuts: null,
    });
    expect(JSON.stringify(listing)).not.toContain('Read From The Export');
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
