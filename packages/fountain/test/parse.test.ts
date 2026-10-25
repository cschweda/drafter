import { readFileSync } from 'node:fs';
import {
  blockAt,
  characters,
  type InlineRun,
  locations,
  parse,
  print,
  toJSON,
} from '@drafter/fountain';
import { describe, expect, it } from 'vitest';

const style = (r: InlineRun) =>
  `${r.bold ? 'b' : ''}${r.italic ? 'i' : ''}${r.underline ? 'u' : ''}`;
const runsOf = (source: string, line = 0) =>
  (parse(source).blocks[0]?.lines[line]?.inline ?? []).map((r) => [r.text, style(r)]);

describe('document structure', () => {
  it('parses an empty string to an empty document', () => {
    expect(parse('')).toMatchObject({
      titlePage: null,
      blocks: [],
      trailing: '',
      meta: null,
      diagnostics: [],
    });
  });

  it('keeps the final newline in doc.trailing, not in the last block', () => {
    const doc = parse('Margaret waits.\n');
    expect(doc.trailing).toBe('\n');
    expect(doc.blocks[0]?.lines.map((l) => l.raw)).toEqual(['Margaret waits.']);
  });

  it('keeps the blank lines between blocks in the next block’s leading', () => {
    expect(parse('A.\n\n\nB.\n').blocks[1]?.leading).toBe('\n\n\n');
  });

  it('records spans as offsets into the source', () => {
    const doc = parse('INT. KITCHEN - NIGHT\n\nMargaret waits.\n');
    expect(doc.blocks.map((b) => b.span)).toEqual([
      { from: 0, to: 20 },
      { from: 22, to: 37 },
    ]);
  });

  it('does not mistake a FADE IN: opening for a title page', () => {
    const doc = parse('FADE IN:\n\nINT. KITCHEN - NIGHT\n');
    expect(doc.titlePage).toBeNull();
    expect(doc.blocks.map((b) => b.kind)).toEqual(['action', 'scene_heading']);
  });

  it('keeps unknown title-page keys', () => {
    const doc = parse('Title: The Call\nRevision: Blue\n\nMargaret waits.\n');
    expect(doc.titlePage?.fields).toEqual([
      expect.objectContaining({ key: 'Title', value: ['The Call'] }),
      expect.objectContaining({ key: 'Revision', value: ['Blue'] }),
    ]);
    expect(doc.titlePage?.raw).toBe('Title: The Call\nRevision: Blue');
  });

  it('does not let a lone forced cue change how the next block reads', () => {
    expect(parse('@NARRATOR\n\nINT. KITCHEN - NIGHT\n').blocks.map((b) => b.kind)).toEqual([
      'character',
      'scene_heading',
    ]);
  });

  it('gives page breaks no semantic data', () => {
    expect(parse('===\n').blocks[0]?.sem).toBeNull();
  });

  it('names a block of notes and boneyard after its first region', () => {
    expect(parse('[[A note.]] /* A cut line. */\n').blocks.map((b) => b.kind)).toEqual(['note']);
    expect(parse('/* A cut line. */ [[A note.]]\n').blocks.map((b) => b.kind)).toEqual([
      'boneyard',
    ]);
  });

  it('gives a note block its text without the brackets', () => {
    expect(parse('[[Check the clock.]]\n').blocks[0]?.sem).toEqual({ text: 'Check the clock.' });
  });
});

describe('inline emphasis', () => {
  it('splits a line into styled runs and keeps escaped markers literal', () => {
    expect(runsOf('Margaret is *very* **tired** and _alone_. \\*Not\\* bold.')).toEqual([
      ['Margaret is ', ''],
      ['very', 'i'],
      [' ', ''],
      ['tired', 'b'],
      [' and ', ''],
      ['alone', 'u'],
      ['. *Not* bold.', ''],
    ]);
  });

  it('reads triple asterisks as bold italic', () => {
    expect(runsOf('A ***big*** deal.')).toEqual([
      ['A ', ''],
      ['big', 'bi'],
      [' deal.', ''],
    ]);
  });

  it('leaves markers that cannot open or close as text', () => {
    expect(runsOf('Rates rise 5 * 3 and _ stays.')).toEqual([
      ['Rates rise 5 * 3 and _ stays.', ''],
    ]);
  });

  it('never opens emphasis on a marker followed by a space, even if one closes later', () => {
    expect(runsOf('Between 5 * 3 and done*.')).toEqual([['Between 5 * 3 and done*.', '']]);
  });

  it('never carries emphasis across a line break', () => {
    const source = 'She is *very\ntired* today.';
    expect(runsOf(source, 0)).toEqual([['She is *very', '']]);
    expect(runsOf(source, 1)).toEqual([['tired* today.', '']]);
  });

  it('maps each run back to its place in the source', () => {
    const source = 'Margaret is *very* tired.';
    const run = parse(source).blocks[0]?.lines[0]?.inline?.[1];
    expect(run?.text).toBe('very');
    expect(run?.span).toEqual({ from: 13, to: 17 });
  });
});

describe('queries', () => {
  const doc = parse('INT. KITCHEN - NIGHT\n\nMargaret waits.\n');

  it('finds the block at an offset, inclusive of the line end', () => {
    expect(blockAt(doc, 0)?.index).toBe(0);
    expect(blockAt(doc, 20)?.index).toBe(0);
    expect(blockAt(doc, 21)).toBeNull();
    expect(blockAt(doc, 22)?.index).toBe(1);
    expect(blockAt(doc, 999)).toBeNull();
  });

  it('counts characters by name and remembers the last cue', () => {
    const script = parse('MARGARET\nHi.\n\nDANNY (O.S.)\nMom?\n\nMARGARET\nOf course.\n');
    expect(characters(script)).toEqual([
      { name: 'MARGARET', count: 2, lastSpan: { from: 33, to: 41 } },
      { name: 'DANNY', count: 1, lastSpan: { from: 14, to: 26 } },
    ]);
  });

  it('counts scene locations', () => {
    const script = parse('INT. KITCHEN - NIGHT\n\nEXT. PORCH - DAY\n\nINT. KITCHEN - LATER\n');
    expect(locations(script)).toEqual([
      { text: 'KITCHEN', count: 2 },
      { text: 'PORCH', count: 1 },
    ]);
  });
});

describe('toJSON', () => {
  it('materializes semantic data and leaves out the source', () => {
    const json = toJSON(parse('Title: The Call\n\nINT. KITCHEN - NIGHT #4#\n'));
    expect(json.v).toBe(1);
    expect('source' in json).toBe(false);
    expect(json.blocks[0]).toMatchObject({
      kind: 'scene_heading',
      forced: false,
      lines: ['INT. KITCHEN - NIGHT #4#'],
      sem: { number: '4', location: 'KITCHEN', time: 'NIGHT' },
    });
    expect(JSON.parse(JSON.stringify(json))).toEqual(json);
  });
});

describe('diagnostics', () => {
  it('points an unclosed note at its opening brackets', () => {
    expect(parse('A [[note\n\nB\n').diagnostics).toEqual([
      expect.objectContaining({
        code: 'unclosed-note',
        severity: 'warning',
        span: { from: 2, to: 4 },
      }),
    ]);
  });

  it('lists diagnostics in document order, whichever pass found them', () => {
    const doc = parse(
      'INT. KITCHEN - NIGHT\nMargaret waits.\n\nShe hums. [[fix this\n\nThe end.\n',
    );
    expect(doc.diagnostics.map((d) => d.code)).toEqual(['heading-blank-after', 'unclosed-note']);
  });

  it('treats an unclosed boneyard as an error', () => {
    expect(parse('A\n\n/* cut').diagnostics).toEqual([
      expect.objectContaining({
        code: 'unclosed-boneyard',
        severity: 'error',
        span: { from: 3, to: 5 },
      }),
    ]);
  });
});

describe('the samples', () => {
  for (const file of ['screenplay', 'stage-play']) {
    const source = readFileSync(
      new URL(`../../../samples/${file}.fountain`, import.meta.url),
      'utf8',
    );
    const doc = parse(source);

    it(`${file}: round-trips and has no errors`, () => {
      expect(print(doc)).toBe(source);
      expect(doc.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    });
  }

  it('stage play: picks its template from the metadata block', () => {
    const source = readFileSync(
      new URL('../../../samples/stage-play.fountain', import.meta.url),
      'utf8',
    );
    expect(parse(source).meta).toEqual({ v: 1, template: 'stage-play-standard' });
  });
});
