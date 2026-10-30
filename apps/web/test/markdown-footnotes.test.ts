// @vitest-environment jsdom

import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { footnotes as pdfFootnotes } from '@drafter/render-pdf';
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { MAX_NESTING } from '../app/markdown/depth';
import { markdownMode } from '../app/markdown/editor';
import { footnotes } from '../app/markdown/notes';
import { parseMarkdown } from '../app/markdown/parse';
import { type MdNode, renderMarkdown } from '../app/markdown/render';
import { markdownTitle } from '../app/markdown/title';
import { countWords } from '../app/markdown/words';
import { MAX_GROWTH, SCALING_TIMEOUT, scaling } from './scaling';

function draw(source: string): HTMLElement {
  const host = document.createElement('div');
  host.append(renderMarkdown(parseMarkdown(source), document));
  document.body.replaceChildren(host);
  return host;
}

/** The superscript numbers in the body, in reading order. */
const refs = (host: HTMLElement) =>
  [...host.querySelectorAll('sup.md-fnref')].map((sup) => sup.textContent);
/** The notes at the end, each as its number and its text, without the button back. */
const notes = (host: HTMLElement) =>
  [...host.querySelectorAll('.md-notes ol > li')].map((li) => {
    const text = li.querySelector('.md-note-text')?.cloneNode(true) as HTMLElement | undefined;
    for (const button of text?.querySelectorAll('button') ?? []) button.remove();
    return [li.getAttribute('value') ?? '', text?.textContent?.trim() ?? ''];
  });

describe('footnotes in a Markdown document', () => {
  test('numbers notes 1, 2, 3 in order of first reference, whatever their labels', () => {
    const host = draw(
      'One[^source] and two[^1] and one again[^source].\n\n[^1]: Second note.\n[^source]: First note.\n',
    );
    expect(refs(host)).toEqual(['1', '2', '1']);
    expect(notes(host)).toEqual([
      ['1', 'First note.'],
      ['2', 'Second note.'],
    ]);
  });

  test('prints no definition that is never referenced, and leaves a reference with no definition as text', () => {
    const host = draw('Text[^missing] and[^a].\n\n[^a]: Kept.\n[^unused]: Never printed.\n');
    expect(host.querySelector('p')?.textContent).toBe('Text[^missing] and1.');
    expect(notes(host)).toEqual([['1', 'Kept.']]);
    expect(host.textContent).not.toContain('Never printed');
  });

  test('reads a definition’s indented paragraphs as one note', () => {
    const host = draw(
      'Text[^long].\n\n[^long]: First paragraph.\n\n    Second paragraph.\n\nAfter.\n',
    );
    const note = host.querySelector('.md-notes li');
    expect([...(note?.querySelectorAll('p') ?? [])].map((p) => p.textContent)).toEqual([
      'First paragraph.',
      'Second paragraph. ↩',
    ]);
    // The paragraph after the definition is the document's, not the note's.
    expect([...host.children].map((el) => el.tagName)).toEqual(['P', 'P', 'SECTION']);
  });

  test('numbers a note referenced only inside another note right after it', () => {
    const tree = parseMarkdown(
      'A[^a] and B[^b].\n\n[^a]: Note a, see[^c].\n[^b]: Note b.\n[^c]: Note c.\n',
    );
    const { numbers } = footnotes(tree);
    expect([...numbers]).toEqual([
      ['a', 1],
      ['c', 2],
      ['b', 3],
    ]);
    const host = draw('A[^a] and B[^b].\n\n[^a]: Note a, see[^c].\n[^b]: Note b.\n[^c]: Note c.\n');
    expect(refs(host)).toEqual(['1', '3', '2']);
    expect(notes(host).map(([n]) => n)).toEqual(['1', '2', '3']);
  });

  test('the first definition of a label is the one used', () => {
    const host = draw('Text[^a].\n\n[^a]: First.\n[^a]: Second.\n');
    expect(notes(host)).toEqual([['1', 'First.']]);
  });

  test('draws a reference as a superscript button with a label, and the notes in a labelled section', () => {
    const host = draw('Text[^a].\n\n[^a]: The note.\n');
    const sup = host.querySelector('sup.md-fnref');
    const button = sup?.querySelector('button');
    expect(button?.getAttribute('type')).toBe('button');
    expect(button?.getAttribute('aria-label')).toBe('Footnote 1');
    const section = host.querySelector('section.md-notes');
    expect(section?.previousElementSibling?.tagName).toBe('P');
    const heading = section?.querySelector('h2');
    expect(heading?.textContent).toBe('Notes');
    expect(section?.getAttribute('aria-labelledby')).toBe(heading?.id);
    expect(section?.querySelector('ol')).not.toBeNull();
    // A separator comes before the notes, and nothing is a link.
    expect(section?.querySelector('hr, .md-notes-rule')).not.toBeNull();
    expect(host.querySelector('a, [href]')).toBeNull();
  });

  test('a reference takes you to its note, and the note back to the reference', () => {
    const host = draw('Text[^a] and more[^b].\n\n[^a]: Note a.\n[^b]: Note b.\n');
    const second = host.querySelectorAll<HTMLButtonElement>('sup.md-fnref button')[1];
    second?.click();
    const li = host.querySelectorAll('.md-notes li')[1];
    expect(document.activeElement).toBe(li);
    const back = li?.querySelector<HTMLButtonElement>('button.md-note-back');
    expect(back?.getAttribute('aria-label')).toBe('Back to footnote 2’s reference');
    back?.click();
    expect(document.activeElement).toBe(second);
  });

  test('marks no block of the notes for scroll sync, so the body’s marks stay in order', () => {
    const source = '# Title\n\n[^a]: Note, written early.\n\nText[^a].\n\nMore.\n';
    const host = draw(source);
    expect(host.querySelector('.md-notes [data-from]')).toBeNull();
    const marks = [...host.querySelectorAll<HTMLElement>('[data-from]')].map((el) =>
      Number(el.dataset.from),
    );
    expect(marks).toEqual([0, source.indexOf('Text'), source.indexOf('More')]);
  });

  test('shows raw HTML in a note as text', () => {
    const host = draw('Text[^a].\n\n[^a]: A <b onclick="x()">bold</b> claim.\n');
    expect(host.querySelector('b')).toBeNull();
    expect(host.querySelector('.md-notes')?.textContent).toContain('<b onclick="x()">');
  });

  test('draws no notes section when nothing is referenced', () => {
    const host = draw('Text.\n\n[^a]: Never referenced.\n');
    expect(host.querySelector('.md-notes')).toBeNull();
    expect(host.textContent).toBe('Text.');
  });

  test('counts a note’s words with the document’s, and the reference mark not at all', () => {
    expect(countWords(parseMarkdown('One two[^a].\n\n[^a]: Three four five.\n'))).toBe(5);
    // A note never referenced isn't printed, so it isn't counted.
    expect(countWords(parseMarkdown('One two.\n\n[^a]: Three four five.\n'))).toBe(2);
    // The mark joins the words around it, as it prints nothing of its own between them.
    expect(countWords(parseMarkdown('word[^a]s\n\n[^a]: x\n'))).toBe(2);
  });

  test('leaves a heading’s reference mark out of the title, only when it is one', () => {
    expect(markdownTitle('# The Long Way[^1]\n\n[^1]: A working title.\n')).toBe('The Long Way');
    // With its definition written above the heading.
    expect(markdownTitle('[^n]: Note.\n\n# Shore[^n] Leave\n')).toBe('Shore Leave');
    // No definition: the parser leaves it as text, and so does the title.
    expect(markdownTitle('# The Long Way[^1]\n')).toBe('The Long Way[^1]');
    // In a code span it is code, kept as written (the backticks go, as for any code span).
    expect(markdownTitle('# Using `[^1]` marks\n\n[^1]: Note.\n')).toBe('Using [^1] marks');
    // A definition in a code fence is no definition.
    expect(markdownTitle('# Fence[^f]\n\n```\n[^f]: not one\n```\n')).toBe('Fence[^f]');
  });

  test(
    'reads a heading of many backticks and labels in linear time',
    () => {
      const { growth } = scaling(
        (n) =>
          `# ${'`'.repeat(n)} ${'``x'.repeat(n)} ${'[^a]'.repeat(n)} [^${'b'.repeat(n)}\n\n[^a]: y\n`,
        (source) => markdownTitle(source),
        20_000,
      );
      expect(growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );

  test('numbers notes as the PDF does', () => {
    const arbLabel = fc.constantFrom('a', 'b', 'c', 'note', '1');
    const arbText = fc
      .array(
        fc.oneof(
          fc.constantFrom('word', 'more words', '*slant*', '`code`'),
          arbLabel.map((label) => `[^${label}]`),
        ),
        { minLength: 1, maxLength: 6 },
      )
      .map((parts) => parts.join(' '));
    const arbDoc = fc
      .tuple(
        fc.array(arbText, { minLength: 1, maxLength: 5 }),
        fc.array(fc.tuple(arbLabel, arbText), { maxLength: 6 }),
      )
      .map(
        ([body, defs]) =>
          `${body.join('\n\n')}\n\n${defs.map(([label, text]) => `[^${label}]: ${text}`).join('\n')}\n`,
      );
    fc.assert(
      fc.property(arbDoc, (source) => {
        const tree = parseMarkdown(source);
        const web = footnotes(tree);
        const pdf = pdfFootnotes(tree);
        expect([...web.numbers]).toEqual([...pdf.numbers]);
        expect(web.notes).toEqual(pdf.notes);
      }),
      { numRuns: 200 },
    );
  });
});

describe('the footnote parser on hostile input', () => {
  const linear = (name: string, make: (n: number) => string, n: number) => {
    const { small, large, growth } = scaling(make, (source) => parseMarkdown(source), n);
    console.log(
      `Footnotes, ${name}: ${small.toFixed(1)} ms at n, ${large.toFixed(1)} ms at 4n (growth ${growth.toFixed(1)}).`,
    );
    expect(growth).toBeLessThan(MAX_GROWTH);
  };

  test(
    'reads unclosed `[^` openings in linear time',
    () => linear('`[^` openings', (n) => '[^'.repeat(n), 25_000),
    SCALING_TIMEOUT,
  );

  test(
    'reads very long labels in linear time',
    () =>
      linear(
        'long labels',
        (n) => `x[^${'a'.repeat(n)}]\n\n[^${'a'.repeat(n)}]: y\n${'x[^b'.repeat(n / 4)}`,
        100_000,
      ),
    SCALING_TIMEOUT,
  );

  test(
    'reads many references in linear time',
    () => linear('references', (n) => `${'x[^a]'.repeat(n)}\n\n[^a]: y\n`, 20_000),
    SCALING_TIMEOUT,
  );

  test(
    'reads many definitions, and references to them, in linear time',
    () =>
      linear(
        'definitions',
        (n) =>
          Array.from({ length: n }, (_, i) => `[^n${i}]: note\n`).join('') +
          Array.from({ length: n }, (_, i) => `x[^n${i}] `).join(''),
        5_000,
      ),
    SCALING_TIMEOUT,
  );

  test(
    'reads definitions nested as deep as a document may in linear time, and refuses deeper at once',
    () => {
      // Each line indented four columns carries on every open definition (the extension's
      // container rules), so the parser's time is depth times length: bounded by MAX_NESTING.
      const head = Array.from({ length: MAX_NESTING }, (_, i) => `${i ? '    ' : ''}[^a]: x`).join(
        '\n',
      );
      linear(
        'nested to the limit',
        (n) => `${head}\n${'    more words of the note\n'.repeat(n)}`,
        500,
      );
      const deeper = `${head}\n    [^a]: x\n`;
      const start = performance.now();
      expect(() => parseMarkdown(deeper)).toThrow(RangeError);
      expect(performance.now() - start).toBeLessThan(100);
    },
    SCALING_TIMEOUT,
  );

  test('keeps a definition’s label to 999 characters, as GFM does', () => {
    const long = 'a'.repeat(1_000);
    const tree = parseMarkdown(`x[^${long}]\n\n[^${long}]: y\n`);
    expect(footnotes(tree).notes).toEqual([]);
  });
});

describe('the parse', () => {
  test('makes footnote nodes, and keeps raw HTML an html node', () => {
    const tree = parseMarkdown('A[^b] <i>c</i>\n\n[^b]: Note.\n') as MdNode & {
      children: MdNode[];
    };
    const types = (node: MdNode): string[] => [node.type, ...(node.children ?? []).flatMap(types)];
    expect(types(tree)).toEqual([
      'root',
      'paragraph',
      'text',
      'footnoteReference',
      'text',
      'html',
      'text',
      'html',
      'footnoteDefinition',
      'paragraph',
      'text',
    ]);
  });
});

describe('the Source pane', () => {
  test('marks a footnote’s reference and its definition’s label, and not a link', () => {
    const parent = document.createElement('div');
    document.body.replaceChildren(parent);
    const view = new EditorView({
      state: EditorState.create({
        doc: 'Text[^1] and [a link](https://example.com) and [^note].\n\n[^1]: The note.\n',
        extensions: markdownMode(),
      }),
      parent,
    });
    const marked = [...parent.querySelectorAll('.cm-md-footnote')].map((el) => el.textContent);
    expect(marked).toEqual(['[^1]', '[^note]', '[^1]']);
    expect(parent.querySelector('.cm-md-link')?.textContent).toBe('[a link](https://example.com)');
    view.destroy();
  });
});
