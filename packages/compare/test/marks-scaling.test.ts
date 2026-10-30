import type { Layout, LayoutLine } from '@drafter/layout';
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { type Change, changesOf, markPages, type PageMarks } from '../src';
import { lay, play, SHORT_PLAY, SHORT_SCREENPLAY } from './fixtures';
import { MAX_GROWTH, SCALING_TIMEOUT, scaling } from './scaling';

// `markPages` finds each change's lines by binary search over the printed lines in source order
// (version history, Task 5: Show changes marks every layout). It must mark exactly what reading
// every line for every change marks (`reference`, the first version's way), and grow as the script.

/** The first version of `markPages`: every printed line read for every change. */
function reference(layout: Layout, changes: readonly Change[]): PageMarks {
  const printed: { page: number; line: LayoutLine }[] = [];
  for (const page of layout.pages)
    for (const row of page.lines)
      for (const line of row.right ? [row, row.right] : [row])
        if (line.span.from < line.span.to) printed.push({ page: page.number, line });
  const lastPage = layout.pages.at(-1)?.number ?? 1;
  const lastBlock = printed.findLast((p) => p.line.blockIndex >= 0)?.line.blockIndex ?? -1;
  const meets = (a: { from: number; to: number }, b: { from: number; to: number }) =>
    a.from < b.to && b.from < a.to;
  const marks: PageMarks = { lines: [], gaps: [], stops: [] };
  changes.forEach((change, index) => {
    const touched = change.kind === 'removed' ? change.removed : change.added;
    const withText = touched.filter((line) => line.trim() !== '').length;
    const count = withText || touched.length;
    const blank = withText === 0 && touched.length > 0 ? ({ blank: true } as const) : {};
    if (change.kind !== 'removed') {
      const hit = printed.filter((p) => meets(p.line.span, change.span));
      if (hit.length > 0) {
        for (const { page, line } of hit)
          marks.lines.push({ page, span: { ...line.span }, kind: change.kind, change: index });
        const first = hit[0] as (typeof hit)[number];
        marks.stops.push({
          change: index,
          kind: change.kind,
          page: first.page,
          block: first.line.blockIndex,
          lines: count,
          ...blank,
        });
        return;
      }
    }
    let next: (typeof printed)[number] | undefined;
    for (const p of printed)
      if (p.line.span.from >= change.span.from && (!next || p.line.span.from < next.line.span.from))
        next = p;
    const kind = change.kind === 'removed' ? 'removed' : 'unprinted';
    const page = next?.page ?? lastPage;
    marks.gaps.push({
      page,
      before: next ? { ...next.line.span } : null,
      lines: change.kind === 'removed' ? [...change.removed] : [...change.added],
      kind,
      change: index,
    });
    marks.stops.push({
      change: index,
      kind,
      page,
      block: next ? next.line.blockIndex : lastBlock,
      lines: count,
      ...blank,
    });
  });
  return marks;
}

/** A line edit of a text: replace, insert, or remove line `at`. */
const editArb = fc.record({
  at: fc.nat(),
  op: fc.constantFrom('replace', 'insert', 'remove'),
  text: fc.constantFrom(
    '',
    'Rain.',
    'OWEN',
    'MAVIS ^',
    '(quietly)',
    'INT. ROOF - NIGHT',
    '[[a note]]',
    'She waits.',
  ),
});

/** A screenplay of three pages and more, so marks and gaps fall on later pages and across breaks. */
const LONG_SCREENPLAY = Array.from({ length: 9 }, (_, s) =>
  [
    `INT. QUARROW HALL ${s} - NIGHT`,
    '',
    `Venna ${s} sets the lamp down by the marsk and listens to the orrel turn.`,
    '',
    'TOLVEN',
    `Pask ${s}. The quenby is late again.`,
    '',
    'VENNA',
    '(quietly)',
    'Then we wait for it.',
    '',
    `The wind ${s} worries at the shutters until one gives.`,
    '',
  ].join('\n'),
).join('\n');

function applyEdits(text: string, edits: { at: number; op: string; text: string }[]): string {
  const lines = text.split('\n');
  for (const { at, op, text: line } of edits) {
    const i = at % (lines.length + 1);
    if (op === 'insert') lines.splice(i, 0, line);
    else if (op === 'remove') lines.splice(i, 1);
    else lines[Math.min(i, lines.length - 1)] = line;
  }
  return lines.join('\n');
}

describe('markPages by binary search', () => {
  test('the long fixture runs over several pages', () => {
    expect(lay(LONG_SCREENPLAY).pages.length).toBeGreaterThanOrEqual(3);
  });

  test('marks exactly what reading every line marks', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          ['screenplay', SHORT_SCREENPLAY] as const,
          ['play', SHORT_PLAY] as const,
          ['screenplay', LONG_SCREENPLAY] as const,
        ),
        fc.array(editArb, { minLength: 1, maxLength: 8 }),
        ([kind, older], edits) => {
          const newer = applyEdits(older, edits);
          const layout = kind === 'play' ? lay(newer, play) : lay(newer);
          const changes = changesOf(older, newer);
          expect(markPages(layout, changes)).toEqual(reference(layout, changes));
        },
      ),
      { numRuns: 300, seed: 20261030 },
    );
  });

  test(
    'grows linearly with a change every few lines',
    () => {
      const make = (n: number) => {
        const older: string[] = [];
        const newer: string[] = [];
        for (let s = 0; s < n; s++) {
          for (const list of [older, newer]) list.push(`INT. VARROW ROOM ${s} - DAY`, '');
          for (let i = 0; i < 8; i++) {
            const line = `Tolven ${s} marsk ${i} quenby orrel pask.`;
            older.push(line, '');
            newer.push(i % 3 === 0 ? `${line} Again.` : line, '');
          }
        }
        const after = newer.join('\n');
        return { layout: lay(after), changes: changesOf(older.join('\n'), after) };
      };
      const { growth } = scaling(make, ({ layout, changes }) => markPages(layout, changes), 40);
      expect(growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );
});
