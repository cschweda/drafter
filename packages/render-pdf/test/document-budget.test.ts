import { type DocNode, renderDocumentPdf } from '@drafter/render-pdf';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { md } from './document-helpers';
import { documentFonts } from './helpers';
import { HANG_MS, MAX_GROWTH, SCALING_TIMEOUT, scalingAsync } from './scaling';

// Invented words, so no sample text comes from anywhere else.
const WORDS = ['vorn', 'taleb', 'quisp', 'marrowy', 'ost', 'plenk', 'dravish', 'ulm', 'senner'];
const cycled = (count: number, seed: number) =>
  Array.from({ length: count }, (_, i) => WORDS[(seed * 7 + i * 3) % WORDS.length]).join(' ');

/**
 * A document of `n` sections, a little under a page each: headings, paragraphs, a list, a quote,
 * code, a link. With `vary`, words are drawn at random (from a fixed seed) instead of in a cycle,
 * so no two lines are alike and no measured width is reused, as in a real document.
 */
function document(n: number, vary = false): DocNode {
  let seed = 1;
  const pick = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return WORDS[Math.floor((seed / 2147483648) * WORDS.length)];
  };
  const words = vary
    ? (count: number, _seed: number) => Array.from({ length: count }, pick).join(' ')
    : cycled;
  const sections: string[] = [];
  for (let s = 0; s < n; s++) {
    sections.push(
      `## ${words(4, s)} ${s}`,
      words(60, s),
      `${words(40, s + 1)} *${words(5, s)}* and [${words(3, s)}](https://example.com/${s}).`,
      words(80, s + 2),
      `- ${words(12, s)}\n- ${words(20, s + 1)}\n  - ${words(8, s + 2)}\n- **${words(6, s + 3)}**`,
      `> ${words(30, s)}\n>\n> ${words(18, s + 1)}`,
      `\`\`\`\n${words(10, s)}\n  ${words(30, s + 1)}\n\`\`\``,
    );
  }
  return md(sections.join('\n\n'));
}

const render = (tree: DocNode) =>
  renderDocumentPdf(tree, { fonts: documentFonts, paper: 'letter' });

describe('renderDocumentPdf’s cost', () => {
  it(
    'renders linearly',
    async () => {
      const { growth, large } = await scalingAsync(document, render, 10);
      expect(large).toBeLessThan(HANG_MS);
      expect(growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );

  it(
    'renders a 100-page document',
    async () => {
      const tree = document(125, true);
      const start = performance.now();
      const { bytes } = await render(tree);
      const ms = performance.now() - start;
      const pages = (await PDFDocument.load(bytes, { updateMetadata: false })).getPageCount();
      console.log(`A ${pages}-page document rendered in ${Math.round(ms)} ms.`);
      expect(pages).toBeGreaterThanOrEqual(100);
      expect(ms).toBeLessThan(HANG_MS);
    },
    SCALING_TIMEOUT,
  );
});
