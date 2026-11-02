import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildScript } from '../../../fixtures/generators/script';
import { __setLimitsForTests, SEARCH_LIMITS } from '../src/names';
import { answerOf, type Connected, connect, refusalOf } from './connect';
import { EPISODE_102, makeLibrary } from './library';
import { put, tempFolder } from './temp';

interface Hit {
  path: string;
  scene: number | null;
  heading: string | null;
  element: 'dialogue' | 'parenthetical' | 'action' | 'heading' | 'synopsis' | 'other';
  who: string | null;
  around: string;
}
interface Search {
  hits: Hit[];
  files_searched: number;
  stopped: 'hits' | 'files' | 'bytes' | null;
  left_out: { notes: number; boneyard: number };
  next?: string;
  restarted?: true;
}

let open: Connected | undefined;
afterEach(async () => {
  __setLimitsForTests(undefined);
  await open?.close();
  open = undefined;
});

const search = async (args: object) =>
  answerOf<Search>(await (open as Connected).call('search_scripts', args));

/** An original lighthouse scene with a contact, a note, a boneyard, and Drafter's metadata. */
const LAMP = `Title: Lamp Test
Author: A. Writer
Contact: Gannet Lane, 555-0101

INT. LIGHTHOUSE GALLERY - NIGHT

= Margit waits for the supply boat.

Margit trims the wick. The lamp hisses. A sign by the door reads: use .* to match.

[[A seagull should be here somewhere.]]

MARGIT
(to the lamp)
The supply boat is late. Again.

TOMAS
The boat is never late. The lamp is early.

/* An older beat: a seagull lands on the rail. */

EXT. ROCKS - DAWN

Tomas counts the boats. None.

/* drafter
{"v":1,"template":"us-screenplay","titleTemplate":"cormorant"}
*/
`;

async function lamp(): Promise<string> {
  const dir = tempFolder();
  put(join(dir, 'Lamp', 'Lamp.fountain'), LAMP);
  open = await connect({ folders: [join(dir, 'Lamp')] });
  return 'Lamp/Lamp.fountain';
}

describe('search_scripts', () => {
  it('finds every word, not a pattern', async () => {
    const script = await lamp();
    const literal = await search({ script, words: '.*' });
    expect(literal.hits).toHaveLength(1);
    expect(literal.hits[0]).toMatchObject({
      path: script,
      scene: 1,
      heading: 'INT. LIGHTHOUSE GALLERY - NIGHT',
      element: 'action',
      who: null,
    });
    expect(literal.hits[0]?.around).toContain('use .* to match');
    // Every word must be in the element, in any case and any order.
    const both = await search({ script, words: 'LATE boat' });
    expect(both.hits.map((h) => h.element)).toEqual(['dialogue', 'dialogue']);
    expect(both.hits.map((h) => h.who)).toEqual(['MARGIT', 'TOMAS']);
    expect((await search({ script, words: 'boat wick' })).hits).toEqual([]);
    // A pattern's characters are only characters.
    expect((await search({ script, words: 'l.mp' })).hits).toEqual([]);
    expect((await search({ script, words: '(a+)+$' })).hits).toEqual([]);
  });

  it('in dialogue only, by character', async () => {
    const script = await lamp();
    const all = await search({ script, words: 'lamp' });
    expect(all.hits.map((h) => h.element)).toEqual(['action', 'parenthetical', 'dialogue']);
    const spoken = await search({ script, words: 'lamp', in: 'dialogue' });
    expect(spoken.hits.map((h) => [h.element, h.who])).toEqual([
      ['parenthetical', 'MARGIT'],
      ['dialogue', 'TOMAS'],
    ]);
    const tomas = await search({ script, words: 'lamp', character: 'tomas (v.o.)' });
    expect(tomas.hits.map((h) => [h.element, h.who])).toEqual([['dialogue', 'TOMAS']]);
    const headings = await search({ script, words: 'rocks', in: 'headings' });
    expect(headings.hits).toEqual([
      {
        path: script,
        scene: 2,
        heading: 'EXT. ROCKS - DAWN',
        element: 'heading',
        who: null,
        around: 'EXT. ROCKS - DAWN',
      },
    ]);
    const action = await search({ script, words: 'boats', in: 'action' });
    expect(action.hits.map((h) => h.element)).toEqual(['action']);
    const synopsis = await search({ script, words: 'supply', in: 'everything' });
    expect(synopsis.hits.map((h) => h.element)).toEqual(['synopsis', 'dialogue']);
  });

  it('notes are searched only when included', async () => {
    const script = await lamp();
    const plain = await search({ script, words: 'seagull' });
    expect(plain.hits).toEqual([]);
    expect(plain.left_out).toEqual({ notes: 1, boneyard: 1 });
    const notes = await search({ script, words: 'seagull', include: ['notes'] });
    expect(notes.hits).toHaveLength(1);
    expect(notes.hits[0]?.around).toContain('A seagull should be here');
    expect(notes.left_out).toEqual({ notes: 0, boneyard: 1 });
    const both = await search({ script, words: 'seagull', include: ['notes', 'boneyard'] });
    expect(both.hits).toHaveLength(2);
    expect(both.hits[1]?.around).toContain('lands on the rail');
  });

  it('Contact and the metadata are never hits', async () => {
    const script = await lamp();
    for (const words of [
      'Gannet',
      '555-0101',
      'cormorant',
      'titleTemplate',
      'Lamp Test',
      'drafter',
    ])
      expect((await search({ script, words, include: ['notes', 'boneyard'] })).hits).toEqual([]);
    // Episode 102's Contact, in a library search.
    const { scripts } = makeLibrary(tempFolder());
    await open?.close();
    open = await connect({ folders: [scripts] });
    const grange = await search({ words: 'Hollow Creek', folder: 'Scripts/Signal Hill' });
    expect(grange.hits).toEqual([]);
    const ep102 = await search({ script: `Scripts/Signal Hill/${EPISODE_102}`, words: 'dawn' });
    expect(ep102.hits.length).toBeGreaterThan(0);
  });

  it('50 a page, 500 in all', async () => {
    const dir = tempFolder();
    const text = buildScript(1);
    // 300 scenes of the generator's kitchen.
    const scenes = Array.from({ length: 300 }, () => text).join('\n');
    put(join(dir, 'Long', 'Long.fountain'), scenes);
    open = await connect({ folders: [join(dir, 'Long')] });
    const all: Hit[] = [];
    let page = await search({ script: 'Long/Long.fountain', words: 'the' });
    let pages = 1;
    for (;;) {
      expect(page.hits.length).toBeLessThanOrEqual(SEARCH_LIMITS.perPage);
      all.push(...page.hits);
      if (!page.next) break;
      expect(page.stopped).toBeNull();
      page = await search({ script: 'Long/Long.fountain', words: 'the', cursor: page.next });
      pages++;
    }
    expect(all).toHaveLength(SEARCH_LIMITS.total);
    expect(pages).toBe(10);
    expect(page.stopped).toBe('hits');
    // In order, from the first scene.
    expect(all[0]?.scene).toBe(1);
    for (let i = 1; i < all.length; i++)
      expect((all[i] as Hit).scene as number).toBeGreaterThanOrEqual(
        (all[i - 1] as Hit).scene as number,
      );
  });

  it('200 files or 100 MB, then it says it stopped', async () => {
    const dir = tempFolder();
    for (let i = 0; i < 2_000; i++)
      put(
        join(dir, 'Many', `${String(i).padStart(4, '0')}.fountain`),
        'INT. ROOM - DAY\n\nNothing here.\n',
      );
    open = await connect({ folders: [join(dir, 'Many')] });
    const files = await search({ words: 'nowhere' });
    expect(files.hits).toEqual([]);
    expect(files.files_searched).toBe(SEARCH_LIMITS.files);
    expect(files.stopped).toBe('files');
    expect(files.next).toBeUndefined();

    // A smaller byte budget, so the test needn't write 100 MB.
    __setLimitsForTests({ searchBytes: 100 });
    const bytes = await search({ words: 'nowhere', folder: 'Many' });
    expect(bytes.stopped).toBe('bytes');
    expect(bytes.files_searched).toBe(3);
  });

  it('the around text is 200 characters at most', async () => {
    const dir = tempFolder();
    const before = 'Fog over the water, '.repeat(40);
    const fish = '🐟'.repeat(150);
    put(
      join(dir, 'Fog', 'Fog.fountain'),
      `INT. BOATHOUSE - NIGHT\n\n${before}the foghorn sounds once.${' And the fog stays.'.repeat(40)}\n\nEXT. PIER - NIGHT\n\n${fish}needle${fish}\n`,
    );
    open = await connect({ folders: [join(dir, 'Fog')] });
    const horn = await search({ script: 'Fog/Fog.fountain', words: 'foghorn' });
    expect(horn.hits).toHaveLength(1);
    const around = horn.hits[0]?.around as string;
    expect(around.length).toBeLessThanOrEqual(SEARCH_LIMITS.around);
    expect(around.length).toBeGreaterThan(150);
    expect(around).toContain('the foghorn sounds once.');
    // Centred: about as much before the word as after.
    const at = around.indexOf('foghorn');
    expect(Math.abs(at - (around.length - at - 'foghorn'.length))).toBeLessThan(20);
    // Cut at code points: no half of an emoji at either end.
    const needle = await search({ script: 'Fog/Fog.fountain', words: 'needle' });
    const text = needle.hits[0]?.around as string;
    expect(text.length).toBeLessThanOrEqual(SEARCH_LIMITS.around);
    expect(text).toContain('needle');
    expect(text).not.toMatch(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/,
    );
  });

  it('a page parses only so much, and the next page carries on', async () => {
    const dir = tempFolder();
    const scene = (n: number) =>
      `INT. SHED ${n} - DAY\n\nA lantern on a nail. ${'Dust. '.repeat(150)}\n`;
    for (const n of [1, 2, 3]) put(join(dir, 'Sheds', `Shed ${n}.fountain`), scene(n));
    open = await connect({ folders: [join(dir, 'Sheds')] });
    __setLimitsForTests({ pageParseBytes: 1_500 });
    const seen: string[] = [];
    let page = await search({ words: 'lantern' });
    let pages = 1;
    for (;;) {
      seen.push(...page.hits.map((h) => h.path));
      if (!page.next) break;
      page = await search({ words: 'lantern', cursor: page.next });
      pages++;
    }
    expect(pages).toBe(3);
    expect(seen).toEqual([
      'Sheds/Shed 1.fountain',
      'Sheds/Shed 2.fountain',
      'Sheds/Shed 3.fountain',
    ]);
    expect(page.files_searched).toBe(3);
    expect(page.stopped).toBeNull();
  });

  it('long headings are cut, and a page stays under the cap', async () => {
    const dir = tempFolder();
    const heading = `INT. ${'A VERY LONG CORRIDOR '.repeat(300)}- NIGHT`;
    put(
      join(dir, 'Hall', 'Hall.fountain'),
      Array.from({ length: 60 }, () => `${heading}\n\nThe bell rings.\n`).join('\n'),
    );
    open = await connect({ folders: [join(dir, 'Hall')] });
    // answerOf checks the cap.
    const got = await search({ script: 'Hall/Hall.fountain', words: 'bell' });
    expect(got.hits.length).toBeGreaterThan(0);
    expect(got.hits.length).toBeLessThan(50);
    for (const hit of got.hits) expect((hit.heading as string).length).toBeLessThanOrEqual(1_000);
    expect(got.next).toBeDefined();
  });

  it('a folder and a script together, or no words, are refused', async () => {
    const script = await lamp();
    const both = await (open as Connected).call('search_scripts', {
      words: 'lamp',
      script,
      folder: 'Lamp',
    });
    expect(refusalOf(both).error).toBe('Give a folder or a script, not both.');
    const blank = await (open as Connected).call('search_scripts', { words: '   ' });
    expect(refusalOf(blank).error).toBe('Give at least one word to find.');
  });
});
