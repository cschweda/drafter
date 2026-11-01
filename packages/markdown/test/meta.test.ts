import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { commentJson, findMarkdownMeta, readMarkdownMeta, setMarkdownMeta } from '../src';
import { MAX_GROWTH, SCALING_TIMEOUT, scaling } from './scaling';

/** Bodies built from the pieces most likely to confuse the block. */
const anyBody = fc
  .array(
    fc.constantFrom(
      'Ada walks the pier.',
      '# Heading',
      '\n',
      '\r\n',
      '\n\n',
      ' ',
      '-->',
      '--',
      '<!-- drafter ',
      '<!-- drafter {"a":1} -->',
      '```',
      '*/',
      '/',
      'é ✓ 𝄞',
    ),
    { maxLength: 30 },
  )
  .map((parts) => parts.join(''))
  .filter((body) => findMarkdownMeta(body) === null);

const anyMeta = fc.dictionary(
  fc.string({ maxLength: 6 }),
  fc.oneof(fc.string({ maxLength: 12 }), fc.integer(), fc.boolean(), fc.constant(null)),
  { maxKeys: 4 },
);

describe('Markdown metadata comment', () => {
  test('reads and writes the trailing comment', () => {
    const body = '# Boca\n\nThe pier at dawn.\n';
    const file = setMarkdownMeta(body, { draft: 3, note: 'after the table read' });
    expect(file).toBe(
      '# Boca\n\nThe pier at dawn.\n\n\n<!-- drafter {"draft":3,"note":"after the table read"} -->\n',
    );
    expect(readMarkdownMeta(file)).toEqual({
      body,
      meta: { draft: 3, note: 'after the table read' },
    });
  });

  test('the text, one blank line, then the block', () => {
    expect(setMarkdownMeta('The pier.', { a: 1 })).toBe('The pier.\n\n<!-- drafter {"a":1} -->\n');
    expect(setMarkdownMeta('One.\r\nTwo.', { a: 1 })).toBe(
      'One.\r\nTwo.\r\n\r\n<!-- drafter {"a":1} -->\r\n',
    );
  });

  test('setting it again replaces the block in place', () => {
    const once = setMarkdownMeta('The pier.', { a: 1 });
    const twice = setMarkdownMeta(once, { a: 2, b: 'x' });
    expect(twice).toBe('The pier.\n\n<!-- drafter {"a":2,"b":"x"} -->\n');
    expect(readMarkdownMeta(twice).body).toBe('The pier.');
  });

  test('round-trips any body and any metadata', () => {
    fc.assert(
      fc.property(anyBody, anyMeta, (body, meta) => {
        const file = setMarkdownMeta(body, meta);
        expect(readMarkdownMeta(file)).toEqual({ body, meta });
      }),
      { numRuns: 300 },
    );
  });

  test('ignores a drafter comment that isn’t last', () => {
    const text = 'Intro.\n\n<!-- drafter {"a":1} -->\n\nMore words after it.\n';
    expect(readMarkdownMeta(text)).toEqual({ body: text, meta: null });
    expect(findMarkdownMeta(text)).toBeNull();
  });

  test('a body that contains "<!-- drafter" text in a code fence is not mistaken for the block', () => {
    const text = 'How the block looks:\n\n```\n<!-- drafter {"draft":1} -->\n```\n';
    expect(readMarkdownMeta(text)).toEqual({ body: text, meta: null });
    // Indented code is code too: the block starts at the line's start.
    const indented = 'Code:\n\n    <!-- drafter {"draft":1} -->\n';
    expect(readMarkdownMeta(indented)).toEqual({ body: indented, meta: null });
    // And writing a block after such a body keeps the body whole.
    const file = setMarkdownMeta(text, { draft: 2 });
    expect(readMarkdownMeta(file)).toEqual({ body: text, meta: { draft: 2 } });
  });

  test('a block that isn’t a JSON object is the writer’s text, and a good one goes after it', () => {
    for (const bad of [
      '<!-- drafter {"a":1 -->',
      '<!-- drafter [1,2] -->',
      '<!-- drafter "x" -->',
    ]) {
      const text = `Words.\n\n${bad}\n`;
      expect(readMarkdownMeta(text)).toEqual({ body: text, meta: null });
      expect(readMarkdownMeta(setMarkdownMeta(text, { a: 1 }))).toEqual({
        body: text,
        meta: { a: 1 },
      });
    }
  });

  test('no value can close the comment early', () => {
    const meta = { note: 'ends --> here', path: '*/ and -- and --- and <!--', n: -1 };
    const file = setMarkdownMeta('Words.', meta);
    const line = file.split('\n').find((l) => l.startsWith('<!-- drafter')) as string;
    expect(line.slice('<!-- drafter'.length, -' -->'.length)).not.toContain('--');
    expect(line.slice('<!-- drafter'.length, -' -->'.length)).not.toContain('>');
    expect(readMarkdownMeta(file).meta).toEqual(meta);
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (s) => {
        const json = commentJson({ s });
        expect(json).not.toContain('--');
        expect(json).not.toContain('>');
        expect(json).not.toContain('*/');
        expect(JSON.parse(json)).toEqual({ s });
      }),
    );
  });

  test(
    'reads in linear time',
    () => {
      const long = scaling(
        (n) => setMarkdownMeta('word '.repeat(n), { note: 'x'.repeat(n) }),
        (text) => readMarkdownMeta(text),
        200_000,
      );
      expect(long.growth).toBeLessThan(MAX_GROWTH);
      const hostile = scaling(
        (n) => `${'<!-- drafter '.repeat(n)}\n${'-'.repeat(n)}`,
        (text) => readMarkdownMeta(text),
        100_000,
      );
      expect(hostile.growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );
});
