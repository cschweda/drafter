import { createHash } from 'node:crypto';
import { symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { cutsFile, cutText } from '@drafter/history';
import { afterEach, describe, expect, it } from 'vitest';
import { OUTSIDE } from '../src/paths';
import { answerOf, type Connected, connect, refusalOf } from './connect';
import { CUTS_101, EPISODE_101, makeLibrary } from './library';
import { put, tempFolder } from './temp';

interface Cut {
  id: string;
  title: string;
  kind: 'scene' | 'passage';
  after: string | null;
  before: string | null;
  within: string | null;
  cut: Array<{ at: string; draft: string | null }>;
  put_back: string | null;
  words: number;
  text: string;
  trimmed: boolean;
  part?: number;
  parts?: number;
}
interface Cuts {
  cuts: Cut[];
  skipped: number;
  left_out: { notes: number; boneyard: number };
  note?: string;
  next?: string;
}

let open: Connected | undefined;
afterEach(async () => {
  await open?.close();
  open = undefined;
});

const EP101 = `Scripts/Signal Hill/${EPISODE_101}`;
const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

async function library() {
  const { scripts } = makeLibrary(tempFolder());
  open = await connect({ folders: [scripts] });
}

const cuts = async (args: object) =>
  answerOf<Cuts>(await (open as Connected).call('list_cuts', { script: EP101, ...args }));
const titles = (got: Cuts) => got.cuts.map((c) => c.title);

describe('list_cuts', () => {
  it('lists the cuts newest first, the forged one skipped', async () => {
    await library();
    const result = await (open as Connected).call('list_cuts', { script: EP101 });
    const got = answerOf<Cuts>(result);
    expect(titles(got)).toEqual([
      'June hums the station’s old jingle, off key.…',
      'WES (taking off his hat) Morning, June.',
      'EXT. WATER TOWER - NIGHT',
    ]);
    expect(got.skipped).toBe(1);
    expect((result.content[0] as { text: string }).text).not.toContain('List every file');
    const [hums, , tower] = got.cuts;
    expect(hums).toMatchObject({
      id: CUTS_101[1]?.id,
      kind: 'passage',
      within: "INT. JUNE'S KITCHEN - NIGHT",
      after: null,
      before: 'EXT. PRUITT FARM - DAWN',
      cut: [
        { at: '2026-10-05T10:00:00.000Z', draft: 'Draft 03' },
        { at: '2026-10-03T10:00:00.000Z', draft: 'Draft 02' },
      ],
      put_back: null,
      trimmed: false,
    });
    // The note in it is left out, and counted; the tower's metadata block never shows.
    expect(hums?.text).not.toContain('[[');
    expect(hums?.text).toContain('Ninety-nine point one.');
    expect(got.left_out).toEqual({ notes: 1, boneyard: 0 });
    expect(tower).toMatchObject({ kind: 'scene', within: null, words: expect.any(Number) });
    expect(tower?.text).not.toContain('drafter');
    expect(tower?.text).not.toContain('us-screenplay');
    expect(tower?.text).toContain('I can see the whole county from here.');

    const asked = await cuts({ include: ['notes'] });
    expect(asked.cuts[0]?.text).toContain('[[Too cute? Keep for the finale maybe.]]');
    expect(asked.left_out).toEqual({ notes: 0, boneyard: 0 });
  });

  it('by draft and by scene', async () => {
    await library();
    expect(titles(await cuts({ group: 'draft' }))).toEqual([
      'June hums the station’s old jingle, off key.…',
      'WES (taking off his hat) Morning, June.',
      'EXT. WATER TOWER - NIGHT',
    ]);
    expect(titles(await cuts({ group: 'scene' }))).toEqual([
      'June hums the station’s old jingle, off key.…',
      'EXT. WATER TOWER - NIGHT',
      'WES (taking off his hat) Morning, June.',
    ]);
    expect(titles(await cuts({ scene: '2' }))).toEqual(['EXT. WATER TOWER - NIGHT']);
    expect(titles(await cuts({ scene: 'pruitt farm continuous' }))).toEqual([
      'WES (taking off his hat) Morning, June.',
      'EXT. WATER TOWER - NIGHT',
    ]);
    expect(titles(await cuts({ act: 1 }))).toHaveLength(3);
    expect(titles(await cuts({ act: 2 }))).toEqual([]);
  });

  it('words, draft, kind, and character filter', async () => {
    await library();
    expect(titles(await cuts({ words: 'whole COUNTY' }))).toEqual(['EXT. WATER TOWER - NIGHT']);
    expect(titles(await cuts({ words: 'count' }))).toEqual([]);
    expect(titles(await cuts({ draft: 3 }))).toEqual([
      'June hums the station’s old jingle, off key.…',
    ]);
    expect(titles(await cuts({ draft: 2 }))).toEqual([
      'June hums the station’s old jingle, off key.…',
      'WES (taking off his hat) Morning, June.',
    ]);
    expect(titles(await cuts({ kind: 'scene' }))).toEqual(['EXT. WATER TOWER - NIGHT']);
    expect(titles(await cuts({ kind: 'passage' }))).toEqual([
      'June hums the station’s old jingle, off key.…',
      'WES (taking off his hat) Morning, June.',
    ]);
    expect(titles(await cuts({ character: 'eli' }))).toEqual(['EXT. WATER TOWER - NIGHT']);
    expect(titles(await cuts({ character: 'June (V.O.)' }))).toEqual([
      'June hums the station’s old jingle, off key.…',
    ]);
    // A note's words aren't searched unless notes are included.
    expect(titles(await cuts({ words: 'finale' }))).toEqual([]);
    expect(titles(await cuts({ words: 'finale', include: ['notes'] }))).toEqual([
      'June hums the station’s old jingle, off key.…',
    ]);
  });

  it('a long cut is trimmed in a list and whole by id', async () => {
    const dir = tempFolder();
    const scripts = join(dir, 'Scripts');
    put(join(scripts, 'Pilot.fountain'), 'INT. HALL - DAY\n\nEmpty.\n');
    const long = cutText(
      `INT. CELLAR - NIGHT\n\n${Array.from({ length: 900 }, (_, i) => `Jar ${i + 1} on the shelf, dusty and labelled in pencil.`).join('\n\n')}\n`,
    );
    const short = 'Mira sneezes.\n';
    const entry = (text: string, title: string, at: string) => ({
      id: sha256(text),
      title,
      text,
      kind: 'fountain' as const,
      cuts: [{ at, draft: null }],
      where: { after: null, before: null, within: null },
    });
    put(
      join(scripts, 'Pilot.fountain.cuts.md'),
      cutsFile('Pilot.fountain', [
        entry(long, 'INT. CELLAR - NIGHT', '2026-10-02T10:00:00.000Z'),
        entry(short, 'Mira sneezes', '2026-10-01T10:00:00.000Z'),
      ]),
    );
    open = await connect({ folders: [scripts] });
    const list = await cuts({ script: 'Scripts/Pilot.fountain' });
    const cellar = list.cuts[0] as Cut;
    expect(cellar.trimmed).toBe(true);
    expect(cellar.text.length).toBeLessThanOrEqual(1_500);
    expect(long.startsWith(cellar.text)).toBe(true);
    expect(cellar.cut).toEqual([{ at: '2026-10-02T10:00:00.000Z', draft: null }]);
    expect(list.cuts[1]?.trimmed).toBe(false);

    // By ID, whole: in parts, since it is longer than an answer.
    let text = '';
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await cuts({
        script: 'Scripts/Pilot.fountain',
        id: cellar.id,
        ...(cursor ? { cursor } : {}),
      });
      expect(page.cuts).toHaveLength(1);
      expect(page.cuts[0]?.trimmed).toBe(false);
      text += page.cuts[0]?.text;
      pages++;
      cursor = page.next;
    } while (cursor);
    expect(pages).toBeGreaterThan(1);
    expect(text).toBe(long);

    const none = refusalOf(
      await (open as Connected).call('list_cuts', {
        script: 'Scripts/Pilot.fountain',
        id: '0'.repeat(64),
      }),
    );
    expect(none.error).toContain('no cut');
  });

  it('put back shows when', async () => {
    await library();
    const got = await cuts({});
    expect(
      got.cuts.find((c) => c.title === 'WES (taking off his hat) Morning, June.')?.put_back,
    ).toBe('2026-10-06T08:00:00.000Z');
    expect(got.cuts.filter((c) => c.put_back !== null)).toHaveLength(1);
  });

  it('no cuts file is an empty list with a note', async () => {
    const dir = tempFolder();
    const scripts = join(dir, 'Scripts');
    put(join(scripts, 'Pilot.fountain'), 'INT. HALL - DAY\n\nEmpty.\n');
    open = await connect({ folders: [scripts] });
    expect(await cuts({ script: 'Scripts/Pilot.fountain' })).toMatchObject({
      cuts: [],
      skipped: 0,
      note: 'No cuts file beside this script.',
    });
  });

  describe('a pilot with cuts of its own', () => {
    const passage = (
      title: string,
      text: string,
      within: string,
      at: string,
    ): Parameters<typeof cutsFile>[1][number] => ({
      id: sha256(cutText(text)),
      title,
      text: cutText(text),
      kind: 'fountain',
      cuts: [{ at, draft: 1 }],
      where: { after: null, before: null, within: { heading: within, ordinal: 1 } },
    });
    async function pilot(entries: Parameters<typeof cutsFile>[1]) {
      const dir = tempFolder();
      const scripts = join(dir, 'Scripts');
      put(
        join(scripts, 'Pilot.fountain'),
        'INT. HALL - DAY #7#\n\nEmpty.\n\nEXT. YARD - NIGHT\n\nWind.\n',
      );
      put(join(scripts, 'Pilot.fountain.cuts.md'), cutsFile('Pilot.fountain', entries));
      open = await connect({ folders: [scripts] });
      return dir;
    }
    const pilotCuts = (args: object) => cuts({ script: 'Scripts/Pilot.fountain', ...args });

    it('a cut finds its scene though the heading was edited', async () => {
      await pilot([
        passage('Hall', 'Mira sweeps.\n', 'int. hall – day.', '2026-10-01T10:00:00.000Z'),
        passage('Yard', 'Mira shivers.\n', 'EXT. YARD  -  NIGHT #12#', '2026-10-02T10:00:00.000Z'),
      ]);
      expect((await pilotCuts({ scene: '1' })).cuts.map((c) => c.text)).toEqual(['Mira sweeps.\n']);
      expect((await pilotCuts({ scene: 'yard' })).cuts.map((c) => c.text)).toEqual([
        'Mira shivers.\n',
      ]);
      expect((await pilotCuts({ group: 'scene' })).cuts.map((c) => c.text)).toEqual([
        'Mira sweeps.\n',
        'Mira shivers.\n',
      ]);
    });

    it('a passage is titled by what is shown of it, never a stored title', async () => {
      await pilot([
        passage(
          'secret plan for the ending',
          '[[secret plan for the ending]]\n\nMira waves from the porch.\n',
          'INT. HALL - DAY',
          '2026-10-01T10:00:00.000Z',
        ),
      ]);
      const result = await (open as Connected).call('list_cuts', {
        script: 'Scripts/Pilot.fountain',
      });
      expect((result.content[0] as { text: string }).text).not.toContain('secret');
      expect(answerOf<Cuts>(result).cuts[0]?.title).toBe('Mira waves from the porch.');
      const asked = await pilotCuts({ include: ['notes'] });
      expect(asked.cuts[0]?.title).toContain('secret plan');
    });

    it('a cue in a left-out boneyard or note doesn’t make a character speak', async () => {
      await pilot([
        passage(
          'Hidden',
          'Mira waits.\n\n/*\n\nMARCUS\nLeave it.\n\n*/\n\n[[\nTOBY\nNot yet.\n]]\n',
          'INT. HALL - DAY',
          '2026-10-01T10:00:00.000Z',
        ),
        passage(
          'Said',
          'MARCUS\nI said leave it.\n',
          'INT. HALL - DAY',
          '2026-10-02T10:00:00.000Z',
        ),
      ]);
      expect(titles(await pilotCuts({ character: 'marcus' }))).toEqual(['MARCUS I said leave it.']);
      expect(titles(await pilotCuts({ character: 'toby' }))).toEqual([]);
    });

    it('a cuts file that is a link out is refused', async () => {
      const dir = tempFolder();
      const scripts = join(dir, 'Scripts');
      put(join(scripts, 'Pilot.fountain'), 'INT. HALL - DAY\n\nEmpty.\n');
      const outside = put(
        join(dir, 'Private', 'cuts.md'),
        cutsFile('Pilot.fountain', [
          passage('Away', 'Mira leaves.\n', 'INT. HALL - DAY', '2026-10-01T10:00:00.000Z'),
        ]),
      );
      symlinkSync(outside, join(scripts, 'Pilot.fountain.cuts.md'));
      open = await connect({ folders: [scripts] });
      const result = await open.call('list_cuts', { script: 'Scripts/Pilot.fountain' });
      expect(refusalOf(result).error).toBe(OUTSIDE);
      const body = (result.content[0] as { text: string }).text;
      expect(body).not.toContain(dir);
      expect(body).not.toContain('Mira');
    });
  });
});
