import { parseMarkdown } from '@drafter/markdown';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
// The app's own Preview, drawn into jsdom: the export must show what it shows. Only the test
// reaches into the app; the package never does.
import { renderMarkdown } from '../../../apps/web/app/markdown/render';
import { renderDocumentHtml } from '../src/document';

const word = fc.constantFrom(
  'tide',
  'lamp',
  'harbour',
  '<img src=x onerror=alert(1)>',
  '</main>',
  '"quoted"',
  "it's",
  'a&b',
  '东京',
  '🎬',
  'café',
);
const words = (max: number) =>
  fc.array(word, { minLength: 1, maxLength: max }).map((w) => w.join(' '));
const url = fc.constantFrom(
  'https://example.org/a',
  'http://example.org/b?x=1&y="2"',
  'mailto:keeper@example.org',
  'javascript:alert(1)',
  ' javascript:alert(2)',
  'java\tscript:alert(3)',
  'data:text/html,<b>x</b>',
  'vbscript:msgbox',
  'file:///etc/passwd',
  '#premise',
  'notes/two.md',
  '//example.org/c',
);
/** Labels for footnotes: some defined, some only referenced. */
const label = fc.constantFrom('a', 'b', 'c', 'Note', 'x1');
const inline = fc
  .array(
    fc.oneof(
      { weight: 4, arbitrary: words(4) },
      words(2).map((w) => `*${w}*`),
      words(2).map((w) => `**${w}**`),
      words(2).map((w) => `\`${w}\``),
      fc.tuple(words(2), url).map(([w, u]) => `[${w}](<${u}>)`),
      fc.tuple(words(2), label, url).map(([w, l, u]) => `[${w}[^${l}]](<${u}>)`),
      fc.tuple(words(2), url).map(([w, u]) => `![${w}](<${u}>)`),
      words(1).map((w) => `<span class="x">${w}</span>`),
      label.map((l) => `[^${l}]`),
    ),
    { minLength: 1, maxLength: 6 },
  )
  .map((parts) => parts.join(' '));

const block = fc.oneof(
  {
    weight: 2,
    arbitrary: fc
      .tuple(fc.integer({ min: 1, max: 6 }), inline)
      .map(([n, t]) => `${'#'.repeat(n)} ${t}`),
  },
  { weight: 4, arbitrary: inline },
  fc
    .array(inline, { minLength: 1, maxLength: 3 })
    .map((items) => items.map((i) => `- ${i}`).join('\n')),
  fc
    .array(inline, { minLength: 1, maxLength: 3 })
    .map((items) => items.map((i, n) => `${n + 1}. ${i}`).join('\n')),
  inline.map((t) => `> ${t}`),
  words(4).map((w) => `\`\`\`\n${w}\n</pre>\n\`\`\``),
  words(2).map((w) => `<div onclick="x()">${w}</div>`),
  fc.tuple(label, inline).map(([l, t]) => `[^${l}]: ${t}`),
  fc.constant('***'),
);
const markdown = fc
  .array(block, { minLength: 1, maxLength: 12 })
  .map((blocks) => blocks.join('\n\n'));

const read = (html: string) => new DOMParser().parseFromString(html, 'text/html');
const squash = (text: string) => text.replace(/\s+/g, '');

/** The text nodes of a tree, in order, each with something to read. */
function texts(root: Node): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent?.trim() ?? '';
    if (text) out.push(text);
  }
  return out;
}

describe('renderDocumentHtml, over random Markdown', () => {
  it('shows what the Preview shows, safely', () => {
    fc.assert(
      fc.property(markdown, (source) => {
        const tree = parseMarkdown(source);
        const html = renderDocumentHtml({ tree, title: 'Doc', lang: 'en', generator: 'Drafter' });
        const doc = read(html);
        const main = doc.querySelector('main') as HTMLElement;
        const preview = renderMarkdown(tree, document);

        // Every text node of the Preview's, in order, and nothing else.
        const out = main.textContent ?? '';
        let at = 0;
        for (const text of texts(preview)) {
          const found = out.indexOf(text, at);
          expect(found, text).toBeGreaterThanOrEqual(0);
          at = found + text.length;
        }
        expect(squash(out)).toBe(squash(preview.textContent ?? ''));
        // Footnotes numbered as the Preview numbers them.
        expect([...main.querySelectorAll('sup')].map((s) => s.textContent)).toEqual(
          [...preview.querySelectorAll('sup')].map((s) => s.textContent),
        );

        // No style attribute, no image, nothing the writer typed as markup.
        expect(html).not.toContain('style=');
        expect(doc.querySelector('[style], img, [onclick], [onerror], div[class="x"]')).toBeNull();
        expect(doc.querySelectorAll('script').length).toBe(1);

        // Ids unique; every anchor lands on one; every other link is http, https, or mailto.
        const ids = [...doc.querySelectorAll('[id]')].map((e) => e.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const a of doc.querySelectorAll('a[href]')) {
          const href = a.getAttribute('href') as string;
          if (href.startsWith('#')) {
            expect(doc.getElementById(href.slice(1)), href).not.toBeNull();
            continue;
          }
          expect(['http:', 'https:', 'mailto:']).toContain(new URL(href).protocol);
          expect(a.getAttribute('target')).toBe('_blank');
          expect(a.getAttribute('rel')).toBe('noopener noreferrer');
        }
        expect(doc.querySelector('a a')).toBeNull();

        // Headings never skip a level, from the header's h1 on.
        const levels = [...doc.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((h) =>
          Number(h.tagName[1]),
        );
        expect(levels[0]).toBe(1);
        for (let i = 1; i < levels.length; i++) {
          expect(levels[i] as number).toBeLessThanOrEqual((levels[i - 1] as number) + 1);
        }
      }),
      { numRuns: 150 },
    );
  });
});
