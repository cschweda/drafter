import { createHash } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import {
  type CutEntry,
  cutsFile,
  MAX_CUTS_PER_ENTRY,
  MAX_VERSIONS_PER_ID,
  mergeCuts,
  readCutsFile,
  verifyCuts,
} from '../src';
import { MAX_GROWTH, SCALING_TIMEOUT, scaling } from './scaling';

const hashText = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

const scene = (text: string, title: string, at: string, draft: number | null = 12): CutEntry => ({
  id: hashText(text),
  title,
  text,
  kind: 'fountain',
  cuts: [{ at, draft }],
  where: { after: 'INT. KITCHEN - NIGHT', before: 'EXT. PORCH - DAY' },
});

const tricky = fc.constantFrom(
  '`',
  '```',
  '````',
  '#',
  '# Heading',
  '######',
  '-->',
  '<!-- drafter-cut {"id":"x"} -->',
  '*/',
  '/* drafter',
  '\n',
  '\r\n',
  '\r',
  ' ',
  'é ✓ 𝄞',
  'INT. HOUSE - DAY',
);
const anyText = fc.oneof(
  fc.array(tricky, { maxLength: 20 }).map((p) => p.join('')),
  fc.string({ unit: 'binary', maxLength: 40 }),
);
const iso = fc
  .integer({ min: Date.UTC(2020, 0, 1), max: Date.UTC(2030, 0, 1) })
  .map((t) => new Date(t).toISOString());
const anyCut = fc.record({
  at: iso,
  draft: fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 200 })),
});
const anyEntry: fc.Arbitrary<CutEntry> = fc
  .record({
    text: anyText,
    title: anyText,
    kind: fc.constantFrom('fountain' as const, 'markdown' as const),
    cuts: fc.array(anyCut, { minLength: 1, maxLength: 3 }),
    after: fc.option(anyText, { nil: null }),
    before: fc.option(anyText, { nil: null }),
    putBack: fc.option(iso, { nil: undefined }),
  })
  .map(({ text, title, kind, cuts, after, before, putBack }) => ({
    id: hashText(text),
    title,
    text,
    kind,
    cuts,
    where: { after, before },
    ...(putBack === undefined ? {} : { putBack }),
  }));
/** Entries with different texts, so different IDs. */
const anyEntries = fc.uniqueArray(anyEntry, { selector: (e) => e.id, maxLength: 8 });

/** The newest cut in an entry. */
const latest = (e: CutEntry) =>
  e.cuts
    .map((c) => c.at)
    .sort()
    .at(-1) ?? '';
const newestFirst = (entries: readonly CutEntry[]) =>
  [...entries].sort((a, b) =>
    latest(a) === latest(b) ? (a.id < b.id ? -1 : 1) : latest(a) > latest(b) ? -1 : 1,
  );

describe('the cuts file', () => {
  test('reads as a Markdown document a writer can follow', () => {
    const a = scene(
      'INT. ATTIC - NIGHT\n\nNell finds the ```box```.\n',
      'INT. ATTIC - NIGHT',
      '2026-11-03T10:00:00.000Z',
    );
    a.cuts.push({ at: '2026-11-09T10:00:00.000Z', draft: 14 });
    const file = cutsFile('Boca.fountain', [a]);
    expect(file).toContain('# Cuts from Boca.fountain');
    expect(file).toContain('## INT. ATTIC - NIGHT');
    expect(file).toContain(
      `Cut while writing Draft 12, 3 Nov 2026 (and Draft 14, 9 Nov 2026) · from between "INT. KITCHEN - NIGHT" and "EXT. PORCH - DAY" · id ${a.id.slice(0, 12)}`,
    );
    // The fence is longer than any run of backticks in the text.
    expect(file).toContain('````fountain\nINT. ATTIC - NIGHT\n\nNell finds the ```box```.\n````');
  });

  test('a Markdown cut is shown as it is, its headings one level down', () => {
    const text = '# Part one\n\nThe pier.\n\n###### Deep\n\n```\n# not a heading\n```\n';
    const e: CutEntry = {
      ...scene(text, 'Part one', '2026-11-03T10:00:00.000Z', null),
      kind: 'markdown',
      where: { after: null, before: 'Part two' },
    };
    const file = cutsFile('Boca.md', [e]);
    expect(file).toContain('\n## Part one\n');
    expect(file).toContain('Cut 3 Nov 2026 · from the start, before "Part two"');
    expect(file).toContain(
      '\n## Part one\n\nThe pier.\n\n###### Deep\n\n```\n# not a heading\n```\n',
    );
    expect(file).not.toContain('\n# Part one');
  });

  test('round-trips entries exactly', () => {
    fc.assert(
      fc.property(anyEntries, fc.string({ maxLength: 20 }), (entries, work) => {
        const back = readCutsFile(cutsFile(work, entries));
        expect(back).toEqual({ entries: newestFirst(entries), skipped: 0 });
      }),
      { numRuns: 300 },
    );
  });

  test('is newest first', () => {
    const old = scene('Old.', 'Old', '2026-11-01T10:00:00.000Z');
    const mid = scene('Mid.', 'Mid', '2026-11-02T10:00:00.000Z');
    const recut = { ...scene('Recut.', 'Recut', '2026-10-01T10:00:00.000Z') };
    recut.cuts = [...recut.cuts, { at: '2026-11-05T10:00:00.000Z', draft: 15 }];
    const { entries } = readCutsFile(cutsFile('Boca.fountain', [old, mid, recut]));
    expect(entries.map((e) => e.title)).toEqual(['Recut', 'Mid', 'Old']);
  });

  test('an empty list is a file with just its header', () => {
    expect(readCutsFile(cutsFile('Boca.fountain', []))).toEqual({ entries: [], skipped: 0 });
    expect(readCutsFile('')).toEqual({ entries: [], skipped: 0 });
  });

  test('an entry edited by hand loses only itself', () => {
    const a = scene('A.', 'A', '2026-11-01T10:00:00.000Z');
    const b = scene('B.', 'B', '2026-11-02T10:00:00.000Z');
    const c = scene('C.', 'C', '2026-11-03T10:00:00.000Z');
    const file = cutsFile('Boca.fountain', [a, b, c]);
    const lines = file.split('\n');
    const comments = lines.flatMap((l, i) => (l.startsWith('<!-- drafter-cut ') ? [i] : []));
    expect(comments).toHaveLength(3);
    // Break B's comment (the second, newest first), and tidy the prose elsewhere.
    lines[comments[1] as number] = (lines[comments[1] as number] as string).replace(
      '"id":"',
      '"id":"zz',
    );
    const edited = lines.join('\n').replace('## A', '## A (the attic scene)');
    expect(readCutsFile(edited)).toEqual({ entries: [c, a], skipped: 1 });
    // Bad fields are refused, not trusted.
    for (const bad of [
      '{"id":"x"}',
      '{not json',
      '[]',
      JSON.stringify({ ...a, kind: 'novel' }),
      JSON.stringify({ ...a, cuts: [] }),
      JSON.stringify({ ...a, cuts: [{ at: 'soon', draft: 1 }] }),
      JSON.stringify({ ...a, cuts: [{ at: a.cuts[0]?.at, draft: 0 }] }),
      JSON.stringify({ ...a, where: null }),
      JSON.stringify({ ...a, putBack: 5 }),
    ]) {
      expect(readCutsFile(`<!-- drafter-cut ${bad} -->\n`)).toEqual({ entries: [], skipped: 1 });
    }
    // CRLF from a text editor on Windows reads the same.
    expect(readCutsFile(file.replaceAll('\n', '\r\n')).entries).toEqual([c, b, a]);
  });

  test(
    'reads in linear time',
    () => {
      const many = scaling(
        (n) =>
          cutsFile(
            'Boca.fountain',
            Array.from({ length: n / 4 }, (_, i) =>
              scene(
                `Scene ${i}.\n\nNell waits.`,
                `INT. ROOM ${i}`,
                new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString(),
              ),
            ),
          ),
        (file) => readCutsFile(file),
        10_000,
      );
      expect(many.growth).toBeLessThan(MAX_GROWTH);
      const big = scaling(
        (n) =>
          cutsFile('Boca.fountain', [
            scene('`'.repeat(3) + 'x'.repeat(n), 'Big', '2026-11-01T10:00:00.000Z'),
          ]),
        (file) => readCutsFile(file),
        1_250_000,
        3,
      );
      expect(big.growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );
});

describe('mergeCuts', () => {
  test('merge is a union by id with every cut date and no duplicates', () => {
    const here = scene('Gone.', 'Gone', '2026-11-03T10:00:00.000Z', 12);
    const there = { ...here, cuts: [{ at: '2026-11-09T10:00:00.000Z', draft: 14 }] };
    const other = scene('Other.', 'Other', '2026-11-04T10:00:00.000Z');
    const merged = mergeCuts([here], [there, other]);
    expect(merged.map((e) => e.id)).toEqual([here.id, other.id]);
    expect(merged[0]?.cuts).toEqual([
      { at: '2026-11-03T10:00:00.000Z', draft: 12 },
      { at: '2026-11-09T10:00:00.000Z', draft: 14 },
    ]);
    // The same cut on both sides is one date, not two.
    expect(mergeCuts([here], [here])).toEqual([here]);
  });

  test('keeps the earliest Put back', () => {
    const a = {
      ...scene('X.', 'X', '2026-11-03T10:00:00.000Z'),
      putBack: '2026-11-08T10:00:00.000Z',
    };
    const b = { ...a, putBack: '2026-11-05T10:00:00.000Z' };
    const c = scene('X.', 'X', '2026-11-03T10:00:00.000Z');
    expect(mergeCuts([a], [b])[0]?.putBack).toBe('2026-11-05T10:00:00.000Z');
    expect(mergeCuts([a], [c])[0]?.putBack).toBe('2026-11-08T10:00:00.000Z');
  });

  test('is commutative, associative and idempotent, and loses nothing', () => {
    // Shared texts make clashing IDs likely.
    const shared = fc.array(
      anyEntry.chain((e) =>
        fc.constantFrom('a', 'b', 'c').map((t) => ({ ...e, id: hashText(t), text: t })),
      ),
      { maxLength: 5 },
    );
    const side = fc.oneof(anyEntries, shared);
    fc.assert(
      fc.property(side, side, side, (a, b, c) => {
        const ab = mergeCuts(a, b);
        expect(mergeCuts(b, a)).toEqual(ab);
        expect(mergeCuts(ab, c)).toEqual(mergeCuts(a, mergeCuts(b, c)));
        expect(mergeCuts(ab, ab)).toEqual(ab);
        expect(mergeCuts(ab, b)).toEqual(ab);
        // Every ID and every cut date of either side is in the merge, once.
        const ids = new Set([...a, ...b].map((e) => e.id));
        expect(ab.map((e) => e.id).sort()).toEqual([...ids].sort());
        for (const e of [...a, ...b]) {
          const m = ab.find((x) => x.id === e.id) as CutEntry;
          for (const cut of e.cuts) expect(m.cuts).toContainEqual(cut);
          const keys = m.cuts.map((x) => `${x.at}|${x.draft}`);
          expect(new Set(keys).size).toBe(keys.length);
        }
        // And the merge is newest first.
        expect(ab).toEqual(newestFirst(ab));
      }),
      { numRuns: 300 },
    );
  });
});

describe('review fixes', () => {
  test('a cut with no dates isn\u2019t written', () => {
    const e = { ...scene('X.', 'X', '2026-11-01T10:00:00.000Z'), cuts: [] };
    expect(() => cutsFile('Boca.fountain', [e])).toThrow(TypeError);
  });

  test('the same moment at another precision is one date, not two', () => {
    const a = scene('Gone.', 'Gone', '2026-11-03T10:00:00.000Z');
    const b = { ...a, cuts: [{ at: '2026-11-03T10:00:00Z', draft: 12 }] };
    expect(mergeCuts([a], [b])[0]?.cuts).toEqual([{ at: '2026-11-03T10:00:00.000Z', draft: 12 }]);
    // Read from a file edited by hand, the date comes back as toISOString writes it.
    const file = cutsFile('Boca.fountain', [a]).replace('10:00:00.000Z', '10:00:00Z');
    const read = readCutsFile(file);
    expect(read.entries[0]?.cuts[0]?.at).toBe('2026-11-03T10:00:00.000Z');
    expect(mergeCuts(read.entries, [a])[0]?.cuts).toHaveLength(1);
  });

  test('an impossible date is skipped, and isn\u2019t written', () => {
    const a = scene('Gone.', 'Gone', '2026-11-03T10:00:00.000Z');
    const file = cutsFile('Boca.fountain', [a]);
    for (const at of ['2026-02-30T10:00:00.000Z', '2026-11-31T10:00:00.000Z']) {
      expect(readCutsFile(file.replace('2026-11-03T10:00:00.000Z', at))).toEqual({
        entries: [],
        skipped: 1,
      });
      expect(() => cutsFile('Boca.fountain', [{ ...a, cuts: [{ at, draft: 1 }] }])).toThrow(
        TypeError,
      );
    }
  });

  test('verifyCuts keeps only cuts whose text gives their id', async () => {
    const good = scene('Gone.', 'Gone', '2026-11-03T10:00:00.000Z');
    const forged = { ...good, text: 'Something else.', title: 'Forged' };
    expect(await verifyCuts([good, forged])).toEqual({ entries: [good], skipped: 1 });
    expect(await verifyCuts([{ ...good, id: 'not hex' }])).toEqual({ entries: [], skipped: 1 });
  });

  test('a forged text under a good id never replaces the good text', async () => {
    await fc.assert(
      fc.asyncProperty(anyEntry, anyText, fc.boolean(), async (good, other, first) => {
        fc.pre(other !== good.text);
        // The forgery claims the good cut's id, and to be cut earlier, so it would win unverified.
        const forged: CutEntry = {
          ...good,
          text: other,
          cuts: [{ at: '2020-01-01T00:00:00.000Z', draft: 1 }],
        };
        const mine = await verifyCuts([good]);
        const theirs = await verifyCuts([forged]);
        expect(theirs).toEqual({ entries: [], skipped: 1 });
        const merged = first
          ? mergeCuts(mine.entries, theirs.entries)
          : mergeCuts(theirs.entries, mine.entries);
        expect(merged).toHaveLength(1);
        expect(merged[0]?.text).toBe(good.text);
      }),
      { numRuns: 100 },
    );
  });

  test('caps the dates per cut and the versions of one cut', () => {
    const a = scene('Gone.', 'Gone', '2026-11-03T10:00:00.000Z');
    const many = Array.from({ length: MAX_CUTS_PER_ENTRY + 1 }, (_, i) => ({
      at: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString(),
      draft: 1,
    }));
    const json = JSON.stringify({ ...a, cuts: many });
    expect(readCutsFile(`<!-- drafter-cut ${json} -->\n`)).toEqual({ entries: [], skipped: 1 });
    const exact = JSON.stringify({ ...a, cuts: many.slice(1) });
    expect(readCutsFile(`<!-- drafter-cut ${exact} -->\n`).entries).toHaveLength(1);
    // A merge never holds more dates than the cap, keeping the newest.
    const left = { ...a, cuts: many.slice(0, MAX_CUTS_PER_ENTRY) };
    const right = { ...a, cuts: many.slice(1) };
    const merged = mergeCuts([left], [right])[0] as CutEntry;
    expect(merged.cuts).toHaveLength(MAX_CUTS_PER_ENTRY);
    expect(merged.cuts.at(-1)).toEqual(many.at(-1));
    // Versions past the cap are ignored.
    const versions = Array.from({ length: MAX_VERSIONS_PER_ID + 5 }, (_, i) => ({
      ...a,
      cuts: [{ at: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString(), draft: 1 }],
    }));
    expect(mergeCuts(versions, [])[0]?.cuts).toHaveLength(MAX_VERSIONS_PER_ID);
  });

  test(
    'merges hostile duplicate ids in linear time',
    () => {
      const big = 'x'.repeat(200_000);
      const sameId = scaling(
        (n) =>
          Array.from({ length: n }, (_, i) => ({
            id: 'a'.repeat(64),
            title: `T${i}`,
            text: big,
            kind: 'fountain' as const,
            cuts: [{ at: '2026-11-03T10:00:00.000Z', draft: (i % 50) + 1 }],
            where: { after: null, before: null },
          })),
        (entries) => mergeCuts(entries, entries),
        2_000,
        3,
      );
      expect(sameId.growth).toBeLessThan(MAX_GROWTH);
      const distinct = scaling(
        (n) =>
          Array.from({ length: n }, (_, i) =>
            scene(`Scene ${i}.`, `S${i}`, new Date(Date.UTC(2026, 0, 1) + i).toISOString()),
          ),
        (entries) => mergeCuts(entries, entries),
        5_000,
        3,
      );
      expect(distinct.growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );
});
