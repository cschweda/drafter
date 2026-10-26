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
import fc from 'fast-check';
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
      regions: [],
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

  it('needs every line of a title page to be a key line or a continuation', () => {
    const doc = parse('Title: The Call\nINT. HOUSE: KITCHEN - DAY\n\nMargaret waits.\n');
    expect(doc.titlePage).toBeNull();
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

  it('marks a line holding only a note as transparent, but not a two-space line', () => {
    const cue = parse("MARGARET\n[[She doesn't look up.]]\nYou said you'd call.\n").blocks[0];
    expect(cue?.lines.map((l) => l.transparent)).toEqual([false, true]);
    const speech = parse('MARGARET\nTen.\n  \nEleven.\n').blocks[1];
    expect(speech?.lines.map((l) => l.transparent)).toEqual([false, false, false]);
  });

  it('parses emphasis in title-page values, inline and continued', () => {
    const fields = parse('Title:\n    _**THE CALL**_\nAuthor: *A.* Writer\n\nAction.\n').titlePage
      ?.fields;
    const styled = (runs: InlineRun[][] | undefined) =>
      runs?.map((line) => line.map((r) => [r.text, style(r)]));
    expect(styled(fields?.[0]?.runs)).toEqual([[['THE CALL', 'bu']]]);
    expect(styled(fields?.[1]?.runs)).toEqual([
      [
        ['A.', 'i'],
        [' Writer', ''],
      ],
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

  it('keeps an opener inside a closed pair literal, even when a later closer could match it', () => {
    expect(runsOf('_x *y_ z*')).toEqual([
      ['x *y', 'u'],
      [' z*', ''],
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

describe('regions', () => {
  it('lists notes and boneyard in source order', () => {
    expect(parse('A [[n1]] B\n\n/* bone */\n').regions).toEqual([
      { kind: 'note', span: { from: 2, to: 8 }, closed: true },
      { kind: 'boneyard', span: { from: 12, to: 22 }, closed: true },
    ]);
  });

  it('runs an unclosed boneyard to the end and leaves an unclosed note out', () => {
    expect(parse('[[open\n\nText /* to the end').regions).toEqual([
      { kind: 'boneyard', span: { from: 13, to: 26 }, closed: false },
    ]);
  });

  it('spans line breaks, and a boneyard spans blank lines too', () => {
    expect(parse('[[one\ntwo]]\n\n/* x\n\ny */\n').regions).toEqual([
      { kind: 'note', span: { from: 0, to: 11 }, closed: true },
      { kind: 'boneyard', span: { from: 13, to: 23 }, closed: true },
    ]);
  });

  it('stay in source order, never overlap, and keep their delimiters, for any text', () => {
    // Mostly the pre-pass's own tokens, so unclosed and touching markers turn up often.
    const tokens = ['[[', ']]', '/*', '*/', '[', '/', '*', '\n', '\n\n', '  ', ' ', 'a'];
    const text = fc
      .array(fc.constantFrom(...tokens), { maxLength: 30, size: 'max' })
      .map((parts) => parts.join(''));
    fc.assert(
      fc.property(text, (source) => {
        let end = 0;
        for (const { kind, span, closed } of parse(source).regions) {
          expect(span.from).toBeGreaterThanOrEqual(end);
          expect(span.to).toBeGreaterThan(span.from);
          expect(span.to).toBeLessThanOrEqual(source.length);
          expect(source.startsWith(kind === 'note' ? '[[' : '/*', span.from)).toBe(true);
          const closer = kind === 'note' ? ']]' : '*/';
          if (closed) {
            // It ends at the first closer after its opener, which is its last two characters.
            expect(source.indexOf(closer, span.from + 2)).toBe(span.to - 2);
          } else {
            // Only a boneyard can be left open: no closer follows, and it runs to the end.
            expect(kind).toBe('boneyard');
            expect(source.indexOf(closer, span.from + 2)).toBe(-1);
            expect(span.to).toBe(source.length);
          }
          end = span.to;
        }
      }),
      { numRuns: 1_000 },
    );
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

  it('leaves the regions out, so the format stays as it was', () => {
    const json = toJSON(parse('A [[n]]\n\n/* b */\n'));
    expect(Object.keys(json)).toEqual([
      'v',
      'titlePage',
      'blocks',
      'trailing',
      'meta',
      'diagnostics',
    ]);
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
