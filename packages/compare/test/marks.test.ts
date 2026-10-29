import { describe, expect, test } from 'vitest';
import type { ChangeStop } from '../src';
import { changesOf, markPages, stepChange } from '../src';
import { edit, lay, partsOf, play, SHORT_PLAY, SHORT_SCREENPLAY } from './fixtures';

/** Diffs `older` with `newer`, lays `newer` out, and marks it. */
function compare(older: string, newer: string) {
  const layout = lay(newer);
  const changes = changesOf(older, newer);
  return { layout, changes, marks: markPages(layout, changes) };
}

/** The source text of a marked span. */
const at = (text: string, span: { from: number; to: number }) => text.slice(span.from, span.to);

describe('markPages', () => {
  test('marks an added line and a changed line by span', () => {
    const newer = edit(
      edit(SHORT_SCREENPLAY, 'It said ten past.', 'It said quarter past.'),
      'OWEN\nIt always says ten past.\n',
      'OWEN\nIt always says ten past.\nEvery night.\n',
    );
    const { marks } = compare(SHORT_SCREENPLAY, newer);
    expect(
      marks.lines.map((mark) => [mark.kind, at(newer, mark.span), mark.page, mark.change]),
    ).toEqual([
      ['changed', 'It said quarter past.', 1, 0],
      ['added', 'Every night.', 1, 1],
    ]);
    expect(marks.gaps).toEqual([]);
  });

  test('marks every wrapped line of a changed block', () => {
    const newer = edit(SHORT_SCREENPLAY, 'the third time', 'the fourth time');
    const { layout, marks } = compare(SHORT_SCREENPLAY, newer);
    const block = newer.indexOf('Rain hammers');
    const wrapped = partsOf(layout, 1).filter(
      (line) =>
        line.span.from < line.span.to &&
        line.span.from >= block &&
        line.span.from < newer.indexOf('JUNE\nIt said'),
    );
    expect(wrapped.every((line) => line.role === 'action')).toBe(true);
    expect(wrapped.length).toBeGreaterThan(1);
    expect(marks.lines.map((mark) => mark.span)).toEqual(wrapped.map((line) => line.span));
    expect(marks.lines.every((mark) => mark.kind === 'changed' && mark.change === 0)).toBe(true);
  });

  test('marks the right side of dual dialogue', () => {
    const newer = edit(SHORT_SCREENPLAY, "Timetables don't lie.", 'Timetables never lie.');
    const { layout, marks } = compare(SHORT_SCREENPLAY, newer);
    const right = layout.pages[1]?.lines.find(
      (line) => line.right && at(newer, line.right.span) === 'Timetables never lie.',
    )?.right;
    expect(right).toBeDefined();
    expect(marks.lines).toEqual([{ page: 1, span: right?.span, kind: 'changed', change: 0 }]);
  });

  test("puts a removal before the line after it, on that line's page", () => {
    const newer = edit(SHORT_SCREENPLAY, 'OWEN\nIt always says ten past.\n\n', '');
    const { marks } = compare(SHORT_SCREENPLAY, newer);
    expect(marks.lines).toEqual([]);
    expect(marks.gaps).toHaveLength(1);
    const [gap] = marks.gaps;
    expect(gap.kind).toBe('removed');
    expect(gap.lines).toEqual(['OWEN', 'It always says ten past.', '']);
    expect(gap.page).toBe(1);
    expect(at(newer, gap.before as { from: number; to: number })).toBe('June glares at him.');
  });

  test('puts a removal before the first line of the next page when that line follows it', () => {
    const filler = Array.from({ length: 80 }, (_, i) => `Beat ${i + 1}.`).join('\n\n');
    const older = `INT. HALL - DAY\n\n${filler}\n\nGone soon.\n\nEXT. YARD - DAY\n`;
    const newer = edit(older, 'Gone soon.\n\n', '');
    const { layout, marks } = compare(older, newer);
    const yard = layout.pages.findIndex((page) =>
      page.lines.some((line) => at(newer, line.span) === 'EXT. YARD - DAY'),
    );
    expect(yard).toBeGreaterThan(0);
    const [gap] = marks.gaps;
    expect(at(newer, gap.before as { from: number; to: number })).toBe('EXT. YARD - DAY');
    expect(gap.page).toBe(layout.pages[yard]?.number);
    expect(marks.stops[0]).toMatchObject({ kind: 'removed', page: gap.page, lines: 2 });
  });

  test('puts a removal at the end of the last page', () => {
    const newer = edit(SHORT_SCREENPLAY, '\nJUNE\nOf course.\n', '');
    const { layout, marks } = compare(SHORT_SCREENPLAY, newer);
    expect(marks.gaps).toEqual([
      {
        page: layout.pages.at(-1)?.number,
        before: null,
        lines: ['JUNE', 'Of course.', ''],
        kind: 'removed',
        change: 0,
      },
    ]);
  });

  test('a changed note is an unprinted gap', () => {
    const newer = edit(SHORT_SCREENPLAY, 'sound sure of himself', 'sound tired');
    const { marks } = compare(SHORT_SCREENPLAY, newer);
    expect(marks.lines).toEqual([]);
    expect(marks.gaps).toHaveLength(1);
    const [gap] = marks.gaps;
    expect(gap).toMatchObject({
      kind: 'unprinted',
      lines: ['[[Owen should sound tired here.]]'],
      page: 1,
      change: 0,
    });
    expect(at(newer, gap.before as { from: number; to: number })).toBe('EXT. ROAD - CONTINUOUS');
    expect(marks.stops).toEqual([
      expect.objectContaining({ kind: 'unprinted', lines: 1, page: 1 }),
    ]);
  });

  test('a blank line added is an unprinted gap', () => {
    const newer = edit(SHORT_SCREENPLAY, 'It said ten past.\n', 'It said ten past.\n\n');
    const { marks } = compare(SHORT_SCREENPLAY, newer);
    expect(marks.lines).toEqual([]);
    expect(marks.gaps).toEqual([expect.objectContaining({ kind: 'unprinted', lines: [''] })]);
  });

  test('a moved scene marks its lines added and leaves a removed gap where it was', () => {
    const road =
      'EXT. ROAD - CONTINUOUS\n\nHeadlights sweep the wet road. The bus does not stop.\n\nJUNE\nOf course.\n';
    const body = edit(SHORT_SCREENPLAY, road, '');
    const newer = edit(body, 'INT. BUS SHELTER - NIGHT\n', `${road}\nINT. BUS SHELTER - NIGHT\n`);
    const { changes, marks } = compare(SHORT_SCREENPLAY, newer);
    expect(changes.map((change) => change.kind)).toEqual(['added', 'removed']);
    const added = marks.lines.map((mark) => at(newer, mark.span));
    expect(added).toEqual([
      'EXT. ROAD - CONTINUOUS',
      'Headlights sweep the wet road. The bus does not stop.',
      'JUNE',
      'Of course.',
    ]);
    expect(marks.lines.every((mark) => mark.kind === 'added' && mark.change === 0)).toBe(true);
    expect(marks.gaps).toHaveLength(1);
    expect(marks.gaps[0]).toMatchObject({ kind: 'removed', change: 1, before: null });
    expect(marks.gaps[0].lines).toContain('EXT. ROAD - CONTINUOUS');
  });

  test('marks a title-page change on page 0', () => {
    const newer = edit(SHORT_SCREENPLAY, 'Title: The Long Wait', 'Title: The Longest Wait');
    const { marks } = compare(SHORT_SCREENPLAY, newer);
    expect(marks.lines.length).toBeGreaterThan(0);
    expect(marks.lines.every((mark) => mark.page === 0 && mark.kind === 'changed')).toBe(true);
    expect(marks.lines.map((mark) => at(newer, mark.span)).join(' ')).toContain('The Longest Wait');
    expect(marks.stops).toEqual([{ change: 0, kind: 'changed', page: 0, block: -1, lines: 1 }]);
  });

  test('marks a stage play', () => {
    const newer = edit(SHORT_PLAY, 'Not like this.', 'Not like this, Tom.');
    const layout = lay(newer, play);
    const marks = markPages(layout, changesOf(SHORT_PLAY, newer));
    expect(marks.lines.map((mark) => at(newer, mark.span))).toEqual(['Not like this, Tom.']);
  });

  test('one stop per change, in order', () => {
    let newer = edit(SHORT_SCREENPLAY, 'It said ten past.', 'It said quarter past.');
    newer = edit(newer, 'sound sure of himself', 'sound tired');
    newer = edit(newer, 'Headlights sweep the wet road. ', '');
    newer = edit(newer, '\nJUNE\nOf course.\n', '');
    const { layout, changes, marks } = compare(SHORT_SCREENPLAY, newer);
    expect(changes).toHaveLength(4);
    const block = (text: string) =>
      layout.pages.flatMap((page) => page.lines).find((line) => at(newer, line.span) === text)
        ?.blockIndex;
    expect(marks.stops).toEqual<ChangeStop[]>([
      {
        change: 0,
        kind: 'changed',
        page: 1,
        block: block('It said quarter past.') as number,
        lines: 1,
      },
      {
        change: 1,
        kind: 'unprinted',
        page: 1,
        block: block('EXT. ROAD - CONTINUOUS') as number,
        lines: 1,
      },
      {
        change: 2,
        kind: 'changed',
        page: 1,
        block: block('The bus does not stop.') as number,
        lines: 1,
      },
      {
        change: 3,
        kind: 'removed',
        page: 1,
        block: block('The bus does not stop.') as number,
        lines: 3,
      },
    ]);
  });

  test('reads the layout only', () => {
    const newer = edit(SHORT_SCREENPLAY, 'It said ten past.', 'It said quarter past.');
    const layout = lay(newer);
    const before = structuredClone(layout);
    markPages(layout, changesOf(SHORT_SCREENPLAY, newer));
    expect(layout).toEqual(before);
  });
});

describe('stepChange', () => {
  const stops: ChangeStop[] = [0, 1, 2].map((change) => ({
    change,
    kind: 'added',
    page: 1,
    block: 0,
    lines: 1,
  }));

  test('stepChange wraps both ways', () => {
    expect(stepChange(stops, null, 1)).toBe(0);
    expect(stepChange(stops, null, -1)).toBe(2);
    expect(stepChange(stops, 0, 1)).toBe(1);
    expect(stepChange(stops, 2, 1)).toBe(0);
    expect(stepChange(stops, 0, -1)).toBe(2);
    expect(stepChange(stops, 1, -1)).toBe(0);
  });

  test('stepChange is null with no stops', () => {
    expect(stepChange([], null, 1)).toBeNull();
    expect(stepChange([], 0, -1)).toBeNull();
  });
});
