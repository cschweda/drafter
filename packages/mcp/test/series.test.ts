import { chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { __setLimitsForTests, SERIES_MAX } from '../src/names';
import { answerOf, type Connected, connect, refusalOf } from './connect';
import { EPISODE_101, EPISODE_102, EPISODE_103, EXPORT, makeLibrary } from './library';
import { put, tempFolder } from './temp';

interface Series {
  scripts: Array<{ path: string; title: string; pages: number; minutes: number; leads: string[] }>;
  characters: Array<{
    name: string;
    age: string | null;
    appears: Array<{ script: number; scenes: number[] }>;
  }>;
  looks_like: Array<{ a: string; b: string; a_in: number[]; b_in: number[] }>;
  places: Array<{ name: string; appears: Array<{ script: number; scenes: number }> }>;
  skipped: Array<{ path: string; why: string }>;
}

const SERIES = 'Scripts/Signal Hill';

let open: Connected | undefined;
afterEach(async () => {
  __setLimitsForTests(undefined);
  await open?.close();
  open = undefined;
});

const series = async (args: object) =>
  answerOf<Series>(await (open as Connected).call('series_overview', args));

async function library(): Promise<void> {
  const { scripts } = makeLibrary(tempFolder());
  open = await connect({ folders: [scripts] });
}

describe('series_overview', () => {
  it('Signal Hill’s three episodes: June across all three, Dale looks like Dell', async () => {
    await library();
    const got = await series({ folder: SERIES });
    expect(got.scripts.map((s) => s.path)).toEqual([
      `${SERIES}/${EPISODE_101}`,
      `${SERIES}/${EPISODE_102}`,
      `${SERIES}/${EPISODE_103}`,
    ]);
    for (const script of got.scripts) {
      expect(script.pages).toBeGreaterThan(0);
      expect(script.minutes).toBeGreaterThan(0);
      expect(script.leads.length).toBeGreaterThan(0);
      expect(script.leads.length).toBeLessThanOrEqual(3);
    }
    expect(got.scripts[0]?.leads).toContain('JUNE');
    const june = got.characters.find((c) => c.name === 'JUNE');
    expect(june?.appears.map((a) => a.script)).toEqual([1, 2, 3]);
    expect(june?.appears[0]?.scenes[0]).toBe(1);
    expect(got.looks_like).toContainEqual({ a: 'DALE', b: 'DELL', a_in: [2], b_in: [3] });
    // Never merged: both are characters of their own.
    expect(got.characters.find((c) => c.name === 'DALE')?.appears).toEqual([
      { script: 2, scenes: [2, 5] },
    ]);
    expect(got.characters.find((c) => c.name === 'DELL')?.appears.map((a) => a.script)).toEqual([
      3,
    ]);
    // Places across the episodes.
    const kitchen = got.places.find((p) => p.name === "JUNE'S KITCHEN");
    expect(kitchen?.appears.map((a) => a.script)).toEqual([1, 2, 3]);
    // The bible and the export aren't episodes.
    expect(got.skipped).toEqual([
      { path: `${SERIES}/Series bible.md`, why: 'a document, not a script' },
      { path: `${SERIES}/Signal Hill – 101.html`, why: 'an export; name it in scripts to read it' },
    ]);
    expect(JSON.stringify(got)).not.toContain('Hollow Creek');
  });

  it('June’s ages 71 and 72 are both shown', async () => {
    await library();
    const got = await series({ folder: SERIES });
    expect(got.characters.find((c) => c.name === 'JUNE')?.age).toBe('71, 72');
    // One script alone: one age.
    const one = await series({ scripts: [`${SERIES}/${EPISODE_103}`] });
    expect(one.characters.find((c) => c.name === 'JUNE')?.age).toBe('72');
  });

  it('a folder of 31 scripts is refused', async () => {
    const dir = tempFolder();
    for (let i = 1; i <= SERIES_MAX + 1; i++)
      put(join(dir, 'Season', `Episode ${String(i).padStart(2, '0')}.fountain`));
    open = await connect({ folders: [join(dir, 'Season')] });
    const many = await (open as Connected).call('series_overview', { folder: 'Season' });
    expect(refusalOf(many).error).toBe(
      'That’s more than 30 scripts. Name them with scripts, in order.',
    );
    // Thirty is fine.
    const list = Array.from(
      { length: SERIES_MAX },
      (_, i) => `Season/Episode ${String(i + 1).padStart(2, '0')}.fountain`,
    );
    expect((await series({ scripts: list })).scripts).toHaveLength(SERIES_MAX);
  });

  it('scripts in the order given', async () => {
    await library();
    const got = await series({
      scripts: [`${SERIES}/${EPISODE_103}`, `${SERIES}/${EPISODE_101}`],
    });
    expect(got.scripts.map((s) => s.path)).toEqual([
      `${SERIES}/${EPISODE_103}`,
      `${SERIES}/${EPISODE_101}`,
    ]);
    expect(got.characters.find((c) => c.name === 'JUNE')?.age).toBe('72, 71');
  });

  it('a long cast stays under the cap, and past the bytes a call reads, scripts are skipped', async () => {
    const dir = tempFolder();
    // Thirty episodes of two hundred speakers each, every one named differently.
    for (let e = 1; e <= SERIES_MAX; e++) {
      const speakers = Array.from({ length: 200 }, (_, i) => `SPEAKER ${e}X${i}\nPresent.\n`).join(
        '\n',
      );
      put(
        join(dir, 'Crowd', `Ep ${String(e).padStart(2, '0')}.fountain`),
        `INT. SQUARE - DAY\n\n${speakers}`,
      );
    }
    open = await connect({ folders: [join(dir, 'Crowd')] });
    // answerOf checks the cap.
    const got = await series({ folder: 'Crowd' });
    expect(got.scripts).toHaveLength(SERIES_MAX);
    expect(got.characters.length).toBeLessThan(6_000);
    expect((got as unknown as { characters_more: number }).characters_more).toBe(
      6_000 - got.characters.length,
    );
    __setLimitsForTests({ seriesBytes: 10_000 });
    const some = await series({ folder: 'Crowd' });
    expect(some.scripts.length).toBeLessThan(SERIES_MAX);
    expect(some.skipped[0]?.why).toBe('past the 20 MB of scripts one call reads');
  });

  it('a script that can’t be read is skipped, and why never holds a full path', async () => {
    const dir = tempFolder();
    const folder = join(dir, 'Broken');
    put(join(folder, 'A good one.fountain'), 'INT. BARN - DAY\n\nHENRIK\nMorning.\n');
    // Larger than a script may be, UTF-16, and (where the system honours it) unreadable.
    put(join(folder, 'B too big.fountain'), 'x'.repeat(5 * 1024 * 1024 + 1));
    writeFileSync(
      join(folder, 'C wide.fountain'),
      Buffer.from('\ufeffINT. BARN - DAY\n', 'utf16le'),
    );
    const locked = put(join(folder, 'D locked.fountain'), 'INT. BARN - NIGHT\n');
    chmodSync(locked, 0o000);
    open = await connect({ folders: [folder] });
    const got = await series({ folder: 'Broken' });
    chmodSync(locked, 0o644);
    expect(got.scripts.map((s) => s.path)).toEqual(['Broken/A good one.fountain']);
    expect(got.skipped.map((s) => s.path)).toEqual(
      expect.arrayContaining(['Broken/B too big.fountain', 'Broken/C wide.fountain']),
    );
    // In the words every other tool uses for a file it won't read.
    expect(got.skipped.find((s) => s.path === 'Broken/B too big.fountain')?.why).toBe(
      'Can’t read that file: it is larger than 5 MB.',
    );
    expect(got.skipped.find((s) => s.path === 'Broken/C wide.fountain')?.why).toBe(
      'Can’t read that file: it isn’t UTF-8 text.',
    );
    for (const skipped of got.skipped) {
      expect(skipped.why).not.toContain(dir);
      expect(skipped.why).not.toMatch(/(^|\s)\/[^\s]/);
    }
  });

  it('a folder and a list together, or neither, are refused', async () => {
    await library();
    const both = await (open as Connected).call('series_overview', {
      folder: SERIES,
      scripts: [`${SERIES}/${EPISODE_101}`],
    });
    expect(refusalOf(both).error).toBe('Give a folder or a list of scripts, not both.');
    const neither = await (open as Connected).call('series_overview', {});
    expect(refusalOf(neither).error).toBe('Give a folder or a list of scripts.');
  });
});

describe('series_overview and what is inside a file', () => {
  it('an export named .fountain in a folder is skipped as an export', async () => {
    const { scripts } = makeLibrary(tempFolder());
    put(join(scripts, 'Signal Hill', 'Signal Hill – 104.fountain'), EXPORT);
    open = await connect({ folders: [scripts] });
    const got = await series({ folder: SERIES });
    expect(got.scripts).toHaveLength(3);
    expect(got.skipped).toContainEqual({
      path: `${SERIES}/Signal Hill – 104.fountain`,
      why: 'an export; name it in scripts to read it',
    });
  });
});
