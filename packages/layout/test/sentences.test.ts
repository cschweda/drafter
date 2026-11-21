import { sentenceEnds } from '@drafter/layout';
import { describe, expect, it } from 'vitest';

/** The text cut at each sentence end: what would stay on a page, and what would start the next. */
function cut(text: string): string[] {
  const out: string[] = [];
  let at = 0;
  for (const end of sentenceEnds(text)) {
    out.push(text.slice(at, end));
    at = end;
  }
  out.push(text.slice(at));
  return out.map((s) => s.trim());
}

describe('sentenceEnds', () => {
  it('finds the end of each sentence that another follows', () => {
    expect(cut('The door gives. Marlow steps through. He waits.')).toEqual([
      'The door gives.',
      'Marlow steps through.',
      'He waits.',
    ]);
  });

  it('gives the place just past the mark', () => {
    expect(sentenceEnds('Go. Now.')).toEqual([3]);
  });

  it('leaves the end of the text to the caller', () => {
    expect(sentenceEnds('One sentence only.')).toEqual([]);
    expect(sentenceEnds('')).toEqual([]);
  });

  it('ends at a question mark, an exclamation mark, and marks together', () => {
    expect(cut('Who? Me! Really?! Yes.')).toEqual(['Who?', 'Me!', 'Really?!', 'Yes.']);
  });

  it('takes closing quotes and brackets with the sentence', () => {
    expect(cut('"Go." He leaves. (She stays.) They wait.')).toEqual([
      '"Go."',
      'He leaves.',
      '(She stays.)',
      'They wait.',
    ]);
    expect(cut('“Go.” He leaves. ‘Now.’ She nods.')).toEqual([
      '“Go.”',
      'He leaves.',
      '‘Now.’',
      'She nods.',
    ]);
  });

  it('ends at dots only when a sentence starts after them', () => {
    expect(cut('He stops... then goes on. She waits.')).toEqual([
      'He stops... then goes on.',
      'She waits.',
    ]);
    expect(cut('He stops... Then he goes on.')).toEqual(['He stops...', 'Then he goes on.']);
    expect(cut('He stops… Then he goes on.')).toEqual(['He stops…', 'Then he goes on.']);
  });

  it('lets a sentence start with a digit, a quote, a bracket, or a dash', () => {
    expect(cut('He counts. 3 are left. "Run." (They do.) -- Too late. — Gone.')).toEqual([
      'He counts.',
      '3 are left.',
      '"Run."',
      '(They do.)',
      '-- Too late.',
      '— Gone.',
    ]);
  });

  it('does not end where a small letter follows', () => {
    expect(cut('It cost $4.50 a.m. prices, i.e. too much. She pays.')).toEqual([
      'It cost $4.50 a.m. prices, i.e. too much.',
      'She pays.',
    ]);
  });

  it('does not end at a title or an abbreviation', () => {
    for (const word of [
      'Dr',
      'Mr',
      'Mrs',
      'Ms',
      'St',
      'Lt',
      'Sgt',
      'Capt',
      'Col',
      'Gen',
      'Sen',
      'Rev',
      'Prof',
      'vs',
      'etc',
    ]) {
      expect(sentenceEnds(`They meet ${word}. Vance at noon`), word).toEqual([]);
    }
    expect(sentenceEnds('DR. VANCE enters')).toEqual([]);
  });

  it('ends at a word that only finishes like an abbreviation', () => {
    expect(cut('He is the last. Then none.')).toEqual(['He is the last.', 'Then none.']);
  });

  it('does not end at an initial', () => {
    expect(sentenceEnds('J. Edgar Hoover and the U.S. Marshals')).toEqual([]);
  });

  it('ends at an abbreviation followed by more marks', () => {
    expect(cut('Guns, knives, etc... Then silence.')).toEqual([
      'Guns, knives, etc...',
      'Then silence.',
    ]);
  });

  it('ends before two spaces as before one', () => {
    expect(sentenceEnds('Go.  Now.')).toEqual([3]);
  });

  it('needs a space after the mark', () => {
    expect(sentenceEnds('See drafter.Dev and file.Txt')).toEqual([]);
  });

  it('starts a sentence at a capital of any alphabet', () => {
    expect(cut('Il sort. Élise attend. Она ждёт.')).toEqual([
      'Il sort.',
      'Élise attend.',
      'Она ждёт.',
    ]);
  });

  it('looks only between the places it is given', () => {
    const text = 'One. Two. Three. Four.';
    expect(sentenceEnds(text)).toEqual([4, 9, 16]);
    expect(sentenceEnds(text, 4)).toEqual([9, 16]);
    expect(sentenceEnds(text, 4, 9)).toEqual([9]);
    expect(sentenceEnds(text, 5, 8)).toEqual([]);
  });

  it('reads half a million characters without slowing down', () => {
    const text = 'Word. '.repeat(100_000);
    expect(sentenceEnds(text, 300_000, 300_060).length).toBe(10);
  });
});
