import { describe, expect, it } from 'vitest';
import { novelStructure } from '../src';
import { MAX_GROWTH, SCALING_TIMEOUT, scaling } from './scaling';

/** About `words` words: chapters of sections of paragraphs, with scene breaks and a fence. */
function novel(words: number): string {
  const parts: string[] = [];
  let count = 0;
  let c = 0;
  while (count < words) {
    parts.push(`# Chapter ${c++}\n`);
    for (let s = 0; s < 4; s++) {
      parts.push(
        `## Section ${s}\n`,
        'The lamp burned low and the keeper counted the boats home again. '.repeat(8),
        '',
        '***',
        '',
      );
      count += 8 * 12 + 3;
    }
    parts.push('```', '# not a chapter', '```', '');
  }
  return `${parts.join('\n')}\n<!-- drafter {"template":"novel"} -->\n`;
}

describe('novelStructure scaling', () => {
  it('reads 120,000 words in under 50 ms', () => {
    const text = novel(120_000);
    novelStructure(text);
    const start = performance.now();
    novelStructure(text);
    expect(performance.now() - start).toBeLessThan(50);
  });
  it('grows linearly', { timeout: SCALING_TIMEOUT }, () => {
    const result = scaling(novel, novelStructure, 30_000);
    expect(result.growth).toBeLessThan(MAX_GROWTH);
  });
});
