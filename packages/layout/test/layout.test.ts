import { readFileSync } from 'node:fs';
import { parse } from '@drafter/fountain';
import {
  type Layout,
  type PaginateOptions,
  paginate,
  UnsupportedTemplateError,
} from '@drafter/layout';
import { builtins, loadTemplate, type Template } from '@drafter/templates';
import { describe, expect, it } from 'vitest';
import { filler, firstPart, style, text } from './helpers';

const screenplay = builtins['us-screenplay'] as Template;
const play = builtins['stage-play-standard'] as Template;
const lay = (source: string, template = screenplay, opts?: PaginateOptions) =>
  paginate(parse(source), template, opts);
const extend = (patch: Record<string, unknown>) =>
  loadTemplate({ id: 'test', name: 'Test', extends: 'us-screenplay', ...patch });
const page = (layout: Layout, n: number) => {
  const found = layout.pages.find((p) => p.number === n);
  if (!found) throw new Error(`no page ${n}`);
  return found;
};
const texts = (layout: Layout, n: number, count: number) =>
  page(layout, n)
    .lines.slice(0, count)
    .map((line) => text(line));

describe('pages', () => {
  it('gives every page exactly the body height, padded with blank lines', () => {
    const layout = lay(filler(60));
    expect(layout.pages.map((p) => [p.number, p.lines.length])).toEqual([
      [1, 54],
      [2, 54],
    ]);
    expect(text(page(layout, 2).lines[5])).toBe('F line 60: the room is quiet.');
    expect(page(layout, 2).lines[6]).toMatchObject({
      synthetic: 'blank',
      runs: [],
      blockIndex: -1,
    });
  });

  it('returns no pages for an empty script', () => {
    expect(lay('')).toEqual({ pages: [], index: [], diagnostics: [] });
  });

  it('is deterministic', () => {
    for (const [file, template] of [
      ['screenplay', screenplay],
      ['stage-play', play],
    ] as const) {
      const source = readFileSync(
        new URL(`../../../samples/${file}.fountain`, import.meta.url),
        'utf8',
      );
      const first = lay(source, template);
      expect(first.pages.length).toBeGreaterThan(0);
      expect(lay(source, template)).toEqual(first);
    }
  });

  it('rejects a proportional or non-12-point font', () => {
    const proportional = extend({ page: { font: { monospace: false } } });
    expect(() => lay('Action.', proportional)).toThrow(UnsupportedTemplateError);
    expect(() => lay('Action.', extend({ page: { font: { pt: 10 } } }))).toThrow(
      UnsupportedTemplateError,
    );
  });
});

describe('lines', () => {
  it('wraps each source line at its role width', () => {
    const layout = lay(Array(30).fill('word').join(' '));
    expect(texts(layout, 1, 4)).toEqual([
      Array(12).fill('word').join(' '),
      Array(12).fill('word').join(' '),
      Array(6).fill('word').join(' '),
      '',
    ]);
  });

  it('uppercases a role with case upper, keeping emphasis', () => {
    const layout = lay('She is *very* tired.', extend({ roles: { action: { case: 'upper' } } }));
    expect(page(layout, 1).lines[0]?.runs.map((r) => [r.text, style(r)])).toEqual([
      ['SHE IS ', ''],
      ['VERY', 'i'],
      [' TIRED.', ''],
    ]);
    expect(texts(lay('.kitchen at night'), 1, 1)).toEqual(['KITCHEN AT NIGHT']);
  });

  it('turns tabs into four spaces and keeps leading space in action', () => {
    expect(texts(lay('\tTabbed.\n  Spaced.'), 1, 2)).toEqual(['    Tabbed.', '  Spaced.']);
  });

  it("adds a role's type style to every run", () => {
    const layout = lay('A **quiet** room.', play);
    expect(page(layout, 1).lines[0]?.runs.map((r) => [r.text, style(r)])).toEqual([
      ['A ', 'i'],
      ['quiet', 'bi'],
      [' room.', 'i'],
    ]);
  });

  it('prints nothing for a line that holds only a note', () => {
    expect(texts(lay('MARGARET\nHello.\n[[A note.]]\nGoodbye.'), 1, 4)).toEqual([
      'MARGARET',
      'Hello.',
      'Goodbye.',
      '',
    ]);
  });

  it("marks a role's prefix and suffix as added text", () => {
    const layout = lay('CUT TO:', extend({ roles: { transition: { prefix: '[', suffix: ']' } } }));
    const line = page(layout, 1).lines[0];
    expect(line?.col).toBe(51);
    expect(line?.runs.map((r) => [r.text, r.synthetic === true])).toEqual([
      ['[', true],
      ['CUT TO:', false],
      [']', true],
    ]);
  });

  it('double-spaces a role with lineSpacing 2', () => {
    const layout = lay('MARGARET\nOne.\nTwo.', extend({ roles: { dialogue: { lineSpacing: 2 } } }));
    expect(texts(layout, 1, 4)).toEqual(['MARGARET', 'One.', '', 'Two.']);
  });

  it('collapses space after with the next space before, taking the larger', () => {
    const layout = lay('One.\n\nTwo.', extend({ roles: { action: { spaceAfter: 3 } } }));
    expect(layout.index[1]).toEqual({ page: 1, line: 4 });
  });
});

describe('page filling', () => {
  it('splits a block that does not fit, unless the role keeps it together', () => {
    const source = `${filler(50)}\n\n${filler(10, 'S')}`;
    expect(lay(source).index[1]).toEqual({ page: 1, line: 51 });
    expect(lay(source, extend({ roles: { action: { keepTogether: true } } })).index[1]).toEqual({
      page: 2,
      line: 0,
    });
  });

  it('maps an omitted block to the next printed line', () => {
    const layout = lay('Action one.\n\n[[A note.]]\n\nAction two.');
    expect(layout.index).toEqual([
      { page: 1, line: 0 },
      { page: 1, line: 2 },
      { page: 1, line: 2 },
    ]);
  });

  it('maps omitted blocks at the end to the last printed line', () => {
    expect(lay('Action one.\n\n[[A note.]]').index).toEqual([
      { page: 1, line: 0 },
      { page: 1, line: 0 },
    ]);
  });
});

describe('dialogue', () => {
  it('never ends a page on a parenthetical', () => {
    const speech = 'MARGARET\nOne.\nTwo.\n(beat)\nThree.\nFour.\nFive.\nSix.';
    const layout = lay(`${filler(48)}\n\n${speech}`);
    expect(texts(layout, 1, 54).slice(49)).toEqual(['MARGARET', 'One.', 'Two.', '(MORE)', '']);
    expect(texts(layout, 2, 3)).toEqual(["MARGARET (CONT'D)", '(beat)', 'Three.']);
  });

  it('splits a speech longer than a page as often as it needs', () => {
    const lines = Array.from({ length: 120 }, (_, i) => `Line ${i + 1}.`);
    const layout = lay(`MARGARET\n${lines.join('\n')}`);
    expect(layout.pages.length).toBe(3);
    expect(text(page(layout, 1).lines[53])).toBe('(MORE)');
    expect(texts(layout, 2, 1)).toEqual(["MARGARET (CONT'D)"]);
    expect(text(page(layout, 2).lines[53])).toBe('(MORE)');
    expect(texts(layout, 3, 18).slice(16)).toEqual(['Line 120.', '']);
  });

  it('never splits right after a blank line in a speech', () => {
    const layout = lay(`${filler(48)}\n\nMARGARET\nOne.\nTwo.\n  \nThree.\nFour.`);
    expect(texts(layout, 1, 54).slice(49)).toEqual(['MARGARET', 'One.', 'Two.', '(MORE)', '']);
    expect(texts(layout, 2, 3)).toEqual(["MARGARET (CONT'D)", 'Three.', 'Four.']);
  });

  it('drops a double-spacing blank from the top of a continued speech', () => {
    const lines = Array.from({ length: 40 }, (_, i) => `Line ${i + 1}.`);
    const template = extend({ roles: { dialogue: { lineSpacing: 2 } } });
    const layout = lay(`MARGARET\n${lines.join('\n')}`, template);
    expect(texts(layout, 1, 54).slice(51)).toEqual(['Line 26.', '(MORE)', '']);
    expect(texts(layout, 2, 3)).toEqual(["MARGARET (CONT'D)", 'Line 27.', '']);
  });

  it('splits a speech wherever it can when the thresholds leave nowhere on a whole page', () => {
    const aside = Array.from({ length: 49 }, (_, i) => `aside ${i + 2}`);
    const speech = ['MARGARET', 'Hello.', '(aside 1', ...aside, 'aside 51)', 'Goodbye.', 'Again.'];
    const layout = lay(speech.join('\n'));
    expect(texts(layout, 1, 4)).toEqual(['MARGARET', 'Hello.', '(MORE)', '']);
    expect(texts(layout, 2, 54).slice(51)).toEqual(['aside 51)', 'Goodbye.', 'Again.']);
  });

  it("leaves (CONT'D) off when the template says so", () => {
    const layout = lay('MARGARET\nOne.\n\nShe waits.\n\nMARGARET\nTwo.', play);
    expect(text(firstPart(layout, 3))).toBe('MARGARET');
  });

  it("doesn't add (CONT'D) to a cue that already has it", () => {
    const layout = lay("MARGARET\nOne.\n\nShe waits.\n\nMARGARET (cont'd)\nTwo.");
    expect(text(firstPart(layout, 3))).toBe("MARGARET (CONT'D)");
  });
});

describe('dual dialogue', () => {
  it('lays out a ^ with no partner normally, with a diagnostic', () => {
    const layout = lay('MARGARET ^\nHello.');
    expect(firstPart(layout, 0)?.col).toBe(22);
    expect(layout.diagnostics).toEqual([
      expect.objectContaining({ code: 'unpaired-dual', span: { from: 0, to: 10 } }),
    ]);
  });

  it('pairs a ^ only with a speech that is not already paired', () => {
    const layout = lay('MARGARET\nOne.\n\nDANNY ^\nTwo.\n\nHANS ^\nThree.');
    expect([0, 2, 4].map((b) => [layout.index[b]?.line, firstPart(layout, b)?.col])).toEqual([
      [0, 8],
      [0, 40],
      [3, 22],
    ]);
    expect(layout.diagnostics.map((d) => d.code)).toEqual(['unpaired-dual']);
  });

  it('falls back to one speech after the other when the pair is taller than a page', () => {
    const lines = Array.from({ length: 60 }, (_, i) => `Line ${i + 1}.`).join('\n');
    const layout = lay(`MARGARET\n${lines}\n\nDANNY ^\n${lines}`);
    expect(firstPart(layout, 0)?.col).toBe(22);
    expect(text(page(layout, 1).lines[53])).toBe('(MORE)');
    expect(layout.diagnostics.map((d) => d.code)).toEqual(['dual-overflow']);
  });
});

describe('title page', () => {
  const source = [
    'Title: The Call',
    'Credit: Written by',
    'Author: A. Writer',
    'Source: Based on a dream',
    'Draft date: 1 May 2026',
    'Contact: A. Writer',
    '    555-0100',
    '',
    'INT. KITCHEN - NIGHT',
  ].join('\n');

  it('centers the title, credit, author, and source from line 22 of the page', () => {
    const title = page(lay(source), 0);
    expect(
      title.lines.slice(16, 23).map((line) => [text(line), line.col, line.synthetic ?? null]),
    ).toEqual([
      ['The Call', 26, 'title'],
      ['', 0, 'blank'],
      ['Written by', 25, 'title'],
      ['', 0, 'blank'],
      ['A. Writer', 25, 'title'],
      ['', 0, 'blank'],
      ['Based on a dream', 22, 'title'],
    ]);
    expect(title.lines.length).toBe(54);
    expect(title.pageNumber).toBeUndefined();
  });

  it('puts the contact bottom left and the draft date bottom right', () => {
    const title = page(lay(source), 0);
    expect(title.lines.slice(52).map((line) => [text(line), line.col])).toEqual([
      ['A. Writer', 0],
      ['555-0100', 0],
    ]);
    expect(title.lines[53]?.right).toMatchObject({ col: 50, synthetic: 'title' });
    expect(text(title.lines[53]?.right)).toBe('1 May 2026');
  });

  it('skips a field with no value', () => {
    const title = page(lay('Title: The Call\nCredit:\nAuthor: A. Writer\n\nAction.'), 0);
    expect(title.lines.slice(16, 19).map((line) => text(line))).toEqual([
      'The Call',
      '',
      'A. Writer',
    ]);
  });

  it('starts the script on page 1 either way', () => {
    expect(lay(source).pages.map((p) => p.number)).toEqual([0, 1]);
    expect(lay('Notes: Call the actors.\n\nAction.').pages.map((p) => p.number)).toEqual([1]);
  });
});

describe('page and scene numbers', () => {
  it('numbers pages from firstNumbered, flush with the right margin', () => {
    const layout = lay(filler(118));
    expect(layout.pages.map((p) => p.pageNumber)).toEqual([
      undefined,
      { text: '2.', line: 3, col: 58 },
      { text: '3.', line: 3, col: 58 },
    ]);
    const unnumbered = lay(filler(118), extend({ page: { numbering: { position: 'none' } } }));
    expect(unnumbered.pages.map((p) => p.pageNumber)).toEqual([undefined, undefined, undefined]);
  });

  const scenes = 'INT. A - DAY\n\nOne.\n\nINT. B - DAY #12A#\n\nTwo.\n\nINT. C - DAY\n\nThree.';

  it('numbers scenes by position, keeping locked numbers, when asked', () => {
    const numbered = page(lay(scenes, screenplay, { sceneNumbers: true }), 1);
    const expected = [
      { line: 0, text: '1' },
      { line: 5, text: '12A' },
      { line: 10, text: '3' },
    ];
    expect(numbered.sceneNumbersLeft).toEqual(expected);
    expect(numbered.sceneNumbersRight).toEqual(expected);
    expect(page(lay(scenes), 1).sceneNumbersLeft).toEqual([]);
  });

  it("doesn't number a scene heading the template disables", () => {
    const layout = lay('INT. KITCHEN - NIGHT\n\nDANNY\nHi.', play, { sceneNumbers: true });
    expect(page(layout, 1).sceneNumbersLeft).toEqual([]);
  });

  it('lets the option override the template', () => {
    const template = extend({ sceneNumbers: { enabled: true } });
    expect(page(lay(scenes, template), 1).sceneNumbersLeft.length).toBe(3);
    expect(page(lay(scenes, template, { sceneNumbers: false }), 1).sceneNumbersLeft).toEqual([]);
  });
});

describe('diagnostics', () => {
  it('lists them in document order, whichever pass found them', () => {
    const layout = lay('MARGARET ^\nHello.\n\nINT. KITCHEN - NIGHT', play);
    expect(layout.diagnostics.map((d) => d.code)).toEqual(['unpaired-dual', 'disabled-element']);
  });
});
