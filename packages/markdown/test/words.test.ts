// Moved from apps/web/test/markdown.test.ts and markdown-footnotes.test.ts with the code.
import { describe, expect, test } from 'vitest';
import { countWords, isSpace, parseMarkdown, wordsIn } from '../src';

describe('counting words', () => {
  test('counts words', () => {
    expect(countWords(parseMarkdown(''))).toBe(0);
    expect(countWords(parseMarkdown('# Title\n\nOne *two* **three** `four`.\n'))).toBe(5);
    expect(countWords(parseMarkdown('- a b\n- c\n\n> d e f\n'))).toBe(6);
  });

  test('counts a link’s text and not its address, and the markup not at all', () => {
    expect(
      countWords(parseMarkdown('[two words](http://example.com/a/b) ![alt text](x.png)\n')),
    ).toBe(4);
    expect(countWords(parseMarkdown('---\n\n***\n'))).toBe(0);
  });

  test('counts a note’s words with the document’s, and the reference mark not at all', () => {
    expect(countWords(parseMarkdown('One two[^a].\n\n[^a]: Three four five.\n'))).toBe(5);
    // A note never referenced isn't printed, so it isn't counted.
    expect(countWords(parseMarkdown('One two.\n\n[^a]: Three four five.\n'))).toBe(2);
    // The mark joins the words around it, as it prints nothing of its own between them.
    expect(countWords(parseMarkdown('word[^a]s\n\n[^a]: x\n'))).toBe(2);
  });
});

describe('wordsIn', () => {
  test('counts runs of characters between spaces', () => {
    expect(wordsIn('four  words\nacross\tlines')).toBe(4);
    expect(wordsIn('  ')).toBe(0);
    expect(wordsIn('')).toBe(0);
  });

  test('takes as a space exactly what /\\s/ does, every UTF-16 code unit', () => {
    for (let code = 0; code <= 0xffff; code++) {
      const ch = String.fromCharCode(code);
      expect(isSpace(code), `U+${code.toString(16).padStart(4, '0')}`).toBe(/\s/.test(ch));
    }
  });
});
