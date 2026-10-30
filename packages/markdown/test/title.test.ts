// Moved from apps/web/test/markdown.test.ts and markdown-footnotes.test.ts with the code.
import { describe, expect, test } from 'vitest';
import { markdownTitle, retitleMarkdown } from '../src';
import { MAX_GROWTH, SCALING_TIMEOUT, scaling } from './scaling';

describe('the title of a Markdown document', () => {
  test('is the first heading, without its markup', () => {
    expect(markdownTitle('Some notes\n\n# The *Long* Treatment\n\n## Later\n')).toBe(
      'The Long Treatment',
    );
    expect(markdownTitle('  ## Closing hashes ##  \n')).toBe('Closing hashes');
    expect(markdownTitle('Setext title\n====\n')).toBe('Setext title');
  });

  test('is nothing when there is no heading, and skips a heading in a code fence', () => {
    expect(markdownTitle('just words\n')).toBeUndefined();
    expect(markdownTitle('```\n# not a heading\n```\n')).toBeUndefined();
    expect(markdownTitle('#\n')).toBeUndefined();
    expect(markdownTitle('#hashtag\n')).toBeUndefined();
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
});

describe('naming a copy of a Markdown document', () => {
  test('replaces the first heading’s text, keeping its level, or puts a heading in front', () => {
    expect(retitleMarkdown('Intro\n\n## Old *name*\n\n# Other\n', 'New (copy)')).toBe(
      'Intro\n\n## New (copy)\n\n# Other\n',
    );
    expect(retitleMarkdown('just words\n', 'Notes (copy)')).toBe('# Notes (copy)\n\njust words\n');
    expect(markdownTitle(retitleMarkdown('```\n# code\n```\n', 'T'))).toBe('T');
  });
});
