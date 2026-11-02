import { describe, expect, test } from 'vitest';
import { besideNames } from '../src/index';

describe('the names beside a work', () => {
  test('are the work’s, cleaned as the desktop app cleans them', () => {
    expect(besideNames('Boca.fountain')).toEqual({
      file: 'Boca.fountain',
      work: 'Boca',
      folder: 'Boca drafts',
      cuts: 'Boca.fountain.cuts.md',
    });
    expect(besideNames('a:b.md')).toMatchObject({ work: 'a_b', cuts: 'a_b.md.cuts.md' });
    expect(besideNames('Signal Hill – 101.fountain')).toMatchObject({
      work: 'Signal Hill – 101',
      folder: 'Signal Hill – 101 drafts',
      cuts: 'Signal Hill – 101.fountain.cuts.md',
    });
    expect(besideNames('...')).toBeNull();
    // A name that is only an extension keeps it as the work's name (as the app always has).
    expect(besideNames('.fountain')).toMatchObject({ work: 'fountain' });
  });
});
