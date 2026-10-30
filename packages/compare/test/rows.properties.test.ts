import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import {
  type Anchor,
  CONTEXT,
  type DiffRow,
  diffRows,
  foldRows,
  groupRows,
  pairRows,
} from '../src';

/** A line from a small alphabet: headings, blanks, and a few action lines, so lines repeat. */
const line = fc.constantFrom(
  'INT. HALL - DAY',
  'INT. HALLWAY - DAY',
  'EXT. ROOF - NIGHT',
  '',
  'Ann waits.',
  'Ann waits by the door.',
  'Sam leaves.',
);

/** An older text and a newer one made from it by random line edits. */
const pair = fc
  .tuple(
    fc.array(line, { maxLength: 60 }),
    fc.array(
      fc.record({
        at: fc.nat(),
        kind: fc.constantFrom('insert', 'delete', 'replace'),
        text: line,
      }),
      { maxLength: 12 },
    ),
  )
  .map(([older, edits]) => {
    const newer = [...older];
    for (const edit of edits) {
      const at = edit.at % (newer.length + 1);
      if (edit.kind === 'insert') newer.splice(at, 0, edit.text);
      else if (at < newer.length)
        newer.splice(at, 1, ...(edit.kind === 'replace' ? [edit.text] : []));
    }
    return [older.join('\n'), newer.join('\n')] as const;
  });

const anchors = (text: string): Anchor[] =>
  text.split('\n').flatMap((l, i) => (/^(INT|EXT)\. /.test(l) ? [{ line: i, title: l }] : []));

/** A change across a heading is rare in random edits, so the grouping properties look harder. */
const RUNS = { numRuns: 1000 };

/** The rows of a pair laid out with its anchors, and their groups. */
const grouped = (older: string, newer: string) => {
  const a = { old: anchors(older), new: anchors(newer) };
  const { rows, changes } = diffRows(older, newer, a);
  return { rows, changes, a, groups: groupRows(rows, a.old, a.new) };
};

/** The index of the last anchor at or before `line` (-1 before the first): its section. */
const sectionOf = (list: readonly Anchor[], line: number) => {
  let s = -1;
  for (let k = 0; k < list.length && list[k].line <= line; k++) s = k;
  return s;
};

describe('rows properties', () => {
  test('groups tile the rows in order', () => {
    fc.assert(
      fc.property(pair, ([older, newer]) => {
        const { rows, groups } = grouped(older, newer);
        let at = 0;
        for (const group of groups) {
          expect(group.from).toBe(at);
          expect(group.to).toBeGreaterThan(group.from);
          const inGroup = rows.slice(group.from, group.to);
          expect(group.added).toBe(inGroup.filter((r) => r.kind === 'added').length);
          expect(group.removed).toBe(inGroup.filter((r) => r.kind === 'removed').length);
          at = group.to;
        }
        expect(at).toBe(rows.length);
      }),
    );
  });

  // A change whose rows cross an anchor is cut there, so it can be in more than one group: a group
  // lists every change it holds a row of, and only those.
  test('a group lists the changes of its rows, and each change is in consecutive groups', () => {
    fc.assert(
      fc.property(pair, ([older, newer]) => {
        const { rows, changes, groups } = grouped(older, newer);
        for (const group of groups) {
          const own = [
            ...new Set(
              rows
                .slice(group.from, group.to)
                .flatMap((r) => (r.change === null ? [] : [r.change])),
            ),
          ];
          expect(group.changes).toEqual(own);
          expect(group.changes.length === 0).toBe(group.added + group.removed === 0);
        }
        const listed = groups.flatMap((g) => g.changes).filter((c, k, all) => c !== all[k - 1]);
        expect(listed).toEqual(changes.map((_, i) => i));
      }),
      RUNS,
    );
  });

  test('each line is in the group of its own heading', () => {
    fc.assert(
      fc.property(pair, ([older, newer]) => {
        const { rows, groups, a } = grouped(older, newer);
        for (const group of groups) {
          const inGroup = rows.slice(group.from, group.to);
          const olds = inGroup.filter((r) => r.kind !== 'added');
          const news = inGroup.filter((r) => r.kind !== 'removed');
          expect(new Set(olds.map((r) => sectionOf(a.old, r.old as number))).size).toBeLessThan(2);
          expect(new Set(news.map((r) => sectionOf(a.new, r.new as number))).size).toBeLessThan(2);
        }
      }),
      RUNS,
    );
  });

  test('within a group, paired rows are side by side and every row shows once', () => {
    fc.assert(
      fc.property(pair, ([older, newer]) => {
        const { rows, groups } = grouped(older, newer);
        for (const range of [...groups, { from: 0, to: rows.length }]) {
          const split = pairRows(rows, range.from, range.to);
          const left = split.flatMap((s) => (s.left === null ? [] : [s.left]));
          const right = split.flatMap((s) => (s.right === null ? [] : [s.right]));
          const ids = Array.from({ length: range.to - range.from }, (_, k) => range.from + k);
          expect(left).toEqual(ids.filter((r) => rows[r].kind !== 'added'));
          expect(right).toEqual(ids.filter((r) => rows[r].kind !== 'removed'));
          for (const s of split) {
            if (s.left !== null && rows[s.left].kind === 'same') expect(s.right).toBe(s.left);
          }
          for (const r of ids) {
            const p = rows[r].pair;
            if (rows[r].kind !== 'removed' || p === null || p < range.from || p >= range.to)
              continue;
            expect(split).toContainEqual({ left: r, right: p });
          }
        }
      }),
      RUNS,
    );
  });

  /** The rows of a pair, with no anchors or with them (a change laid out a section at a time). */
  const replayed = (withAnchors: boolean) => (older: string, newer: string) =>
    withAnchors
      ? diffRows(older, newer, { old: anchors(older), new: anchors(newer) })
      : diffRows(older, newer);

  test.each([
    ['', false],
    [', with anchors', true],
  ])('rows replay both texts, and pairs point at each other%s', (_, withAnchors) => {
    const rowsOf = replayed(withAnchors as boolean);
    fc.assert(
      fc.property(pair, ([older, newer]) => {
        const { rows } = rowsOf(older, newer);
        const side = (keep: (r: DiffRow) => boolean, n: (r: DiffRow) => number | null) => {
          const kept = rows.filter(keep);
          kept.forEach((r, i) => {
            expect(n(r)).toBe(i);
          });
          return kept.map((r) => r.text).join('\n');
        };
        expect(
          side(
            (r) => r.kind !== 'added',
            (r) => r.old,
          ),
        ).toBe(older);
        expect(
          side(
            (r) => r.kind !== 'removed',
            (r) => r.new,
          ),
        ).toBe(newer);
        rows.forEach((r, i) => {
          if (r.pair === null) return;
          expect(rows[r.pair].pair).toBe(i);
          expect(rows[r.pair].change).toBe(r.change);
          expect(new Set([r.kind, rows[r.pair].kind])).toEqual(new Set(['removed', 'added']));
        });
      }),
      withAnchors ? RUNS : undefined,
    );
  });

  // The plan named this one "no fold is shorter than 2 × CONTEXT + 1"; folds keep CONTEXT lines next
  // to a change, so it is the folded stretch that is longer than 2 × CONTEXT, not the fold itself.
  test('pieces tile a range and only stretches longer than 2 × CONTEXT fold', () => {
    fc.assert(
      fc.property(pair, fc.nat(), fc.nat(), ([older, newer], x, y) => {
        const { rows } = diffRows(older, newer);
        const from = x % (rows.length + 1);
        const to = from + (y % (rows.length - from + 1));
        const pieces = foldRows(rows, from, to);
        let at = from;
        for (let k = 0; k < pieces.length; k++) {
          const piece = pieces[k];
          expect(piece.from).toBe(at);
          expect(piece.to).toBeGreaterThan(piece.from);
          if (k > 0) expect(piece.kind).not.toBe(pieces[k - 1].kind);
          at = piece.to;
        }
        expect(at).toBe(to);
        // Each row but the first is folded exactly when its unchanged stretch in the range is longer
        // than 2 × CONTEXT and no change in the range is within CONTEXT rows of it.
        const folded = new Set<number>();
        for (const p of pieces)
          if (p.kind === 'fold') for (let i = p.from; i < p.to; i++) folded.add(i);
        for (let i = from; i < to; i++) {
          let s = i;
          while (s > from && rows[s - 1].kind === 'same') s--;
          let e = i;
          while (e < to && rows[e].kind === 'same') e++;
          const near = rows
            .slice(Math.max(from, i - CONTEXT), Math.min(to, i + CONTEXT + 1))
            .some((r) => r.kind !== 'same');
          // The range's first row, a group's heading, always shows.
          const expected = rows[i].kind === 'same' && e - s > 2 * CONTEXT && !near && i !== from;
          expect(folded.has(i)).toBe(expected);
        }
      }),
    );
  });
});
