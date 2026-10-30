import { describe, expect, test } from 'vitest';
import { markdownText } from '../src';
import { escapeInline, markdownHeading } from '../src/escape';

describe('markdownText', () => {
  test('escapes every character CommonMark would read', () => {
    // Anywhere in a line.
    expect(markdownText('a\\b')).toBe('a\\\\b');
    expect(markdownText('a `b` c')).toBe('a \\`b\\` c');
    expect(markdownText('a *b* c')).toBe('a \\*b\\* c');
    expect(markdownText('a _b_ c')).toBe('a \\_b\\_ c');
    expect(markdownText('_a a_ a__b _1')).toBe('\\_a a\\_ a\\_\\_b \\_1');
    expect(markdownText('see [b]')).toBe('see \\[b]');
    expect(markdownText('a <b> c')).toBe('a \\<b> c');
    expect(markdownText('a </b> <!-- c <?x')).toBe('a \\</b> \\<!-- c \\<?x');
    // An email autolink, which may start with a digit or most punctuation.
    expect(markdownText('Call <1@a.co> now')).toBe('Call \\<1@a.co> now');
    for (const email of ['<+bob@x.org>', '<#1@x>', '<-@y>', '<.a@b>']) {
      expect(markdownText(email), email).toBe(`\\${email}`);
    }
    expect(markdownText('fish &amp; chips &#42; &#x2a;')).toBe(
      'fish \\&amp; chips \\&#42; \\&#x2a;',
    );
    expect(markdownText('~~gone~~')).toBe('\\~\\~gone\\~\\~');
    expect(markdownText('| --- |')).toBe('\\| --- \\|');
    expect(markdownText(':--|--:')).toBe(':--\\|--:');
    // GFM reads a delimiter row without a pipe under a one-cell line as a table too.
    expect(markdownText(':--')).toBe(':\\--');
    expect(markdownText('--:')).toBe('\\--:');
    expect(markdownText(':-:')).toBe(':\\-:');
    expect(markdownText('-:')).toBe('\\-:');
    expect(markdownText(' :----: ')).toBe(':\\----:');
    expect(markdownText('a\n:--')).toBe('a\\\n:\\--');
    expect(markdownText('\u3000:-- ')).toBe('\u3000:\\--');
    expect(markdownText('\v--:')).toBe('\v\\--:');
    // At a line's start.
    expect(markdownText('# not a heading')).toBe('\\# not a heading');
    expect(markdownText('###### six')).toBe('\\###### six');
    expect(markdownText('#')).toBe('\\#');
    expect(markdownText('+ not a list')).toBe('\\+ not a list');
    expect(markdownText('- not a list')).toBe('\\- not a list');
    expect(markdownText('-')).toBe('\\-');
    expect(markdownText('> not a quote')).toBe('\\> not a quote');
    expect(markdownText('>no space')).toBe('\\>no space');
    expect(markdownText('1. not a list')).toBe('1\\. not a list');
    expect(markdownText('2) not a list')).toBe('2\\) not a list');
    expect(markdownText('3.')).toBe('3\\.');
    expect(markdownText('---')).toBe('\\---');
    expect(markdownText('- - -')).toBe('\\- - -');
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

  test('leaves alone what CommonMark reads as text where it stands', () => {
    expect(markdownText("INT. KITCHEN - NIGHT. Margaret's #1 fan, 11:40.")).toBe(
      "INT. KITCHEN - NIGHT. Margaret's #1 fan, 11:40.",
    );
    for (const plain of [
      'Now! Look!',
      '(O.S.) means off screen',
      'a ] b',
      'x < 3 and 4 > y',
      'Fish & chips &c.',
      'look | here',
      'a|b',
      '--and then',
      '-- and then',
      '+1 for that',
      '#hashtag',
      '####### seven',
      '= not a synopsis',
      '== x',
      '1.5 cups',
      '1234567890. too long for a list',
      'my_page and snake_case',
      'https://example.com/my_page',
      'café_crème 1_000',
      'a@b.co <@x>',
      ':: and :',
    ]) {
      expect(markdownText(plain), plain).toBe(plain);
    }
  });
});

describe('escapeInline', () => {
  test("escapes `_` at a piece's edge, where emphasis marks may stand beside it", () => {
    expect(escapeInline('a_b', 0)).toBe('a_b');
    expect(escapeInline('a_b', 1)).toBe('\\_b');
    expect(escapeInline('a_b', 0, 2)).toBe('a\\_');
  });
});

describe('markdownHeading', () => {
  test("escapes a heading's text without the guards a line's start needs", () => {
    expect(markdownHeading('1. INT. KITCHEN - NIGHT')).toBe('1. INT. KITCHEN - NIGHT');
    expect(markdownHeading('- Act *One* -')).toBe('- Act \\*One\\* -');
    expect(markdownHeading('> Part #')).toBe('> Part \\#');
    expect(markdownHeading('  two\nlines  ')).toBe('two lines');
  });
});
