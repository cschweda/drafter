import { describe, expect, it } from 'vitest';
import { formatOf } from '../src/formats';

describe('formatOf', () => {
  it('every kind Drafter reads, in any case', () => {
    const cases: Array<[string, string]> = [
      ['Signal Hill.fountain', 'fountain'],
      ['pilot.spmd', 'fountain'],
      ['pilot.txt', 'text'],
      ['bible.md', 'markdown'],
      ['bible.markdown', 'markdown'],
      ['old.fdx', 'fdx'],
      ['draft.highland', 'highland'],
      ['draft.fadein', 'fadein'],
      ['export.html', 'html'],
      ['export.htm', 'html'],
      ['export.epub', 'epub'],
    ];
    for (const [name, format] of cases) {
      expect(formatOf(name)).toBe(format);
      expect(formatOf(name.toUpperCase())).toBe(format);
      const dot = name.lastIndexOf('.');
      const mixed = name.slice(0, dot + 1) + name[dot + 1]?.toUpperCase() + name.slice(dot + 2);
      expect(formatOf(mixed)).toBe(format);
    }
  });

  it('other kinds are null', () => {
    for (const name of [
      'a.pdf',
      'a.docx',
      'a.json',
      'fountain',
      'a.fountain.bak',
      '.fountain',
      'a.',
    ])
      expect(formatOf(name)).toBeNull();
  });
});
