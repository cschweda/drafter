import { createHash } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import {
  type CutEntry,
  cutsFile,
  cutText,
  MAX_CUTS_PER_ENTRY,
  MAX_VERSIONS_PER_ID,
  mergeCuts,
  readCutsFile,
  verifyCuts,
} from '../src';
import { MAX_GROWTH, SCALING_TIMEOUT, scaling } from './scaling';

const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
/** A cut's ID: the hash of its text with `\n` line breaks. */
const hashText = (text: string) => sha(cutText(text));

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

  test('names each draft as the app does: two digits, three past 99', () => {
    const a = scene(
      'INT. ATTIC - NIGHT\n\nDust.\n',
      'INT. ATTIC - NIGHT',
      '2026-11-03T10:00:00.000Z',
      3,
    );
    a.cuts.push({ at: '2026-11-09T10:00:00.000Z', draft: 120 });
    const file = cutsFile('Boca.fountain', [a]);
    expect(file).toContain('Cut while writing Draft 03, 3 Nov 2026 (and Draft 120, 9 Nov 2026)');
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

/** The merge's options in tests: a script, and a "now" after every generated date. */
const OPTS = { kind: 'fountain' as const, now: new Date('2031-01-01T00:00:00.000Z') };
const dates = (e: CutEntry | undefined) => (e ? e.cuts.map((c) => `${c.at}|${c.draft}`) : []);
const shuffled = <T>(xs: readonly T[]) => fc.shuffledSubarray([...xs], { minLength: xs.length });

describe('mergeCuts', () => {
  test('merge is a union by id with every cut date and no duplicates', () => {
    const here = scene('Gone.', 'Gone', '2026-11-03T10:00:00.000Z', 12);
    const there = { ...here, cuts: [{ at: '2026-11-09T10:00:00.000Z', draft: 14 }] };
    const other = scene('Other.', 'Other', '2026-11-04T10:00:00.000Z');
    const merged = mergeCuts([here], [there, other], OPTS);
    expect(merged.map((e) => e.id)).toEqual([here.id, other.id]);
    expect(merged[0]?.cuts).toEqual([
      { at: '2026-11-03T10:00:00.000Z', draft: 12 },
      { at: '2026-11-09T10:00:00.000Z', draft: 14 },
    ]);
    // The same cut on both sides is one date, not two.
    expect(mergeCuts([here], [here], OPTS)).toEqual([here]);
  });

  test('the local side\u2019s title, kind, place and Put back win; an incoming Put back is advisory', () => {
    const mine = {
      ...scene('X.', 'Mine', '2026-11-03T10:00:00.000Z'),
      putBack: '2026-11-08T10:00:00.000Z',
    };
    const theirs = {
      ...mine,
      title: 'Theirs',
      where: { after: 'ELSEWHERE', before: null },
      cuts: [{ at: '2026-01-01T10:00:00.000Z', draft: 1 }],
      putBack: '2026-11-05T10:00:00.000Z',
    };
    const [m] = mergeCuts([mine], [theirs], OPTS);
    expect(m).toMatchObject({ title: 'Mine', where: mine.where, putBack: mine.putBack });
    expect(m?.cuts).toHaveLength(2);
    const { putBack: _p, ...unplaced } = mine;
    expect(mergeCuts([unplaced], [theirs], OPTS)[0]).not.toHaveProperty('putBack');
    // Only on the other side, its Put back is all there is.
    expect(mergeCuts([], [theirs], OPTS)[0]?.putBack).toBe(theirs.putBack);
  });

  test('drops an incoming cut of the wrong kind, never a local one', () => {
    const script = scene('X.', 'X', '2026-11-03T10:00:00.000Z');
    const doc: CutEntry = { ...scene('Y.', 'Y', '2026-11-03T10:00:00.000Z'), kind: 'markdown' };
    expect(mergeCuts([], [script, doc], OPTS).map((e) => e.id)).toEqual([script.id]);
    expect(mergeCuts([doc], [], OPTS).map((e) => e.id)).toEqual([doc.id]);
    expect(mergeCuts([script], [{ ...script, kind: 'markdown' }], OPTS)).toEqual([script]);
  });

  test('ignores incoming dates more than a day past now', () => {
    const now = new Date('2026-11-03T12:00:00.000Z');
    const mine = scene('X.', 'X', '2026-11-03T10:00:00.000Z');
    const soon = { at: '2026-11-04T06:00:00.000Z', draft: 2 };
    const far = { at: '2099-01-01T00:00:00.000Z', draft: 3 };
    const [m] = mergeCuts([mine], [{ ...mine, cuts: [soon, far] }], { kind: 'fountain', now });
    expect(m?.cuts).toEqual([...mine.cuts, soon]);
    // An incoming cut with only far-future dates, or a far-future Put back, is ignored.
    const other = scene('Y.', 'Y', '2099-01-01T00:00:00.000Z');
    expect(mergeCuts([], [other], { kind: 'fountain', now })).toEqual([]);
    const later = { ...scene('Z.', 'Z', '2026-11-01T00:00:00.000Z'), putBack: far.at };
    expect(mergeCuts([], [later], { kind: 'fountain', now })[0]).not.toHaveProperty('putBack');
    // A flood of future dates can't push the local ones out of the cap.
    const flood = Array.from({ length: MAX_CUTS_PER_ENTRY }, (_, i) => ({
      at: new Date(Date.UTC(2090, 0, 1) + i * 1000).toISOString(),
      draft: 1,
    }));
    expect(
      mergeCuts([mine], [{ ...mine, cuts: flood }], { kind: 'fountain', now })[0]?.cuts,
    ).toEqual(mine.cuts);
  });

  test('incoming dates inside the slack can\u2019t push out any local date', () => {
    const now = new Date('2026-11-03T12:00:00.000Z');
    const mine = {
      ...scene('X.', 'X', '2026-10-01T10:00:00.000Z'),
      cuts: Array.from({ length: 5 }, (_, i) => ({
        at: new Date(Date.UTC(2026, 9, 1 + i)).toISOString(),
        draft: i + 1,
      })),
    };
    // A crafted file: more than the cap of dates, all newer than mine, all within the day's slack.
    const crafted = Array.from({ length: MAX_CUTS_PER_ENTRY + 50 }, (_, i) => ({
      at: new Date(now.getTime() + i * 60).toISOString(),
      draft: 1,
    }));
    const [m] = mergeCuts([mine], [{ ...mine, cuts: crafted }], { kind: 'fountain', now });
    expect(m?.cuts).toHaveLength(MAX_CUTS_PER_ENTRY);
    for (const cut of mine.cuts) expect(m?.cuts).toContainEqual(cut);
    // The rest are the newest incoming ones.
    expect(m?.cuts.at(-1)).toEqual(crafted.at(-1));
  });

  test('the order of either list never changes the merge, even past the caps', () => {
    // Shared texts make clashing IDs likely.
    const shared = fc.array(
      anyEntry.chain((e) =>
        fc.constantFrom('a', 'b', 'c').map((t) => ({ ...e, id: hashText(t), text: t })),
      ),
      { maxLength: 6 },
    );
    const side = fc.oneof(anyEntries, shared);
    fc.assert(
      fc.property(
        side.chain((l) => fc.tuple(fc.constant(l), shuffled(l))),
        side.chain((i) => fc.tuple(fc.constant(i), shuffled(i))),
        ([l, l2], [i, i2]) => {
          expect(mergeCuts(l2, i2, OPTS)).toEqual(mergeCuts(l, i, OPTS));
        },
      ),
      { numRuns: 300 },
    );
    // Past the version cap: many versions of one cut, in any order.
    const base = scene('Flood.', 'Flood', '2026-11-03T10:00:00.000Z');
    const versions = Array.from({ length: MAX_VERSIONS_PER_ID + 20 }, (_, i) => ({
      ...base,
      title: `Version ${i}`,
      cuts: [{ at: new Date(Date.UTC(2026, 0, 1) + (i % 37) * 1000).toISOString(), draft: 1 }],
    }));
    fc.assert(
      fc.property(shuffled(versions), shuffled(versions), (x, y) => {
        expect(mergeCuts([], x, OPTS)).toEqual(mergeCuts([], y, OPTS));
        expect(mergeCuts(x, [], OPTS)).toEqual(mergeCuts(y, [], OPTS));
      }),
      { numRuns: 50 },
    );
  });

  test('a flood of versions from one side can\u2019t evict the other side\u2019s cut', () => {
    fc.assert(
      fc.property(anyEntry, fc.integer({ min: 1, max: 3 * MAX_VERSIONS_PER_ID }), (e, n) => {
        const mine = { ...e, kind: 'fountain' as const };
        const flood = Array.from({ length: n }, (_, k) => ({
          ...mine,
          title: `Forged ${k}`,
          where: { after: `X${k}`, before: null },
          cuts: [{ at: new Date(Date.UTC(2020, 0, 1) + k).toISOString(), draft: 1 }],
        }));
        const [m] = mergeCuts([mine], flood, OPTS);
        expect(m).toMatchObject({ title: mine.title, kind: mine.kind, where: mine.where });
        for (const cut of mine.cuts) expect(m?.cuts).toContainEqual(cut);
        expect(m?.putBack).toBe(mine.putBack);
      }),
      { numRuns: 100 },
    );
  });

  test('swapping the sides keeps the same cuts and dates, merging again changes nothing, and nothing is lost', () => {
    const shared = fc.array(
      anyEntry.chain((e) =>
        fc
          .constantFrom('a', 'b', 'c')
          .map((t) => ({ ...e, kind: 'fountain' as const, id: hashText(t), text: t })),
      ),
      { maxLength: 5 },
    );
    const scripts = anyEntries.map((es) => es.map((e) => ({ ...e, kind: 'fountain' as const })));
    const side = fc.oneof(scripts, shared);
    fc.assert(
      fc.property(side, side, side, (a, b, c) => {
        const ab = mergeCuts(a, b, OPTS);
        const ba = mergeCuts(b, a, OPTS);
        // Dates and the set of cuts don't depend on which side is local; the local fields do.
        expect(ba.map((e) => e.id).sort()).toEqual(ab.map((e) => e.id).sort());
        for (const e of ab) expect(dates(ba.find((x) => x.id === e.id))).toEqual(dates(e));
        const left = mergeCuts(mergeCuts(a, b, OPTS), c, OPTS);
        const right = mergeCuts(a, mergeCuts(b, c, OPTS), OPTS);
        expect(right.map((e) => e.id).sort()).toEqual(left.map((e) => e.id).sort());
        for (const e of left) expect(dates(right.find((x) => x.id === e.id))).toEqual(dates(e));
        expect(mergeCuts(ab, ab, OPTS)).toEqual(ab);
        expect(mergeCuts(ab, b, OPTS)).toEqual(ab);
        // Every ID and every cut date of either side is in the merge, once.
        const ids = new Set([...a, ...b].map((e) => e.id));
        expect(ab.map((e) => e.id).sort()).toEqual([...ids].sort());
        for (const e of [...a, ...b]) {
          const m = ab.find((x) => x.id === e.id) as CutEntry;
          for (const cut of e.cuts) expect(m.cuts).toContainEqual(cut);
          const keys = dates(m);
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
    expect(mergeCuts([a], [b], OPTS)[0]?.cuts).toEqual([
      { at: '2026-11-03T10:00:00.000Z', draft: 12 },
    ]);
    // Read from a file edited by hand, the date comes back as toISOString writes it.
    const file = cutsFile('Boca.fountain', [a]).replace('10:00:00.000Z', '10:00:00Z');
    const read = readCutsFile(file);
    expect(read.entries[0]?.cuts[0]?.at).toBe('2026-11-03T10:00:00.000Z');
    expect(mergeCuts(read.entries, [a], OPTS)[0]?.cuts).toHaveLength(1);
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

  test('a cut’s ID is of its text with LF line breaks, on Windows as on a Mac', async () => {
    const lf = scene(
      'INT. ATTIC - NIGHT\n\nDust.',
      'INT. ATTIC - NIGHT',
      '2026-11-03T10:00:00.000Z',
    );
    const crlf = { ...lf, text: lf.text.replace(/\n/g, '\r\n') };
    expect(lf.id).toBe(sha('INT. ATTIC - NIGHT\n\nDust.'));
    expect(await verifyCuts([crlf, lf])).toEqual({ entries: [lf, lf], skipped: 0 });
    const raw = { ...crlf, id: sha(crlf.text) };
    expect(await verifyCuts([raw])).toEqual({ entries: [], skipped: 1 });
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
        fc.pre(cutText(other) !== cutText(good.text));
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
          ? mergeCuts(mine.entries, theirs.entries, { ...OPTS, kind: good.kind })
          : mergeCuts(theirs.entries, mine.entries, { ...OPTS, kind: good.kind });
        expect(merged).toHaveLength(1);
        expect(merged[0]?.text).toBe(cutText(good.text));
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
    // A merge never holds more dates than the cap. A local list already at the cap takes no
    // incoming dates, even newer ones.
    const left = { ...a, cuts: many.slice(0, MAX_CUTS_PER_ENTRY) };
    const right = { ...a, cuts: many.slice(1) };
    const merged = mergeCuts([left], [right], OPTS)[0] as CutEntry;
    expect(merged.cuts).toEqual(left.cuts);
    // Room left is filled with the newest incoming dates.
    const some = { ...a, cuts: many.slice(0, 10) };
    const filled = mergeCuts([some], [right], OPTS)[0] as CutEntry;
    expect(filled.cuts).toHaveLength(MAX_CUTS_PER_ENTRY);
    for (const cut of some.cuts) expect(filled.cuts).toContainEqual(cut);
    expect(filled.cuts.at(-1)).toEqual(many.at(-1));
    expect(filled.cuts).not.toContainEqual(many[10]);
    // Versions past the cap are ignored.
    const versions = Array.from({ length: MAX_VERSIONS_PER_ID + 5 }, (_, i) => ({
      ...a,
      cuts: [{ at: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString(), draft: 1 }],
    }));
    expect(mergeCuts(versions, [], OPTS)[0]?.cuts).toHaveLength(MAX_VERSIONS_PER_ID);
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
        (entries) => mergeCuts(entries, entries, OPTS),
        2_000,
        3,
      );
      expect(sameId.growth).toBeLessThan(MAX_GROWTH);
      const distinct = scaling(
        (n) =>
          Array.from({ length: n }, (_, i) =>
            scene(`Scene ${i}.`, `S${i}`, new Date(Date.UTC(2026, 0, 1) + i).toISOString()),
          ),
        (entries) => mergeCuts(entries, entries, OPTS),
        5_000,
        3,
      );
      expect(distinct.growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );
});
