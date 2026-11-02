import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { draftFile, draftFileName } from '@drafter/history';
import { afterEach, describe, expect, it } from 'vitest';
import { __setBudgetForTests } from '../src/paging';
import { answerOf, type Connected, connect, refusalOf } from './connect';
import { EPISODE_101, makeLibrary } from './library';
import { put, tempFolder } from './temp';

interface Group {
  title: string;
  tag: 'new' | 'deleted' | 'renamed' | 'changed' | 'opening';
  renamed_from: string | null;
  removed: string[];
  added: string[];
  summarised?: { removed: number; added: number };
  continues?: { removed: number[]; added: number[] };
  part?: number;
  parts?: number;
}
interface Compared {
  from: string;
  to: string;
  totals: {
    scenes_changed: number;
    new: number;
    deleted: number;
    renamed: number;
    unchanged: number;
    lines_added: number;
    lines_removed: number;
  };
  groups: Group[];
  left_out: { notes: number; boneyard: number };
  note?: string;
  next?: string;
  restarted?: true;
}

let open: Connected | undefined;
afterEach(async () => {
  __setBudgetForTests(undefined);
  await open?.close();
  open = undefined;
});

const EP101 = `Scripts/Signal Hill/${EPISODE_101}`;
const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

async function library() {
  const { scripts } = makeLibrary(tempFolder());
  open = await connect({ folders: [scripts] });
}

const compare = async (args: object) =>
  answerOf<Compared>(await (open as Connected).call('compare_drafts', args));

/** Every line of every group, removed and added, as one text to search. */
const allLines = (got: Compared) =>
  got.groups.flatMap((g) => [...g.removed, ...g.added]).join('\n');

describe('compare_drafts', () => {
  it('Draft 01 to Draft 03 by scene, with totals', async () => {
    await library();
    const got = await compare({ script: EP101, from: 1, to: 3 });
    expect(got.from).toBe('Draft 01');
    expect(got.to).toBe('Draft 03');
    const byTitle = new Map(got.groups.map((g) => [g.title, g]));
    expect(byTitle.get("INT. JUNE'S KITCHEN - NIGHT")).toMatchObject({
      tag: 'changed',
      renamed_from: null,
      removed: ['Nothing but static again.'],
    });
    expect(byTitle.get("INT. JUNE'S KITCHEN - NIGHT")?.added).toEqual(
      expect.arrayContaining(['The station is back.', 'She writes the time on an envelope.']),
    );
    expect(byTitle.get('EXT. PRUITT FARM - MORNING')).toMatchObject({
      tag: 'renamed',
      renamed_from: 'EXT. PRUITT FARM - DAWN',
    });
    expect(byTitle.get("INT. RAY'S WORKSHOP - DAY")?.tag).toBe('new');
    expect(byTitle.get('EXT. WATER TOWER - NIGHT')?.tag).toBe('deleted');
    expect(got.totals).toMatchObject({ new: 1, deleted: 1, renamed: 1, unchanged: 1 });
    expect(got.totals.scenes_changed).toBe(got.groups.length);
    expect(got.totals.lines_added).toBe(got.groups.reduce((n, g) => n + g.added.length, 0));
    expect(got.totals.lines_removed).toBe(got.groups.reduce((n, g) => n + g.removed.length, 0));
    expect(got.next).toBeUndefined();
  });

  it('to now compares with the script', async () => {
    await library();
    const got = await compare({ script: EP101, from: 3, to: 'now' });
    expect(got.from).toBe('Draft 03');
    expect(got.to).toBe('now');
    const titles = got.groups.map((g) => g.title);
    expect(titles).toContain("INT. AMARA'S VAN - NIGHT");
    expect(got.groups.find((g) => g.title === "INT. AMARA'S VAN - NIGHT")?.tag).toBe('new');
    // The script's own notes stay out of the lines.
    expect(allLines(got)).not.toContain('Color: blue');
    expect(got.left_out.notes).toBeGreaterThan(0);
  });

  it('notes and the metadata block never appear in the lines unless included (notes) or ever (metadata)', async () => {
    await library();
    const plain = await compare({ script: EP101, from: 1, to: 3 });
    const lines = allLines(plain);
    expect(lines).not.toContain('[[');
    expect(lines).not.toContain('older beat');
    expect(plain.left_out).toEqual({ notes: 2, boneyard: 2 });

    const asked = await compare({ script: EP101, from: 1, to: 3, include: ['notes', 'boneyard'] });
    const shown = allLines(asked);
    expect(shown).toContain('[[Make the radio older than the fridge.]]');
    expect(shown).toContain('/* A newer beat: the cruiser crests the hill. */');
    expect(asked.left_out).toEqual({ notes: 0, boneyard: 0 });
    for (const got of [plain, asked]) {
      const text = allLines(got);
      // The Contact changed between the drafts, and still never shows; nor does any metadata.
      for (const never of ['Contact', '555-01', '/* drafter', 'us-screenplay', '"draft"'])
        expect(text).not.toContain(never);
    }
  });

  it('a group of 500 changed lines is summarised, and scene brings its lines', async () => {
    const dir = tempFolder();
    const scripts = join(dir, 'Scripts');
    put(join(scripts, 'Pilot.fountain'), 'INT. HALL - DAY\n\nEmpty.\n');
    const before = 'INT. BIG ROOM - DAY\n\nA chair.\n\nINT. HALL - DAY\n\nA door.\n';
    const many = Array.from(
      { length: 500 },
      (_, i) => `Line ${i + 1} of the long room, where the light comes in from the west and stays.`,
    ).join('\n\n');
    const after = `INT. BIG ROOM - DAY\n\n${many}\n\nINT. HALL - DAY\n\nA door, open.\n`;
    [before, after].forEach((text, i) => {
      put(
        join(scripts, 'Pilot drafts', draftFileName('Pilot', i + 1, 'fountain')),
        draftFile(
          text,
          { draft: i + 1, id: sha256(text), frozen: '2026-10-01T09:00:00.000Z', note: '' },
          'fountain',
        ),
      );
    });
    open = await connect({ folders: [scripts] });
    const listed = await compare({ script: 'Scripts/Pilot.fountain', from: 1, to: 2 });
    const big = listed.groups.find((g) => g.title === 'INT. BIG ROOM - DAY');
    expect(big?.summarised?.added).toBeGreaterThan(400);
    expect(big?.added).toEqual([]);
    expect(big?.removed).toEqual([]);
    expect(listed.groups.find((g) => g.title === 'INT. HALL - DAY')?.added).toEqual([
      'A door, open.',
    ]);

    // Named, its lines come, in parts.
    const added: string[] = [];
    let cursor: string | undefined;
    let parts = 0;
    do {
      const page = await compare({
        script: 'Scripts/Pilot.fountain',
        from: 1,
        to: 2,
        scene: 'big room',
        ...(cursor ? { cursor } : {}),
      });
      expect(page.restarted).toBeUndefined();
      expect(page.groups).toHaveLength(1);
      const group = page.groups[0] as Group;
      expect(group.title).toBe('INT. BIG ROOM - DAY');
      expect(group.summarised).toBeUndefined();
      added.push(...group.added);
      parts++;
      cursor = page.next;
    } while (cursor);
    expect(parts).toBeGreaterThan(1);
    expect(added.filter((line) => line.startsWith('Line '))).toHaveLength(500);
  });

  it('a draft number that doesn’t exist refuses with the numbers there are', async () => {
    await library();
    const refusal = refusalOf(
      await (open as Connected).call('compare_drafts', { script: EP101, from: 7, to: 'now' }),
    );
    expect(refusal.error).toContain('Draft 07');
    expect(refusal.error).toContain('01, 02, 03');
    expect(refusal.drafts).toEqual([1, 2, 3]);
  });

  it('a scene that didn’t change says so', async () => {
    await library();
    const got = await compare({ script: EP101, from: 2, to: 3, scene: "ray's workshop" });
    expect(got.groups).toEqual([]);
    expect(got.note).toBeDefined();
  });
});
