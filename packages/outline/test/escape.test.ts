import { describe, expect, test } from 'vitest';
import { markdownText } from '../src';

describe('markdownText', () => {
  test('escapes every character CommonMark would read', () => {
    // Anywhere in a line.
    expect(markdownText('a\\b')).toBe('a\\\\b');
    expect(markdownText('a `b` c')).toBe('a \\`b\\` c');
    expect(markdownText('a *b* c')).toBe('a \\*b\\* c');
    expect(markdownText('a _b_ c')).toBe('a \\_b\\_ c');
    expect(markdownText('see [b]')).toBe('see \\[b\\]');
    expect(markdownText('a <b> c')).toBe('a \\<b\\> c');
    expect(markdownText('fish &amp; chips')).toBe('fish \\&amp; chips');
    expect(markdownText('look!')).toBe('look\\!');
    expect(markdownText('a | b')).toBe('a \\| b');
    expect(markdownText('~~gone~~')).toBe('\\~\\~gone\\~\\~');
    // At a line's start.
    expect(markdownText('# not a heading')).toBe('\\# not a heading');
    expect(markdownText('+ not a list')).toBe('\\+ not a list');
    expect(markdownText('- not a list')).toBe('\\- not a list');
    expect(markdownText('= not a synopsis')).toBe('\\= not a synopsis');
    expect(markdownText('> not a quote')).toBe('\\> not a quote');
    expect(markdownText('1. not a list')).toBe('1\\. not a list');
    expect(markdownText('2) not a list')).toBe('2\\) not a list');
    expect(markdownText('---')).toBe('\\---');
    expect(markdownText('Title\n===')).toBe('Title\\\n\\===');
    // At a line's end.
    expect(markdownText('a back\\')).toBe('a back\\\\');
    expect(markdownText('two spaces  ')).toBe('two spaces');
    expect(markdownText('Room #')).toBe('Room \\#');
    // Leading spaces, which would make a code block, are taken off.
    expect(markdownText('    code?')).toBe('code?');
    // Lines are joined by hard breaks.
    expect(markdownText('one\ntwo')).toBe('one\\\ntwo');
  });

  test('leaves plain words alone', () => {
    expect(markdownText("INT. KITCHEN - NIGHT. Margaret's #1 fan, 11:40.")).toBe(
      "INT. KITCHEN - NIGHT. Margaret's #1 fan, 11:40.",
    );
  });
});
