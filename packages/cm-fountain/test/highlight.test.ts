import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EditorState } from '@codemirror/state';
import * as api from '@drafter/cm-fountain';
import { fountainDecorations, fountainHighlighting, parsedDoc } from '@drafter/cm-fountain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fountainScript } from '../../../fixtures/generators/fountain';
import { BOM, decorate, found, lineClasses, marked, stateOf } from './helpers';

describe('the package', () => {
  it('exports the parse field and the highlighting', () => {
    expect(Object.keys(api).sort()).toEqual([
      'fountainDecorations',
      'fountainHighlighting',
      'parsedDoc',
    ]);
  });
});

describe('fountainDecorations', () => {
  it('classes each line by its block kind', () => {
    const script = [
      'INT. HALL - DAY',
      '',
      'MARGARET',
      '(quietly)',
      'Hello there.',
      '~La la la.',
      '',
      'She waits by the door.',
      'It rains.',
      '',
      'CUT TO:',
      '',
      '> THE END <',
      '',
      '# ACT ONE',
      '= A synopsis.',
      '',
      '===',
      '',
      '[[a note]]',
      '',
      '/* a boneyard */',
    ].join('\n');
    expect(lineClasses(script)).toEqual([
      ['INT. HALL - DAY', 'cm-f-scene_heading'],
      ['MARGARET', 'cm-f-character'],
      ['(quietly)', 'cm-f-parenthetical'],
      ['Hello there.', 'cm-f-dialogue'],
      ['~La la la.', 'cm-f-lyric'],
      ['She waits by the door.', 'cm-f-action'],
      ['It rains.', 'cm-f-action'],
      ['CUT TO:', 'cm-f-transition'],
      ['> THE END <', 'cm-f-centered'],
      ['# ACT ONE', 'cm-f-section'],
      ['= A synopsis.', 'cm-f-synopsis'],
      ['===', 'cm-f-page_break'],
      ['[[a note]]', 'cm-f-note'],
      ['/* a boneyard */', 'cm-f-boneyard'],
    ]);
  });

  it('puts every line of a block in its class, and none on a blank line', () => {
    expect(lineClasses('MARGARET\nOne.\nTwo.\n  \nThree.\n\n\nAction.')).toEqual([
      ['MARGARET', 'cm-f-character'],
      ['One.', 'cm-f-dialogue'],
      ['Two.', 'cm-f-dialogue'],
      ['  ', 'cm-f-dialogue'],
      ['Three.', 'cm-f-dialogue'],
      ['Action.', 'cm-f-action'],
    ]);
  });

  describe('emphasis', () => {
    it('marks emphasis runs', () => {
      expect(marked('**bold** and *it*', 'cm-f-b')).toEqual(['bold']);
      expect(marked('**bold** and *it*', 'cm-f-i')).toEqual(['it']);
      expect(marked('**bold** and *it*', 'cm-f-u')).toEqual([]);
      expect(marked('_under_ and plain', 'cm-f-u')).toEqual(['under']);
    });

    it('gives a run with two styles one mark for each', () => {
      expect(marked('***both*** here', 'cm-f-b')).toEqual(['both']);
      expect(marked('***both*** here', 'cm-f-i')).toEqual(['both']);
      expect(marked('_**all** three_', 'cm-f-u')).toEqual(['all', ' three']);
      expect(marked('_**all** three_', 'cm-f-b')).toEqual(['all']);
    });

    it('marks runs in dialogue, parentheticals, centered text, and lyrics, and nowhere else', () => {
      expect(marked('MARGARET\n(*softly*)\nHello, **you**.', 'cm-f-i')).toEqual(['softly']);
      expect(marked('MARGARET\n(*softly*)\nHello, **you**.', 'cm-f-b')).toEqual(['you']);
      expect(marked('> THE *END* <', 'cm-f-i')).toEqual(['END']);
      expect(marked('~la *la*', 'cm-f-i')).toEqual(['la']);
      // The parser reads no emphasis in a heading, so the asterisks are printed text.
      expect(marked('INT. *HALL* - DAY', 'cm-f-i')).toEqual([]);
    });

    it('keeps a note inside a run in the run', () => {
      expect(marked('**a [[n]] b**', 'cm-f-b')).toEqual(['a [[n]] b']);
      expect(marked('**a [[n]] b**', 'cm-f-note')).toEqual(['[[n]]']);
      expect(marked('**a [[n]] b**', 'cm-f-marker')).toEqual(['**', '**']);
    });
  });

  describe('markers', () => {
    it('dims markers and leaves printed text alone', () => {
      expect(marked('!SILENCE.', 'cm-f-marker')).toEqual(['!']);
      expect(marked('@McCLANE', 'cm-f-marker')).toEqual(['@']);
      expect(marked('INT. HALL - DAY #12#', 'cm-f-marker')).toEqual(['#12#']);
      expect(marked('**bold**', 'cm-f-marker')).toEqual(['**', '**']);
    });

    const cases: Array<[string, string[]]> = [
      ['***both***', ['***', '***']],
      ['*it* and _under_', ['*', '*', '_', '_']],
      ['.FLASHBACK', ['.']],
      ['# Act one', ['#']],
      ['### Deep', ['###']],
      ['= A synopsis.', ['=']],
      ['> THE END <', ['>', '<']],
      ['>CUT TO:', ['>']],
      ['~La la.', ['~']],
      ['===', ['===']],
      ['====', ['====']],
      ['MARGARET ^\nHello.', ['^']],
      ['@MARGARET ^\nHello.', ['@', '^']],
      ['EXT. YARD - NIGHT #A12.3#', ['#A12.3#']],
      ['A \\* literal star', ['\\']],
      ['Snake\\_case and \\*more\\*', ['\\', '\\', '\\']],
      ['*a *b* c*', ['*', '*', '*', '*']],
      ['_a _b_ c_', ['_', '_', '_', '_']],
      ['**a **b** c**', ['**', '**', '**', '**']],
      ['INT. HALL - DAY', []],
      ['Plain action.', []],
      ['MARGARET (V.O.)\n(softly)\nHello.', []],
      ['A [[note]] and /* gone */.', []],
    ];
    for (const [source, markers] of cases) {
      it(`marks ${JSON.stringify(markers)} in ${JSON.stringify(source)}`, () => {
        expect(marked(source, 'cm-f-marker')).toEqual(markers);
      });
    }

    it('marks the first backslash of an escaped backslash, which is the one that is not printed', () => {
      const state = stateOf('a \\\\ b');
      const markers = decorate(state).filter((deco) => deco.class === 'cm-f-marker');
      expect(markers).toEqual([{ from: 2, to: 3, class: 'cm-f-marker' }]);
    });

    it('never marks whitespace, whether it leads, trails, or sits between markers', () => {
      for (const source of [
        '  !LOUD  ',
        '\t@McCLANE\t',
        '#   Spaced   ',
        'INT. HALL - DAY   #12#   ',
      ]) {
        const state = stateOf(source);
        for (const deco of decorate(state).filter((d) => d.class === 'cm-f-marker')) {
          expect(state.sliceDoc(deco.from, deco.to)).toMatch(/^\S+$/);
        }
      }
      expect(marked('  !LOUD  ', 'cm-f-marker')).toEqual(['!']);
      expect(marked('#   Spaced   ', 'cm-f-marker')).toEqual(['#']);
    });

    it('does not mark the start of a note or a boneyard, which belong to the region', () => {
      expect(marked('A [[n]] B', 'cm-f-marker')).toEqual([]);
      expect(marked('A /* b */ C', 'cm-f-marker')).toEqual([]);
    });
  });

  describe('notes and boneyard', () => {
    it('classes notes and boneyard', () => {
      expect(marked('A [[n]] B', 'cm-f-note')).toEqual(['[[n]]']);
      expect(marked('A [[n]] B', 'cm-f-boneyard')).toEqual([]);
      expect(marked('A /* gone */ B', 'cm-f-boneyard')).toEqual(['/* gone */']);
      expect(marked('A [[one]] B [[two]] C', 'cm-f-note')).toEqual(['[[one]]', '[[two]]']);
    });

    it('covers a note or a boneyard that runs over several lines', () => {
      expect(marked('A [[one\ntwo]] B', 'cm-f-note')).toEqual(['[[one\ntwo]]']);
      const script = 'Before.\n\n/* first\n\nsecond\n*/\n\nAfter.';
      expect(marked(script, 'cm-f-boneyard')).toEqual(['/* first\n\nsecond\n*/']);
      // Each line of the boneyard is in its class, and the blank ones, which it holds, too.
      expect(lineClasses(script)).toEqual([
        ['Before.', 'cm-f-action'],
        ['/* first', 'cm-f-boneyard'],
        ['', 'cm-f-boneyard'],
        ['second', 'cm-f-boneyard'],
        ['*/', 'cm-f-boneyard'],
        ['After.', 'cm-f-action'],
      ]);
    });

    it('runs an unclosed boneyard to the end, and leaves an unclosed note as text', () => {
      expect(marked('Before.\n/* never closed\nmore', 'cm-f-boneyard')).toEqual([
        '/* never closed\nmore',
      ]);
      expect(marked('A [[ no close', 'cm-f-note')).toEqual([]);
      expect(marked('A [[ no close', 'cm-f-marker')).toEqual([]);
    });

    it('marks a note in the title page', () => {
      expect(marked('Title: A [[draft]] Film\n\nAction.', 'cm-f-note')).toEqual(['[[draft]]']);
    });

    it('marks a region that starts above the range, once', () => {
      const lines = Array.from({ length: 300 }, (_, i) => `line ${i}`);
      const state = stateOf(`/*\n${lines.join('\n')}\n*/\n\nAction.`);
      const from = state.doc.line(100).from;
      const to = state.doc.line(110).to;
      const found = decorate(state, [{ from, to }]);
      expect(found.filter((deco) => deco.class === 'cm-f-boneyard' && deco.from < deco.to)).toEqual(
        [{ from: 0, to: state.doc.line(302).to, class: 'cm-f-boneyard' }],
      );
      expect(found.filter((deco) => deco.from === deco.to)).toHaveLength(11);
    });
  });

  describe('the title page', () => {
    const title = 'Title: **Big** Film\nAuthor: A. Writer\n   and Co.\nDraft date: [[today]]\n';

    it('classes each title line, including its continuation lines', () => {
      expect(lineClasses(title)).toEqual([
        ['Title: **Big** Film', 'cm-f-title'],
        ['Author: A. Writer', 'cm-f-title'],
        ['   and Co.', 'cm-f-title'],
        ['Draft date: [[today]]', 'cm-f-title'],
      ]);
    });

    it('marks each field key through its colon, and nothing else', () => {
      expect(marked(title, 'cm-f-title-key')).toEqual(['Title:', 'Author:', 'Draft date:']);
    });

    it('marks emphasis and markers in a value, as it does elsewhere', () => {
      expect(marked(title, 'cm-f-b')).toEqual(['Big']);
      expect(marked(title, 'cm-f-marker')).toEqual(['**', '**']);
      expect(marked(title, 'cm-f-note')).toEqual(['[[today]]']);
    });

    it('decorates a title page that is the whole document', () => {
      const state = stateOf('Title: Alone');
      expect(state.field(parsedDoc).blocks).toHaveLength(0);
      expect(decorate(state)).toEqual([
        { from: 0, to: 0, class: 'cm-f-title' },
        { from: 0, to: 6, class: 'cm-f-title-key' },
      ]);
    });

    it('stops at the end of the title page', () => {
      expect(lineClasses('Title: X\n\nINT. HALL - DAY')).toEqual([
        ['Title: X', 'cm-f-title'],
        ['INT. HALL - DAY', 'cm-f-scene_heading'],
      ]);
    });

    it('takes a key that is spaced from its colon, or that follows a note', () => {
      expect(marked('Title : Spaced\nAuthor: A', 'cm-f-title-key')).toEqual(['Title :', 'Author:']);
      expect(marked('[[n]]Title: Noted', 'cm-f-title-key')).toEqual(['Title:']);
      expect(marked('[[n]]Title: Noted', 'cm-f-note')).toEqual(['[[n]]']);
      expect(marked('Ti[[n]]tle: Noted', 'cm-f-title-key')).toEqual(['Ti[[n]]tle:']);
      expect(marked('Title: A: B', 'cm-f-title-key')).toEqual(['Title:']);
    });

    it('decorates only the title lines in the range', () => {
      const state = stateOf(title);
      const second = state.doc.line(2);
      const some = decorate(state, [{ from: second.from, to: second.to }]);
      expect(some).toEqual([
        { from: second.from, to: second.from, class: 'cm-f-title' },
        { from: second.from, to: second.from + 'Author:'.length, class: 'cm-f-title-key' },
      ]);
    });

    it('decorates a continuation line on its own, with no key', () => {
      const state = stateOf(title);
      const third = state.doc.line(3);
      expect(decorate(state, [{ from: third.from + 2, to: third.from + 4 }])).toEqual([
        { from: third.from, to: third.from, class: 'cm-f-title' },
      ]);
    });
  });

  describe('the byte-order mark', () => {
    it('starts a title key after it, and does not dim it', () => {
      const state = stateOf(`${BOM}Title: X\n\nINT. HALL - DAY`);
      expect(decorate(state).filter((deco) => deco.class !== 'cm-f-scene_heading')).toEqual([
        { from: 0, to: 0, class: 'cm-f-title' },
        { from: 1, to: 7, class: 'cm-f-title-key' },
      ]);
    });

    it('classes the first line of a script that starts with one', () => {
      const state = stateOf(`${BOM}!SILENCE.\n\nINT. HALL - DAY`);
      const heading = state.doc.line(3).from;
      expect(decorate(state)).toEqual([
        { from: 0, to: 0, class: 'cm-f-action' },
        { from: 1, to: 2, class: 'cm-f-marker' },
        { from: heading, to: heading, class: 'cm-f-scene_heading' },
      ]);
    });

    it('is not dimmed on its own line either', () => {
      expect(marked(`${BOM}`, 'cm-f-marker')).toEqual([]);
      expect(marked(`${BOM}Plain.`, 'cm-f-marker')).toEqual([]);
      expect(lineClasses(`${BOM}INT. HALL - DAY`)).toEqual([
        [`${BOM}INT. HALL - DAY`, 'cm-f-scene_heading'],
      ]);
    });
  });

  describe('line breaks', () => {
    it('decorates a document with no line break at all', () => {
      const state = stateOf('Just one line.');
      expect(decorate(state)).toEqual([{ from: 0, to: 0, class: 'cm-f-action' }]);
    });

    it('decorates an empty document, with nothing', () => {
      const state = stateOf('');
      expect(decorate(state)).toEqual([]);
      expect(decorate(state, [])).toEqual([]);
    });

    it('lands on CodeMirror lines for text that came with CRLF endings', () => {
      const state = stateOf('INT. HALL - DAY\r\n\r\n!LOUD\r\nMore.\r\n');
      expect(state.doc.toString()).not.toContain('\r');
      expect(decorate(state)).toEqual([
        { from: 0, to: 0, class: 'cm-f-scene_heading' },
        { from: 17, to: 17, class: 'cm-f-action' },
        { from: 17, to: 18, class: 'cm-f-marker' },
        { from: 23, to: 23, class: 'cm-f-action' },
      ]);
    });

    it('uses CodeMirror positions when a separator leaves carriage returns in the lines', () => {
      const text = 'INT. HALL - DAY\r\n\r\n!LOUD\r\nMore.';
      for (const separator of ['\r\n', '\n']) {
        const state = stateOf(text, [EditorState.lineSeparator.of(separator)]);
        const lineStarts = decorate(state)
          .filter((deco) => deco.from === deco.to)
          .map((deco) => deco.from);
        for (const start of lineStarts) expect(state.doc.lineAt(start).from).toBe(start);
        expect(lineStarts).toHaveLength(3);
        // A carriage return is whitespace, so it is never dimmed.
        const dimmed = decorate(state).filter((deco) => deco.class === 'cm-f-marker');
        expect(dimmed.map((deco) => state.sliceDoc(deco.from, deco.to))).toEqual(['!']);
      }
    });
  });

  describe('the ranges', () => {
    const script = [
      'Title: A film',
      '',
      'INT. HALL - DAY',
      '',
      'MARGARET',
      'Hello, **you**.',
      '',
      'She waits [[and waits]].',
      '',
      '/* gone',
      '',
      'for good */',
      '',
      'EXT. YARD - NIGHT #2#',
    ].join('\n');

    it('decorates only the given range', () => {
      const scene = (n: number) => [
        `INT. ROOM ${n} - DAY`,
        '',
        `CHARACTER ${n}`,
        `A *line* of dialogue for ${n}.`,
        '',
      ];
      const state = stateOf(
        Array.from({ length: 1_000 }, (_, n) => scene(n))
          .flat()
          .join('\n'),
      );
      expect(state.doc.lines).toBe(5_000);
      const range = { from: state.doc.line(2_001).from, to: state.doc.line(2_050).to };

      const some = decorate(state, [range]);
      const lines = some.filter((deco) => deco.from === deco.to);
      expect(lines.length).toBeLessThan(120);
      expect(lines.length).toBeGreaterThan(20);
      for (const deco of some) {
        expect(deco.from).toBeGreaterThanOrEqual(range.from);
        expect(deco.to).toBeLessThanOrEqual(range.to);
      }
      // For comparison, the whole document has a line decoration for each of its 3,000 lines of text.
      expect(decorate(state).filter((deco) => deco.from === deco.to)).toHaveLength(3_000);
    });

    it('decorates the same as a whole-document call, restricted to the range', () => {
      const state = stateOf(script);
      const all = decorate(state);
      const line = state.doc.line(6);
      const some = decorate(state, [{ from: line.from + 3, to: line.from + 5 }]);
      // The whole line is decorated, since a mark can't be cut off in the middle.
      expect(some).toEqual(all.filter((deco) => deco.from >= line.from && deco.to <= line.to));
      expect(some.length).toBeGreaterThan(2);
    });

    it('decorates each block that the range touches, from where it starts', () => {
      const state = stateOf(script);
      const from = state.doc.line(5).from;
      const to = state.doc.line(8).to;
      const classes = decorate(state, [{ from, to }])
        .filter((deco) => deco.from === deco.to)
        .map((deco) => state.doc.lineAt(deco.from).text);
      expect(classes).toEqual(['MARGARET', 'Hello, **you**.', 'She waits [[and waits]].']);
    });

    it('treats a range inside a line as that line', () => {
      const state = stateOf(script);
      const line = state.doc.line(6);
      const inside = decorate(state, [{ from: line.from + 4, to: line.from + 4 }]);
      expect(inside).toEqual(decorate(state, [{ from: line.from, to: line.to }]));
      expect(inside.length).toBeGreaterThan(1);
    });

    it('merges overlapping, repeated, and unsorted ranges, and decorates each thing once', () => {
      const state = stateOf(script);
      const first = state.doc.line(3);
      const last = state.doc.line(8);
      const once = decorate(state, [{ from: first.from, to: last.to }]);
      expect(once.length).toBeGreaterThan(5);
      expect(
        decorate(state, [
          { from: last.from, to: last.to },
          { from: first.from, to: first.to },
          { from: first.from + 2, to: state.doc.line(6).to },
          { from: state.doc.line(5).from, to: last.to },
          { from: last.from + 1, to: last.from + 2 },
        ]),
      ).toEqual(once);
    });

    it('decorates once a region that lies across two ranges', () => {
      const state = stateOf(script);
      const first = state.doc.line(10);
      const last = state.doc.line(12);
      const found = decorate(state, [
        { from: first.from, to: first.to },
        { from: last.from, to: last.to },
      ]);
      expect(
        found.filter((deco) => deco.class === 'cm-f-boneyard' && deco.from < deco.to),
      ).toHaveLength(1);
      expect(found.filter((deco) => deco.from === deco.to)).toHaveLength(2);
    });

    it('keeps separate ranges separate', () => {
      const state = stateOf(script);
      const a = state.doc.line(3);
      const b = state.doc.line(14);
      const texts = decorate(state, [
        { from: a.from, to: a.to },
        { from: b.from, to: b.to },
      ])
        .filter((deco) => deco.from === deco.to)
        .map((deco) => state.doc.lineAt(deco.from).text);
      expect(texts).toEqual(['INT. HALL - DAY', 'EXT. YARD - NIGHT #2#']);
    });

    it('clamps ranges to the document, and ignores ones that make no sense', () => {
      const state = stateOf(script);
      const all = decorate(state);
      expect(all.length).toBeGreaterThan(10);
      expect(decorate(state, [{ from: -50, to: state.doc.length + 50 }])).toEqual(all);
      // A range that runs off the end is cut there; one wholly outside the text touches nothing.
      const last = state.doc.line(state.doc.lines);
      const tail = decorate(state, [{ from: last.from + 2, to: state.doc.length + 9 }]);
      expect(tail.length).toBeGreaterThan(0);
      expect(tail).toEqual(decorate(state, [{ from: last.from, to: last.to }]));
      expect(decorate(state, [{ from: state.doc.length, to: state.doc.length }])).toEqual(tail);
      expect(decorate(state, [{ from: state.doc.length + 5, to: state.doc.length + 9 }])).toEqual(
        [],
      );
      expect(decorate(state, [{ from: -9, to: -5 }])).toEqual([]);
      expect(decorate(state, [{ from: 30, to: 10 }])).toEqual([]);
      expect(decorate(state, [])).toEqual([]);
    });
  });

  describe('what the lines print', () => {
    // Every character that isn't whitespace is printed text, in a note or a boneyard, a title
    // field's key, or a marker, and no character is two of them. The printed text is read from
    // the parser's runs, not from the decorations, so the two are independent.
    function expectCovered(text: string) {
      const state = stateOf(text);
      const doc = state.field(parsedDoc);
      const decorations = decorate(state);
      const source = state.doc.toString();

      const cover = (...classes: string[]) => {
        const positions = new Set<number>();
        for (const deco of decorations) {
          if (deco.from === deco.to || !classes.includes(deco.class)) continue;
          for (let at = deco.from; at < deco.to; at++) positions.add(at);
        }
        return positions;
      };
      const markers = cover('cm-f-marker');
      const regions = cover('cm-f-note', 'cm-f-boneyard');
      const keys = cover('cm-f-title-key');

      const runs = [
        ...(doc.titlePage?.fields.flatMap((field) => field.runs.flat()) ?? []),
        ...doc.blocks.flatMap((block) => block.lines.flatMap((line) => line.inline)),
      ];
      const printed = runs
        .map((run) => run.text)
        .join('')
        .replace(/\s/g, '');

      let rest = '';
      for (let at = 0; at < source.length; at++) {
        const ch = source.charAt(at);
        if (/\s/.test(ch)) {
          expect(markers.has(at), `whitespace at ${at} is dimmed`).toBe(false);
        } else if (markers.has(at)) {
          expect(regions.has(at) || keys.has(at), `marker at ${at} is also a region or key`).toBe(
            false,
          );
        } else if (!regions.has(at) && !keys.has(at)) {
          rest += ch;
        }
      }
      expect(rest).toBe(printed);

      // One line decoration for each line of the title page and of the blocks, each at a line start.
      const lines = decorations.filter((deco) => deco.from === deco.to).map((deco) => deco.from);
      const expected =
        (doc.titlePage ? doc.titlePage.raw.split('\n').length : 0) +
        doc.blocks.reduce((sum, block) => sum + block.lines.length, 0);
      expect(lines).toHaveLength(expected);
      expect(new Set(lines).size).toBe(lines.length);
      for (const at of lines) expect(state.doc.lineAt(at).from).toBe(at);
    }

    it('are covered by the printed text, the regions, the keys, and the markers', () => {
      fc.assert(
        fc.property(fountainScript, (text) => {
          expectCovered(text);
        }),
        { numRuns: 200 },
      );
    });

    it('are covered in the fixtures and samples of the repository', () => {
      // Plain paths, since in jsdom the global URL is not the one that node:fs accepts.
      const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
      let scripts = 0;
      for (const dir of ['fixtures/classification', 'fixtures/layout', 'samples']) {
        for (const file of readdirSync(join(root, dir)).filter((n) => n.endsWith('.fountain'))) {
          expectCovered(readFileSync(join(root, dir, file), 'utf8'));
          scripts++;
        }
      }
      expect(scripts).toBeGreaterThan(40);
    });

    it('are covered on the strings that once broke the count of what a run prints', () => {
      // Emphasis inside emphasis of the same style leaves delimiters inside one run's span, and
      // an escaped character can sit beside a delimiter that was taken out.
      for (const text of [
        '*a *b* c*',
        '*_ *_*_*',
        '*_ *_*\\**',
        '*_**_*_*a*_',
        'a\\\\*b',
        '\\\\\\*x\\**',
        '**a **b** c** _d _e_ f_',
        '*a [[n]] *b* c*',
      ]) {
        expectCovered(text);
      }
    });

    it('are covered on text built from the characters that mean something', () => {
      const syntax = fc.string({
        unit: fc.constantFrom(
          ...'*_\\[]/ \n\n!@#.>~=():^aB1-\t'.split(''),
          '\r',
          '\r\n',
          BOM,
          '**',
          '[[',
          ']]',
          '/*',
          '*/',
          'Title: ',
          '   ',
          'INT. ',
        ),
        maxLength: 60,
      });
      fc.assert(
        fc.property(syntax, (text) => {
          expectCovered(text);
        }),
        { numRuns: 500 },
      );
    });
  });
});

describe('fountainHighlighting', () => {
  it('brings the parse field with it', () => {
    const state = EditorState.create({
      doc: 'INT. HALL - DAY',
      extensions: [fountainHighlighting()],
    });
    expect(state.field(parsedDoc).blocks).toHaveLength(1);
  });

  it('can be used beside the field', () => {
    const state = EditorState.create({
      doc: 'INT. HALL - DAY',
      extensions: [parsedDoc, fountainHighlighting(), fountainHighlighting()],
    });
    expect(state.field(parsedDoc).blocks).toHaveLength(1);
    expect(found(fountainDecorations(state, [{ from: 0, to: 15 }]))).toHaveLength(1);
  });
});
