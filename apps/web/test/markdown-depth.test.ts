import { describe, expect, test } from 'vitest';
import { parseMarkdown } from '../app/markdown/parse';
import { PREVIEW_PROBLEMS, previewProblem } from '../app/markdown/preview';

// The nesting scan and the parser's refusal are tested with them, in @drafter/markdown
// (test/depth.test.ts); here, how the Preview says it.

/** The best of a few runs, in milliseconds: a busy machine only ever makes a run slower. */
function best(run: () => unknown, tries = 3): number {
  let fastest = Number.POSITIVE_INFINITY;
  for (let k = 0; k < tries; k++) {
    const start = performance.now();
    run();
    fastest = Math.min(fastest, performance.now() - start);
  }
  return fastest;
}

const deepError = (source: string): unknown => {
  try {
    parseMarkdown(source);
  } catch (error) {
    return error;
  }
  return undefined;
};

/** The two inputs that held the parser for seconds: definitions nested a line each, and a line of list marks. */
const NESTED_NOTES = Array.from({ length: 5_000 }, (_, i) => `${i ? '    ' : ''}[^a]: x`).join(
  '\n',
);
const LIST_LINE = `${'- '.repeat(2_400)}x`;

describe('a document nested too deeply', () => {
  test('is said at once, as the Preview says a document too deep for its stack', () => {
    const hostile = [NESTED_NOTES, LIST_LINE, `${'>'.repeat(5_000)} x`];
    // A byte-order mark, which the parser skips, or other line endings, change nothing.
    const variants = hostile.flatMap((source) => [
      source,
      `\uFEFF${source}`,
      source.replaceAll('\n', '\r\n'),
      `\uFEFF${source.replaceAll('\n', '\r')}`,
    ]);
    for (const source of variants) {
      const error = deepError(source);
      expect(error).toBeInstanceOf(RangeError);
      expect(previewProblem(error)).toBe('deep');
      // The worker sends only the message: it says the same.
      expect(previewProblem((error as Error).message)).toBe('deep');
      expect(best(() => deepError(source))).toBeLessThan(100);
    }
    expect(PREVIEW_PROBLEMS.deep).toBe(
      'This document is nested too deeply to preview. Your text is safe in the Source.',
    );
  });
});
