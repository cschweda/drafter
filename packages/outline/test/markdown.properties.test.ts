import { type Block, type Doc, inlineRuns, parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import fc from 'fast-check';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { describe, expect, test } from 'vitest';
import { fountainScript } from '../../../fixtures/generators/fountain';
import { sceneIndex, scriptMarkdown } from '../src';
import { screenplay, stagePlay } from './helpers';

// Generated scripts of every block kind, with emphasis and Markdown's own characters in their
// text, written as Markdown and read back by the app's own CommonMark parser.

const SPECIALS = [
  '# not',
  '1. one',
  '2) two',
  '- dash',
  '+ plus',
  '* star',
  '---',
  '***',
  '___',
  '===',
  '> quote',
  '<b>tag</b>',
  '<!-- c -->',
  'fish &amp; chips',
  'a | b',
  '~~gone~~',
  '`code`',
  '[a](b)',
  '![i](j)',
  'end\\',
  'Room #',
  'x*_y_*z',
  '**_both_**',
  '*.*',
  '_(aside)_',
];

/** A generated script with Markdown's characters dropped into some of its lines. */
const script = fc
  .tuple(fountainScript, fc.array(fc.constantFrom(...SPECIALS), { minLength: 1, maxLength: 8 }))
  .map(([source, specials]) => {
    const lines = source.split('\n');
    specials.forEach((special, k) => {
      const at = (k * 7919) % Math.max(1, lines.length);
      const line = lines[at] as string;
      // Before a CRLF's `\r`, so the line break stays one.
      lines[at] = line.endsWith('\r') ? `${line.slice(0, -1)} ${special}\r` : `${line} ${special}`;
    });
    return lines.join('\n');
  });

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
}

/** A node's text: hard breaks as line breaks, and the `<u>` tags left out. */
function plain(node: MdNode): string {
  if (node.type === 'break') return '\n';
  if (node.type === 'html') return '';
  if (node.value !== undefined) return node.value;
  return (node.children ?? []).map(plain).join('');
}

function walk(node: MdNode, visit: (node: MdNode) => void) {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

const trim = (line: string) => line.replace(/^[ \t]+|[ \t]+$/g, '');

/** Printed lines as plain text, trimmed, with the empty lines at the ends left off. */
function edges(lines: string[]): string[] {
  while (lines[0] === '') lines.shift();
  while (lines.at(-1) === '') lines.pop();
  return lines;
}

/** A block's printed lines as plain text, trimmed. */
const printed = (block: Block, wrap = (line: string) => line): string[] =>
  block.lines
    .filter((line) => !line.transparent)
    .map((line) => trim(line.inline.map((run) => run.text).join('')))
    .map((line) => (line === '' ? '' : wrap(line)));

/** A section's text read for emphasis, its marks taken off, trimmed. */
const sectionText = (text: string) =>
  trim(
    inlineRuns(text)
      .map((run) => run.text)
      .join(''),
  );

const SPEECH_PARTS = ['parenthetical', 'dialogue', 'lyric'];

/**
 * Every printed block's lines, in order, as the Markdown should hold them (notes and boneyard
 * excepted). A speech, its name and the parts right under it, is one block, as the PDF prints it.
 */
function expectedLines(doc: Doc): string[] {
  const out: string[] = [];
  const { blocks } = doc;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i] as Block;
    if (block.kind === 'character') {
      const lines = printed(block);
      while (
        SPEECH_PARTS.includes(blocks[i + 1]?.kind ?? '') &&
        blocks[i + 1]?.leading.split('\n').length === 2
      ) {
        lines.push(...printed(blocks[++i] as Block));
      }
      out.push(...edges(lines));
    } else if (block.kind === 'section') {
      const text = sectionText(block.sem.text);
      if (text !== '') out.push(text);
    } else if (block.kind === 'scene_heading') {
      const text = printed(block)
        .filter((l) => l !== '')
        .join(' ');
      if (text !== '') out.push(text);
    } else if (block.kind === 'centered') {
      out.push(...edges(printed(block, (line) => `>${line}<`)));
    } else if (!['note', 'synopsis', 'boneyard', 'page_break'].includes(block.kind)) {
      out.push(...edges(printed(block)));
    }
  }
  return out;
}

const DUAL = ' (at the same time)';
/** The same, as the Markdown writes it. */
const DUAL_MARK = ' *(at the same time)*';

/** The Markdown's lines, in order, from its headings and paragraphs. */
function actualLines(tree: MdNode): string[] {
  const out: string[] = [];
  for (const node of tree.children ?? []) {
    if (node.type === 'heading' || node.type === 'paragraph') out.push(...plain(node).split('\n'));
  }
  return out;
}

const of = (source: string, template = screenplay) => {
  const parsed = parse(source);
  const doc = { ...parsed, titlePage: null };
  const markdown = scriptMarkdown(doc, sceneIndex(doc, template, null), template, {
    sceneNumbers: 'none',
    notes: 'leave-out',
  });
  return { doc, markdown, tree: fromMarkdown(markdown) as MdNode };
};

const templates = fc.constantFrom(screenplay, stagePlay);

describe('scriptMarkdown, read back', () => {
  test("every element's text comes through once, in order, as written", () => {
    fc.assert(
      fc.property(script, templates, (source, template) => {
        const { doc, tree } = of(source, template);
        const expected = expectedLines(doc);
        const actual = actualLines(tree);
        expect(actual.length).toBe(expected.length);
        actual.forEach((line, k) => {
          // The second speech of dual dialogue says so after its name.
          const want = expected[k] as string;
          if (line !== want) expect(line).toBe(`${want}${DUAL}`);
        });
      }),
      { numRuns: 400 },
    );
  });

  test("never makes a heading, list, rule, code block, or HTML the script didn't ask for", () => {
    fc.assert(
      fc.property(script, templates, (source, template) => {
        const { doc, tree } = of(source, template);
        const counts = new Map<string, number>();
        const html: string[] = [];
        walk(tree, (node) => {
          counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
          if (node.type === 'html') html.push(node.value ?? '');
        });
        const kinds = (test: (block: Block) => boolean) => doc.blocks.filter(test).length;
        const headings = kinds(
          (b) =>
            (b.kind === 'section' && sectionText(b.sem.text) !== '') ||
            (b.kind === 'scene_heading' &&
              template === screenplay &&
              printed(b).some((l: string) => l !== '')),
        );
        expect(counts.get('heading') ?? 0).toBe(headings);
        expect(counts.get('thematicBreak') ?? 0).toBe(kinds((b) => b.kind === 'page_break'));
        for (const type of [
          'list',
          'listItem',
          'code',
          'inlineCode',
          'link',
          'image',
          'definition',
          'blockquote',
        ]) {
          expect(counts.get(type) ?? 0, type).toBe(0);
        }
        for (const value of html) expect(['<u>', '</u>']).toContain(value);
        if (html.length > 0) expect(source).toContain('_');
      }),
      { numRuns: 400 },
    );
  });

  test('emphasis marks in any arrangement keep the text, and make only emphasis', () => {
    const token = fc.constantFrom(
      ...['*', '**', '***', '_', '__', '_*', '*_', '\\*', 'a', 'b', '1', ' ', '\t', '\u00a0'],
      ...['.', ',', '(', ')', '!', '"', '-', '#', '$', '<', '&', '~', 'é', '😀'],
    );
    fc.assert(
      fc.property(fc.array(token, { minLength: 1, maxLength: 30 }), (tokens) => {
        const { doc, tree } = of(`INT. A - DAY\n\n!${tokens.join('')}\n`);
        expect(actualLines(tree)).toEqual(expectedLines(doc));
        walk(tree, (node) => {
          expect([
            'root',
            'heading',
            'paragraph',
            'text',
            'emphasis',
            'strong',
            'html',
            'break',
          ]).toContain(node.type);
        });
      }),
      { numRuns: 2000 },
    );
  });

  test('what Markdown reads by what follows it is judged across emphasis runs, on the whole line', () => {
    // Emphasis splits a line into runs, each written apart; a `<`, `&`, `|`, `>`, `#`, `-`, or
    // list number in one run means something only by what the next one, or the line, holds.
    const token = fc.constantFrom(
      ...['*', '**', '***', '_', '__', ' ', '\t', '\u00a0', 'a', 'B', '1', '9', '.', ')', ':'],
      ...['<', '/', '!', '?', 'div>', 'u>', '&', '#', 'amp;', '#42;', ';', '|', '-', '--', '>'],
      ...['=', '+', '[', ']', '\\', '`', '~', '(', '"', 'é', '😀', '<!--', '| --- |', ':--'],
    );
    const line = fc.array(token, { minLength: 1, maxLength: 24 }).map((tokens) => tokens.join(''));
    fc.assert(
      fc.property(fc.array(line, { minLength: 1, maxLength: 3 }), (lines) => {
        const { doc, tree } = of(`INT. A - DAY\n\n!${lines.join('\n')}\n`);
        expect(actualLines(tree)).toEqual(expectedLines(doc));
        walk(tree, (node) => {
          expect([
            'root',
            'heading',
            'paragraph',
            'text',
            'emphasis',
            'strong',
            'html',
            'break',
          ]).toContain(node.type);
          if (node.type === 'html') expect(['<u>', '</u>']).toContain(node.value);
        });
      }),
      { numRuns: 20_000 },
    );
  });

  test('pairs dual dialogue exactly as paginate pairs it', () => {
    fc.assert(
      fc.property(script, templates, (source, template) => {
        const { doc, markdown } = of(source, template);
        const marked = doc.blocks.filter((b) => b.kind === 'character' && b.sem.dual).length;
        const unpaired = paginate(doc, template).diagnostics.filter(
          (d) => d.code === 'unpaired-dual',
        ).length;
        expect(markdown.split(DUAL_MARK).length - 1).toBe(marked - unpaired);
      }),
      { numRuns: 400 },
    );
  });

  test("the output is at most 3 × the script's length + 64", () => {
    fc.assert(
      fc.property(script, templates, (source, template) => {
        const { markdown } = of(source, template);
        expect(markdown.length).toBeLessThanOrEqual(3 * source.length + 64);
      }),
      { numRuns: 400 },
    );
  });
});
