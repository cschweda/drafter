import { parse } from '@drafter/fountain';
import { type Layout, paginate } from '@drafter/layout';
import { describe, expect, test } from 'vitest';
import {
  linesPerPage,
  rulerMarks,
  STRIP_DEPTHS,
  type Strip,
  type StripRow,
  sceneIndex,
  structureStrip,
} from '../src';
import { SAMPLE_STAGE_PLAY, screenplay, stagePlay } from './helpers';

// A scene before any section, an act with a beat that has no scenes, a beat with a section too deep
// to draw, and an act with no scenes at the end.
const SCRIPT = `Title: The Strip
Author: A. Writer

INT. HALL - DAY #12A#

[[Color: Blue]]

ANN
Hello.

# Act One

EXT. YARD - NIGHT

BEN
Hi.

### Empty beat

### A beat

INT. CAR - MOVING

Driving through the rain.

#### Too deep

INT. ROOF - NIGHT

Wind.

# Act Two
`;

const PLAY_META = '/* drafter\n{"v":1,"template":"stage-play-standard"}\n*/\n';

function stripOf(source: string, options: { pages?: boolean; play?: boolean } = {}) {
  const doc = parse(source);
  const template = options.play ? stagePlay : screenplay;
  const layout = options.pages === false ? null : paginate(doc, template);
  const index = sceneIndex(doc, template, layout);
  const perPage = linesPerPage(layout);
  return { index, layout, perPage, strip: structureStrip(index, perPage) };
}

const rowOf = (strip: Strip, kind: StripRow['kind'], depth: number | null = null) =>
  strip.rows.find((r) => r.kind === kind && r.depth === depth) as StripRow;
const labels = (row: StripRow) => row.blocks.map((b) => b.label);

describe('structureStrip', () => {
  test('gives a row per section depth the script uses, then the scenes', () => {
    const only = stripOf('# One\n\nINT. A - DAY\n\nx\n\n### Beat\n\nINT. B - DAY\n\ny\n').strip;
    expect(only.rows.map((r) => [r.kind, r.depth])).toEqual([
      ['section', 1],
      ['section', 3],
      ['scenes', null],
    ]);
  });

  test('draws no section deeper than ###', () => {
    const { strip } = stripOf(SCRIPT);
    expect(STRIP_DEPTHS).toBe(3);
    expect(strip.rows.map((r) => r.depth)).toEqual([1, 3, null]);
    expect(strip.rows.flatMap((r) => r.blocks).map((b) => b.label)).not.toContain('Too deep');
  });

  test("a stage play's acts are its one section row, and its ## lines are scenes", () => {
    const { strip, index } = stripOf(SAMPLE_STAGE_PLAY, { play: true });
    expect(strip.rows.map((r) => r.kind)).toEqual(['section', 'scenes']);
    expect(rowOf(strip, 'section', 1).blocks.map((b) => b.block)).toEqual(
      index.sections.map((s) => s.block),
    );
    expect(rowOf(strip, 'scenes').blocks.map((b) => b.block)).toEqual(
      index.scenes.map((s) => s.block),
    );
  });

  test('places a scene at its page and line, ending where the next starts', () => {
    const { strip, index, perPage } = stripOf(SCRIPT);
    expect(perPage).toBe(54);
    expect(strip.unit).toBe('pages');
    const blocks = rowOf(strip, 'scenes').blocks;
    const starts = index.scenes.map((s) => {
      const p = s.pages as NonNullable<typeof s.pages>;
      return p.page - 1 + (p.line - 1) / 54;
    });
    expect(blocks.map((b) => b.from)).toEqual(starts);
    expect(blocks[0]?.from).toBe(0); // page 1, line 1
    expect(blocks.slice(0, -1).map((b) => b.to)).toEqual(starts.slice(1));
    expect(strip.start).toBe(0);
  });

  test('the last scene ends at its start plus its eighths', () => {
    const { strip, index } = stripOf(SCRIPT);
    const last = rowOf(strip, 'scenes').blocks.at(-1);
    const roof = index.scenes.at(-1);
    expect(last?.to).toBeCloseTo((last?.from ?? 0) + (roof?.pages?.eighths ?? 0) / 8, 10);
    expect(strip.start + strip.length).toBeCloseTo(last?.to ?? Number.NaN, 10);
  });

  test("a section spans its first scene's start to its last scene's end", () => {
    const { strip } = stripOf(SCRIPT);
    const [, yard, car, roof] = rowOf(strip, 'scenes').blocks;
    const act = rowOf(strip, 'section', 1).blocks[0];
    expect(act?.label).toBe('Act One');
    expect([act?.from, act?.to]).toEqual([yard?.from, roof?.to]);
    const beat = rowOf(strip, 'section', 3).blocks[1];
    expect(beat?.label).toBe('A beat');
    expect([beat?.from, beat?.to]).toEqual([car?.from, roof?.to]);
  });

  test("a section with no scenes is a tick at the next scene's start", () => {
    const { strip } = stripOf(SCRIPT);
    const car = rowOf(strip, 'scenes').blocks[2];
    const empty = rowOf(strip, 'section', 3).blocks[0];
    expect(empty?.label).toBe('Empty beat');
    expect([empty?.from, empty?.to]).toEqual([car?.from, car?.from]);
    // With no scene after it, at the axis' end.
    const actTwo = rowOf(strip, 'section', 1).blocks[1];
    expect(actTwo?.label).toBe('Act Two');
    const end = rowOf(strip, 'scenes').blocks.at(-1)?.to;
    expect([actTwo?.from, actTwo?.to]).toEqual([end, end]);
  });

  test('scenes before the first section are in the scenes row only', () => {
    const { strip } = stripOf(SCRIPT);
    const hall = rowOf(strip, 'scenes').blocks[0];
    for (const row of strip.rows.filter((r) => r.kind === 'section')) {
      for (const b of row.blocks) expect(b.from).toBeGreaterThan(hall?.from ?? 0);
    }
    expect(rowOf(strip, 'section', 1).blocks[0]?.from).toBe(hall?.to);
  });

  test('labels a scene by number and heading, and a section by title', () => {
    const { strip } = stripOf(SCRIPT);
    expect(labels(rowOf(strip, 'scenes'))).toEqual([
      '12A INT. HALL - DAY',
      '2 EXT. YARD - NIGHT',
      '3 INT. CAR - MOVING',
      '4 INT. ROOF - NIGHT',
    ]);
    expect(labels(rowOf(strip, 'section', 1))).toEqual(['Act One', 'Act Two']);
    const play = stripOf(
      `#\n\n## The kitchen\n\nText.\n\n## The hall\n\nMore.\n\n##\n\nEnd.\n\n${PLAY_META}`,
      {
        play: true,
      },
    ).strip;
    expect(labels(rowOf(play, 'scenes'))).toEqual([
      '1 The kitchen',
      '2 The hall',
      '3 Untitled scene',
    ]);
    expect(labels(rowOf(play, 'section', 1))).toEqual(['Untitled section']);
  });

  test("carries a scene's color note, lowercased", () => {
    const { strip } = stripOf(SCRIPT);
    expect(rowOf(strip, 'scenes').blocks.map((b) => b.color)).toEqual(['blue', null, null, null]);
    for (const row of strip.rows.filter((r) => r.kind === 'section')) {
      for (const b of row.blocks) expect(b.color).toBeNull();
    }
  });

  test('sizes by words without pages', () => {
    const { strip, index } = stripOf(SCRIPT, { pages: false });
    expect(strip.unit).toBe('words');
    const blocks = rowOf(strip, 'scenes').blocks;
    const lengths = index.scenes.map((s) => Math.max(1, s.words));
    expect(blocks.map((b) => b.to - b.from)).toEqual(lengths);
    expect(blocks[0]?.from).toBe(0);
    expect(strip).toMatchObject({ start: 0, length: lengths.reduce((a, b) => a + b, 0) });
    // A line count, but a scene without pages: still words.
    const paged = stripOf(SCRIPT);
    const scenes = paged.index.scenes.map((s, i) => (i === 1 ? { ...s, pages: null } : s));
    expect(structureStrip({ ...paged.index, scenes }, 54).unit).toBe('words');
    // Pages, but no line count: words.
    expect(structureStrip(paged.index, null).unit).toBe('words');
    // A scene that starts where the next one does can't be sized by pages: words.
    const same = paged.index.scenes.map((s, i) =>
      i === 1 ? { ...s, pages: paged.index.scenes[2]?.pages ?? null } : s,
    );
    expect(structureStrip({ ...paged.index, scenes: same }, 54).unit).toBe('words');
  });

  test('has no rows without scenes', () => {
    for (const pages of [true, false]) {
      const { strip } = stripOf('# Act One\n\n## A sequence\n\nA note of action.\n', { pages });
      expect(strip.rows).toEqual([]);
      expect(strip.length).toBe(0);
    }
    expect(stripOf('').strip.rows).toEqual([]);
  });
});

describe('linesPerPage', () => {
  test("linesPerPage reads a body page's lines and is null without a layout", () => {
    const layout = paginate(parse(SCRIPT), screenplay);
    expect(linesPerPage(layout)).toBe(54);
    const line = { runs: [] } as unknown as Layout['pages'][number]['lines'][number];
    const page = (number: number, lines: number) =>
      ({ number, lines: Array.from({ length: lines }, () => line) }) as Layout['pages'][number];
    const fake = (pages: Layout['pages']) => ({ pages, index: [], diagnostics: [] }) as Layout;
    expect(linesPerPage(fake([page(0, 10), page(1, 50), page(2, 50)]))).toBe(50);
    expect(linesPerPage(fake([]))).toBeNull();
    expect(linesPerPage(null)).toBeNull();
    expect(linesPerPage(undefined)).toBeNull();
  });
});

describe('rulerMarks', () => {
  const long: Strip = { unit: 'pages', start: 0, length: 120, rows: [] };

  test('rulerMarks numbers pages about 40 px apart and ticks every page when there is room', () => {
    const wide = rulerMarks(long, 1200);
    expect(wide.filter((m) => m.numbered).map((m) => m.page)).toEqual([
      1,
      ...Array.from({ length: 24 }, (_, i) => (i + 1) * 5),
    ]);
    expect(wide.map((m) => m.page)).toEqual(Array.from({ length: 120 }, (_, i) => i + 1));
    expect(wide[0]?.at).toBe(0);
    expect(wide[9]?.at).toBeCloseTo(9 / 120, 10);

    const narrow = rulerMarks(long, 400);
    expect(narrow.map((m) => m.page)).toEqual([
      1,
      ...Array.from({ length: 12 }, (_, i) => (i + 1) * 10),
    ]);
    expect(narrow.every((m) => m.numbered)).toBe(true);

    // A short script numbers every page.
    const short = rulerMarks({ ...long, length: 6 }, 1200);
    expect(short.map((m) => [m.page, m.numbered])).toEqual(
      [1, 2, 3, 4, 5, 6].map((p) => [p, true]),
    );
  });

  test('rulerMarks is empty by words', () => {
    expect(rulerMarks({ unit: 'words', start: 0, length: 500, rows: [] }, 1200)).toEqual([]);
    expect(rulerMarks({ ...long, length: 0 }, 1200)).toEqual([]);
  });
});
