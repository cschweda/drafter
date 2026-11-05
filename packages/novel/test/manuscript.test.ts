import { readFileSync } from 'node:fs';
import { parseMarkdown } from '@drafter/markdown';
import { describe, expect, test } from 'vitest';
import {
  type ManuscriptBlock,
  manuscriptOf,
  novelStructure,
  resolveDetails,
  wordsLabel,
} from '../src';

const book = readFileSync(new URL('./fixtures/manuscript-book.md', import.meta.url), 'utf8');

function make(source: string, kept = {}) {
  return manuscriptOf(source, parseMarkdown(source), resolveDetails(source, 'File', kept));
}

const text = (b: ManuscriptBlock) =>
  b.kind === 'paragraph' ? b.runs.map((r) => r.text).join('') : '';

describe('wordsLabel', () => {
  test.each([
    [0, '0 words'],
    [1, 'about 100 words'],
    [449, 'about 400 words'],
    [450, 'about 500 words'],
    [999, 'about 1,000 words'],
    [87_499, 'about 87,000 words'],
    [87_500, 'about 88,000 words'],
  ])('%i', (n, label) => expect(wordsLabel(n)).toBe(label));
});

describe('resolveDetails', () => {
  test('defaults', () => {
    const d = resolveDetails(book, 'File', {});
    expect(d.title).toBe('The Salt Road');
    expect(d.byline).toBe('');
    expect(d.legalName).toBe('');
    expect(d.surname).toBe('');
    expect(d.shortTitle).toBe('THE SALT ROAD');
    expect(d.font).toBe('times');
    expect(d.contact).toEqual([]);
  });
  test('falls back to the file title when every heading is a number', () => {
    expect(resolveDetails('# Chapter 1\n\ntext\n\n# IV\n', 'My Book', {}).title).toBe('My Book');
  });
  test('byline feeds legal name and surname', () => {
    const d = resolveDetails(book, 'F', { byline: 'Ann B. Reed' });
    expect(d.legalName).toBe('Ann B. Reed');
    expect(d.surname).toBe('Reed');
    expect(resolveDetails(book, 'F', { legalName: 'Ann Poe' }).surname).toBe('Poe');
  });
  test('kept values win', () => {
    const d = resolveDetails(book, 'F', {
      title: 'T',
      byline: 'A B',
      legalName: 'C D',
      surname: 'Zed',
      shortTitle: 'TT',
      font: 'courier',
      contact: ['x'],
    });
    expect(d).toEqual({
      title: 'T',
      byline: 'A B',
      legalName: 'C D',
      surname: 'Zed',
      shortTitle: 'TT',
      font: 'courier',
      contact: ['x'],
    });
  });
});

describe('manuscriptOf', () => {
  const m = make(book);
  const kinds = m.blocks.map((b) => b.kind);

  test('words match the structure', () => {
    expect(m.words).toBe(novelStructure(book).words);
    expect(m.wordsLabel).toBe(wordsLabel(m.words));
  });

  test('parts, chapters, breaks, and the end', () => {
    expect(m.blocks[0]).toEqual({ kind: 'part', title: 'Part One: The Tide' });
    expect(m.blocks[1]).toEqual({ kind: 'chapter', title: 'The Salt Road' });
    expect(m.blocks[2].kind).toBe('paragraph');
    const chapters = m.blocks
      .filter((b) => b.kind === 'chapter')
      .map((b) => (b as { title: string }).title);
    expect(chapters).toEqual(['The Salt Road', 'Chapter 2', 'The Night Watch']);
    expect(m.blocks[m.blocks.length - 1]).toEqual({ kind: 'end' });
    expect(kinds.filter((k) => k === 'end')).toHaveLength(1);
    // The Crossing, The Lamp, and the `***` each get a break: each follows the chapter's text.
    const para = (style: string) => `paragraph:${style}`;
    const seq = m.blocks.map((blk) => (blk.kind === 'paragraph' ? para(blk.style) : blk.kind));
    expect(seq.slice(0, seq.indexOf('chapter', 2))).toEqual([
      'part',
      'chapter',
      'paragraph:body', // the chapter's two opening paragraphs
      'paragraph:body',
      'break', // The Crossing, after the chapter's opening prose
      'paragraph:body',
      'paragraph:quote',
      'break', // The Lamp
      'paragraph:body',
      'paragraph:body', // the image
      'break', // the `***`
      'paragraph:body',
      'paragraph:list',
      'paragraph:list',
      'paragraph:list',
      'paragraph:body',
      'paragraph:list',
      'paragraph:list',
    ]);
  });

  test('section headings print nowhere', () => {
    const all = m.blocks.map(text).join('\n');
    expect(all).not.toContain('The Crossing');
    expect(all).not.toContain('The Lamp');
    expect(all).not.toContain('***');
  });

  test('quote, lists, code, headings', () => {
    const paras = m.blocks.filter((b) => b.kind === 'paragraph') as Extract<
      ManuscriptBlock,
      { kind: 'paragraph' }
    >[];
    expect(paras.find((p) => p.style === 'quote')?.runs[0].text).toContain('The sea keeps');
    const list = paras.filter((p) => p.style === 'list');
    expect(list.map((p) => p.marker)).toEqual(['•', '•', '•', '1.', '2.']);
    expect(list[0].runs[0].text).toBe('a tin of matches');
    expect(paras.filter((p) => p.style === 'code').map((p) => p.runs[0].text)).toEqual([
      'tide: low at six',
      'lamp: lit at dusk',
    ]);
    expect(paras.find((p) => p.style === 'heading')?.runs[0].text).toBe('An aside');
  });

  test('inline marks, links, images, footnotes', () => {
    const paras = m.blocks.filter((b) => b.kind === 'paragraph') as Extract<
      ManuscriptBlock,
      { kind: 'paragraph' }
    >[];
    const second = paras.find((p) => p.runs.some((r) => r.italic));
    expect(second?.runs.find((r) => r.italic)?.text).toBe('promised');
    expect(second?.runs.find((r) => r.bold)?.text).toBe('nearly');
    const lamp = paras.find((p) => p.runs.some((r) => r.text.includes('[1]')));
    expect(lamp?.runs.map((r) => r.text).join('')).toContain('cottage[1] and');
    expect(lamp?.runs.map((r) => r.text).join('')).toContain('See the harbour notes for more.');
    expect(paras.find((p) => text(p) === '[Image: A lamp in a window]')?.style).toBe('body');
    expect(m.notes).toEqual([
      [{ text: 'Built in 1871, by the harbour board, and never staffed again.' }],
    ]);
  });

  test('metadata and HTML comments print nothing', () => {
    const all = m.blocks.map(text).join('\n');
    expect(all).not.toContain('drafter');
    expect(all).not.toContain('private note');
    expect(all).not.toContain('bookTarget');
  });

  test('no heading at all gives body paragraphs and the end', () => {
    const b = make('One.\n\nTwo.\n').blocks;
    expect(b.map((x) => x.kind)).toEqual(['paragraph', 'paragraph', 'end']);
  });

  test('an empty chapter gives its block and the next', () => {
    const b = make('# One\n\n# Two\n\nBody.\n').blocks;
    expect(b.map((x) => x.kind)).toEqual(['chapter', 'chapter', 'paragraph', 'end']);
  });

  test('a ## before any chapter is a chapter, as the outline reads it', () => {
    const b = make('## Prologue\n\nBody.\n').blocks;
    expect(b[0]).toEqual({ kind: 'chapter', title: 'Prologue' });
  });

  // The part/chapter/break sequence the manuscript prints, and the one the outline reads.
  const shape = (source: string) =>
    make(source)
      .blocks.filter((b) => b.kind === 'part' || b.kind === 'chapter' || b.kind === 'break')
      .map((b) => b.kind);
  const outline = (source: string) => {
    const out: string[] = [];
    const walk = (nodes: ReturnType<typeof novelStructure>['nodes']) => {
      for (const n of nodes) {
        if (n.kind !== 'section') out.push(n.kind);
        walk(n.children);
      }
    };
    walk(novelStructure(source).nodes);
    return out;
  };

  test.each([
    ['an indented part', '  # Part One\n\nA.\n\n# Two\n\nB.\n'],
    ['a leading byte-order mark', '\uFEFF# One\n\nA.\n\n# Two\n\nB.\n'],
    ['a heading in a block quote', '# One\n\n> # Not a chapter\n\nA.\n\n# Two\n'],
    ['a heading in a list', '# One\n\n- # Not a chapter\n\n# Two\n\nB.\n'],
    ['a setext chapter', 'One\n===\n\nA.\n\nTwo\n===\n\nB.\n'],
  ])('the headings agree with the outline: %s', (_, source) => {
    expect(shape(source)).toEqual(outline(source));
  });

  test('a nested heading is a heading-styled paragraph, not a chapter', () => {
    const b = make('# One\n\n> # Inner\n\nA.\n').blocks;
    expect(b.map((x) => x.kind)).toEqual(['chapter', 'paragraph', 'paragraph', 'end']);
    expect(b[1]).toMatchObject({ style: 'heading' });
  });

  test('an indented part is a part', () => {
    expect(make('  # Part One\n\nA.\n').blocks[0]).toEqual({ kind: 'part', title: 'Part One' });
  });

  test('a table is one body paragraph per row', () => {
    const b = make(
      '# One\n\n| Name | Age |\n| --- | --- |\n| Ann | 30 |\n| Bo | 41 |\n\nAfter.\n',
    ).blocks;
    const rows = b.filter((x) => x.kind === 'paragraph').map(text);
    expect(rows).toEqual(['Name | Age', 'Ann | 30', 'Bo | 41', 'After.']);
    expect(
      b
        .filter((x) => x.kind === 'paragraph')
        .every((x) => x.kind === 'paragraph' && x.style === 'body'),
    ).toBe(true);
  });

  test('no run holds a line break', () => {
    const b = make(
      '# One\n\nline one\nline two  \nthree\\\nfour\n\n> quoted\n> more\n\n- item\n  wraps\n',
    ).blocks;
    for (const blk of b) {
      if (blk.kind === 'paragraph') for (const r of blk.runs) expect(r.text).not.toMatch(/[\r\n]/);
    }
    expect(text(b[1])).toBe('line one line two three four');
  });

  test('a break never sits next to a chapter, a part, the end, or another break', () => {
    for (const source of [
      '# One\n\nA.\n\n***\n\n# Two\n\nB.\n',
      '# One\n\nA.\n\n***\n',
      '# One\n\nA.\n\n***\n\n***\n\nB.\n',
      '# One\n\nA.\n\n***\n\n# Part Two\n',
    ]) {
      const b = make(source).blocks;
      b.forEach((x, i) => {
        if (x.kind === 'break') expect(b[i + 1]?.kind).toBe('paragraph');
      });
    }
    expect(make('# One\n\nA.\n\n***\n\n***\n\nB.\n').blocks.map((x) => x.kind)).toEqual([
      'chapter',
      'paragraph',
      'break',
      'paragraph',
      'end',
    ]);
  });

  test("a section after a chapter's opening prose is set off by a break", () => {
    const seq = make('# Chapter 1\n\nOpening prose.\n\n## Later\n\nSecond scene.').blocks.map(
      (b) => b.kind,
    );
    expect(seq).toEqual(['chapter', 'paragraph', 'break', 'paragraph', 'end']);
  });

  test("a chapter's first section, straight after its heading, has no break", () => {
    const seq = make('# C\n\n## First\n\nText.').blocks.map((b) => b.kind);
    expect(seq).toEqual(['chapter', 'paragraph', 'end']);
  });
});
