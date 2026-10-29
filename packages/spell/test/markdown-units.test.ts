import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { tokenize } from '../src/tokens';
import { markdownUnits } from '../src/units';

const doc = readFileSync(new URL('./fixtures/doc.md', import.meta.url), 'utf8');

function checked(source: string): string[] {
  const out: string[] = [];
  for (const unit of markdownUnits(source)) {
    for (let i = 0; i < unit.text.length; i++) {
      if (unit.text[i] !== ' ') expect(unit.text[i]).toBe(source[unit.from + i]);
    }
    for (const token of tokenize(unit.text, unit.from)) {
      expect(source.slice(token.from, token.to).replaceAll('’', "'")).toBe(token.word);
      out.push(token.word);
    }
  }
  return out;
}

describe('markdownUnits', () => {
  test('blanks fenced, indented, and inline code', () => {
    const words = checked(doc);
    for (const hidden of ['zzqxcode', 'fast', 'zzqxdouble', 'zzqxfence', 'const', 'zzqxindented']) {
      expect(words).not.toContain(hidden);
    }
    expect(words).toEqual(expect.arrayContaining(['Run', 'before', 'read', 'too']));
    // An unclosed fence runs to the end; a lone backtick stays text.
    expect(checked('Before.\n\n~~~\nzzqx\n\nzzqy\n')).toEqual(['Before']);
    expect(checked('a `lone tick')).toEqual(['a', 'lone', 'tick']);
    // Four spaces inside a paragraph are a continuation, not code.
    expect(checked('One line\n    and more')).toEqual(['One', 'line', 'and', 'more']);
  });

  test('blanks front matter, HTML tags, autolinks, and link destinations', () => {
    const words = checked(doc);
    expect(words.filter((w) => /zzqx/i.test(w))).toEqual([]);
    expect(words).not.toContain('div');
    expect(words).not.toContain('amp');
    expect(words).not.toContain('title');
    expect(checked(doc.replaceAll('\n', '\r\n'))).toEqual(words);
  });

  test('keeps link text', () => {
    expect(checked(doc)).toEqual([
      'Notes',
      'on',
      'the',
      'second',
      'draft',
      'The',
      'second',
      'act',
      'drags',
      'See',
      'and',
      'the',
      'outline',
      'or',
      'the',
      'reference',
      'Run',
      'before',
      'the',
      'read',
      'and',
      'too',
      'Plain',
      'words',
      'inside',
      'Write',
      'to',
      'wait',
    ]);
  });
});
