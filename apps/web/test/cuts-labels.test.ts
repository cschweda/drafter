import type { CutEntry } from '@drafter/history';
import { describe, expect, test } from 'vitest';
import {
  cutLine,
  cutsCount,
  filterCuts,
  filterIndexed,
  groupCuts,
  groupIndexed,
  indexCuts,
  matchesLabel,
  wholeLabel,
} from '../app/cuts/labels';
import { newestFirst } from '../app/cuts/store';

// The Cuts list's words and order (drafts-and-cuts design §3.2): passages under the scene or
// chapter they left, newest first; when, and while writing which draft; a filter for browsing.

const at = (day: number, hour = 10) => new Date(2026, 10, day, hour, 42).toISOString();
let n = 0;
function row(
  title: string,
  within: string | null,
  cuts: CutEntry['cuts'],
  extra: Partial<CutEntry> = {},
): CutEntry {
  n++;
  return {
    id: String(n).padStart(64, '0'),
    title,
    text: `${title} text`,
    kind: 'fountain',
    cuts,
    where: {
      after: null,
      before: null,
      within: within === null ? null : { heading: within, ordinal: 1 },
    },
    ...extra,
  };
}

describe('the Cuts list', () => {
  test('groups passages under the scene they left, newest first, and a whole scene under its own', () => {
    const rows = newestFirst([
      row('Marra keeps the key…', 'INT. HALL - DAY', [{ at: at(3), draft: 2 }]),
      row('INT. CELLAR - NIGHT', null, [{ at: at(5), draft: 3 }]),
      row('The lamp swings…', 'INT. CELLAR - NIGHT', [{ at: at(4), draft: 3 }]),
      row('Osken shrugs…', 'INT. HALL - DAY', [{ at: at(6), draft: 3 }]),
    ]);
    const groups = groupCuts(rows, 'scene');
    expect(groups.map((g) => [g.label, g.rows.map((r) => r.title)])).toEqual([
      ['INT. HALL - DAY', ['Osken shrugs…', 'Marra keeps the key…']],
      ['INT. CELLAR - NIGHT', ['INT. CELLAR - NIGHT', 'The lamp swings…']],
    ]);
  });

  test('a heading at more than one place is a group per place, "(scene 4)"', () => {
    const car = (title: string, ordinal: number, day: number): CutEntry => ({
      ...row(title, 'INT. CAR - NIGHT', [{ at: at(day), draft: 1 }]),
      where: { after: null, before: null, within: { heading: 'INT. CAR - NIGHT', ordinal } },
    });
    const rows = newestFirst([car('A', 2, 3), car('B', 4, 4), car('C', 2, 5)]);
    expect(groupCuts(rows, 'scene').map((g) => [g.label, g.rows.map((r) => r.title)])).toEqual([
      ['INT. CAR - NIGHT (scene 2)', ['C', 'A']],
      ['INT. CAR - NIGHT (scene 4)', ['B']],
    ]);
  });

  test('2,000 cuts: read once, then filtered and grouped quickly', () => {
    const many = Array.from({ length: 2000 }, (_, i) =>
      row(
        `Cut ${i}`,
        `INT. ROOM ${i % 40} - NIGHT`,
        [{ at: at(1 + (i % 28), i % 12), draft: 1 + (i % 9) }],
        {
          text: `Words of cut ${i}, about the ferry and the pier, `.repeat(20),
        },
      ),
    );
    const indexed = indexCuts(newestFirst(many));
    let slowest = 0;
    for (const typed of ['f', 'fe', 'fer', 'ferr', 'ferry', 'cut 1999', 'draft 3', '']) {
      const started = performance.now();
      const found = filterIndexed(indexed, typed);
      groupIndexed(found, 'scene');
      groupIndexed(found, 'draft');
      slowest = Math.max(slowest, performance.now() - started);
    }
    expect(slowest).toBeLessThan(50);
  });

  test('groups by draft, with "before drafts" for the backfill’s', () => {
    const rows = newestFirst([
      row('A', 'INT. HALL - DAY', [{ at: at(1), draft: null }]),
      row('B', 'INT. HALL - DAY', [{ at: at(3), draft: 2 }]),
      row('C', 'INT. HALL - DAY', [{ at: at(4), draft: 2 }]),
    ]);
    const ids = new Map([[2, 'a3f9c2e1'.padEnd(64, '0')]]);
    expect(groupCuts(rows, 'draft', ids).map((g) => [g.label, g.rows.length])).toEqual([
      ['Draft 02 (a3f9c2e)', 2],
      ['Before drafts', 1],
    ]);
  });

  test('says when, and while writing which draft', () => {
    expect(cutLine(row('A', null, [{ at: at(3), draft: 3 }]))).toBe(
      'Cut while writing Draft 03 · 3 Nov 2026, 10:42 AM',
    );
    expect(cutLine(row('A', null, [{ at: at(3), draft: null }]))).toBe(
      'Cut before drafts · 3 Nov 2026',
    );
    const twice = row('A', null, [
      { at: at(3), draft: 3 },
      { at: at(8), draft: 5 },
    ]);
    expect(cutLine(twice, new Map([[5, 'b'.repeat(64)]]))).toBe(
      'Cut while writing Draft 05 (bbbbbbb) · 8 Nov 2026, 10:42 AM · cut 2 times',
    );
    const back = row('A', null, [{ at: at(3), draft: 3 }], { putBack: at(4) });
    expect(cutLine(back)).toBe(
      'Cut while writing Draft 03 · 3 Nov 2026, 10:42 AM · put back on 4 Nov 2026',
    );
  });

  test('a filter finds words, headings and draft numbers', () => {
    const rows = [
      row('The ferry…', 'INT. PIER - DUSK', [{ at: at(3), draft: 2 }]),
      row('INT. CELLAR - NIGHT', null, [{ at: at(5), draft: 3 }]),
    ];
    expect(filterCuts(rows, 'FERRY').map((r) => r.title)).toEqual(['The ferry…']);
    expect(filterCuts(rows, 'pier').map((r) => r.title)).toEqual(['The ferry…']);
    expect(filterCuts(rows, 'draft 03').map((r) => r.title)).toEqual(['INT. CELLAR - NIGHT']);
    expect(filterCuts(rows, '  ')).toHaveLength(2);
    const cafe = [row('INT. CAFÉ - DAY', null, [{ at: at(3), draft: 1 }])];
    expect(filterCuts(cafe, 'cafe')).toHaveLength(1);
  });

  test('names a whole cut, and counts', () => {
    expect(wholeLabel(row('A', null, []))).toBe('Whole scene');
    expect(wholeLabel({ ...row('A', null, []), kind: 'markdown' })).toBe('Whole section');
    expect(wholeLabel(row('A', 'B', []))).toBeNull();
    expect(cutsCount(1)).toBe('1 cut');
    expect(cutsCount(1200)).toBe('1,200 cuts');
    expect([0, 1, 2000].map(matchesLabel)).toEqual([
      'No cut matches.',
      '1 cut matches.',
      '2,000 cuts match.',
    ]);
  });
});
