import { describe, expect, it } from 'vitest';
import { layoutDocument } from '../src/document/layout';
import { fontMeasure } from '../src/document/measure';
import type { DocNode } from '../src/document/tree';
import { md } from './document-helpers';
import { documentFonts } from './helpers';
import { HANG_MS, MAX_GROWTH, SCALING_TIMEOUT, scaling } from './scaling';

// Invented words, so no sample text comes from anywhere else.
const WORDS = ['vorn', 'taleb', 'quisp', 'marrowy', 'ost', 'plenk', 'dravish', 'ulm', 'senner'];
const words = (count: number, seed: number) =>
  Array.from({ length: count }, (_, i) => WORDS[(seed * 7 + i * 3) % WORDS.length]).join(' ');

/** A document of `n` sections: a heading, three paragraphs, a list, a quote, and a code block. */
function document(n: number): DocNode {
  const sections: string[] = [];
  for (let s = 0; s < n; s++) {
    sections.push(
      `## ${words(4, s)} ${s}`,
      words(60, s),
      `${words(40, s + 1)} *${words(5, s)}* and [${words(3, s)}](https://example.com/${s}).`,
      words(80, s + 2),
      `- ${words(12, s)}\n- ${words(20, s + 1)}\n  - ${words(8, s + 2)}\n- ${words(6, s + 3)}`,
      `> ${words(30, s)}\n>\n> ${words(18, s + 1)}`,
      `\`\`\`\n${words(10, s)}\n  ${words(30, s + 1)}\n\`\`\``,
    );
  }
  return md(sections.join('\n\n'));
}

describe('layoutDocument’s cost', () => {
  it(
    'layoutDocument grows linearly',
    () => {
      const measure = fontMeasure(documentFonts);
      const { growth, large } = scaling(
        document,
        (tree) => layoutDocument(tree, { paper: 'letter', measure }),
        25,
      );
      expect(large).toBeLessThan(HANG_MS);
      expect(growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );
});
