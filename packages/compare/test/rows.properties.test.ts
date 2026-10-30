import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { type Anchor, CONTEXT, type DiffRow, diffRows, foldRows, groupRows } from '../src';

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

describe('rows properties', () => {
  test('groups tile the rows in order', () => {
    fc.assert(
      fc.property(pair, ([older, newer]) => {
        const { rows } = diffRows(older, newer);
        const groups = groupRows(rows, anchors(older), anchors(newer));
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

  test('every change is in exactly one group', () => {
    fc.assert(
      fc.property(pair, ([older, newer]) => {
        const { rows, changes } = diffRows(older, newer);
        const groups = groupRows(rows, anchors(older), anchors(newer));
        const listed = groups.flatMap((g) => g.changes);
        expect(listed).toEqual(changes.map((_, i) => i));
        // A change is listed by the group its first row is in.
        for (const group of groups) {
          for (const c of group.changes) {
            const first = rows.findIndex((r) => r.change === c);
            expect(first).toBeGreaterThanOrEqual(group.from);
            expect(first).toBeLessThan(group.to);
          }
        }
      }),
    );
  });

  test('rows replay both texts, and pairs point at each other', () => {
    fc.assert(
      fc.property(pair, ([older, newer]) => {
        const { rows } = diffRows(older, newer);
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
        // Each row is folded exactly when its unchanged stretch in the range is longer than
        // 2 × CONTEXT and no change in the range is within CONTEXT rows of it.
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
          const expected = rows[i].kind === 'same' && e - s > 2 * CONTEXT && !near;
          expect(folded.has(i)).toBe(expected);
        }
      }),
    );
  });
});
